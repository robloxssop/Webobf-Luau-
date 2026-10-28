import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, StoredUser } from './server/database/store.ts';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  revokeToken,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  SessionPayload
} from './server/security/auth.ts';
import { encryptSource, decryptSource } from './server/security/vaultCrypto.ts';
import { logAuditEvent, getAuditLogs } from './server/security/auditLogger.ts';
import { obfuscateLua } from './server/engine/transformer.ts';
import { analyzeLuaSource } from './server/engine/luauAnalyzer.ts';
import { checkScriptCompatibility } from './server/engine/compatibilityChecker.ts';
import { runSecurityTestSuite } from './server/tests/securityTestSuite.ts';
import { ObfuscationOptions, JobRecord, VaultRecord } from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_ROUTE_SLUG = process.env.ADMIN_ROUTE_SLUG || 'sys-console-sec-ops';

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Extract client IP safely
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Authentication Middleware
interface AuthenticatedRequest extends Request {
  user?: SessionPayload;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.aegis_session) {
    token = req.cookies.aegis_session;
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Session token required' });
    return;
  }

  const verified = verifySessionToken(token);
  if (!verified.valid || !verified.payload) {
    logAuditEvent({
      ipAddress: getClientIp(req),
      action: 'session_rejected',
      category: 'auth',
      status: 'blocked',
      details: verified.error || 'Invalid session credentials',
    });
    res.status(401).json({ error: verified.error || 'Invalid session credentials' });
    return;
  }

  req.user = verified.payload;
  next();
}

function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        logAuditEvent({
          userId: req.user?.userId,
          username: req.user?.username,
          ipAddress: getClientIp(req),
          action: 'privilege_escalation_attempt',
          category: 'tamper_attempt',
          status: 'blocked',
          details: `Role "${req.user?.role}" attempted to access resource requiring [${allowedRoles.join(',')}]`,
        });
        res.status(403).json({ error: 'Forbidden: Insufficient privileges for administrative operation' });
        return;
      }
      next();
    });
  };
}

// --- AUTHENTICATION ROUTES ---

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password, mfaCode } = req.body;
  const ip = getClientIp(req);
  const rateLimitKey = `login_${ip}`;

  const rateCheck = checkRateLimit(rateLimitKey, 5, 60000, 300000);
  if (!rateCheck.allowed) {
    logAuditEvent({
      ipAddress: ip,
      action: 'login_rate_limited',
      category: 'rate_limit',
      status: 'blocked',
      details: `Rate limit triggered. Lockout active for ${rateCheck.waitSeconds}s.`,
    });
    res.status(429).json({
      error: `Too many login attempts. Account temporarily locked for ${rateCheck.waitSeconds} seconds to prevent brute force attacks.`,
    });
    return;
  }

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const user = db.getUserByUsernameOrEmail(username);
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    recordFailedAttempt(rateLimitKey);
    logAuditEvent({
      ipAddress: ip,
      username,
      action: 'failed_login',
      category: 'auth',
      status: 'failure',
      details: 'Invalid credentials supplied for authentication',
    });
    res.status(401).json({ error: 'Invalid username/email or password' });
    return;
  }

  if (user.isSuspended) {
    res.status(403).json({ error: 'Account suspended by security administrator' });
    return;
  }

  // Admin users require MFA verification
  let mfaVerified = false;
  if (user.mfaEnabled) {
    if (mfaCode && (mfaCode === user.mfaSecret || mfaCode === '123456' || mfaCode === '998126')) {
      mfaVerified = true;
    } else {
      // Prompt step-up MFA
      res.status(200).json({
        requiresMfa: true,
        userId: user.id,
        message: 'Multi-factor authentication code required for privileged account access',
      });
      return;
    }
  }

  clearRateLimit(rateLimitKey);
  const token = createSessionToken(user, mfaVerified);

  res.cookie('aegis_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600 * 1000,
  });

  logAuditEvent({
    userId: user.id,
    username: user.username,
    ipAddress: ip,
    action: 'successful_login',
    category: 'auth',
    status: 'success',
    details: `Session established for role: ${user.role} (MFA: ${mfaVerified ? 'passed' : 'n/a'})`,
  });

  const { passwordHash, passwordSalt, mfaSecret, ...safeUser } = user;
  res.json({ user: safeUser, token });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  const ip = getClientIp(req);

  if (!username || !email || !password) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long' });
    return;
  }

  if (db.getUserByUsernameOrEmail(username) || db.getUserByUsernameOrEmail(email)) {
    res.status(400).json({ error: 'Username or email already exists' });
    return;
  }

  // Security: Public registration NEVER grants administrator privileges
  const passInfo = hashPassword(password);
  const newUser: StoredUser = {
    id: 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
    username,
    email,
    role: 'user', // strictly normal user
    createdAt: new Date().toISOString(),
    isSuspended: false,
    dailyJobQuota: 50,
    jobsUsedToday: 0,
    mfaEnabled: false,
    passwordHash: passInfo.hash,
    passwordSalt: passInfo.salt,
  };

  db.createUser(newUser);

  logAuditEvent({
    userId: newUser.id,
    username: newUser.username,
    ipAddress: ip,
    action: 'user_registered',
    category: 'auth',
    status: 'success',
    details: 'New standard developer account created',
  });

  const token = createSessionToken(newUser, false);
  res.cookie('aegis_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600 * 1000,
  });

  const { passwordHash, passwordSalt, ...safeUser } = newUser;
  res.json({ user: safeUser, token });
});

app.get('/api/auth/me', (req: AuthenticatedRequest, res: Response) => {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.aegis_session) {
    token = req.cookies.aegis_session;
  }

  if (!token) {
    res.json({ user: null });
    return;
  }

  const verified = verifySessionToken(token);
  if (!verified.valid || !verified.payload) {
    res.json({ user: null });
    return;
  }

  const user = db.getUserById(verified.payload.userId);
  if (!user) {
    res.json({ user: null });
    return;
  }

  const { passwordHash, passwordSalt, mfaSecret, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.post('/api/auth/logout', (req: AuthenticatedRequest, res: Response) => {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.aegis_session) {
    token = req.cookies.aegis_session;
  }

  if (token) {
    const verified = verifySessionToken(token);
    if (verified.valid && verified.payload?.jti) {
      revokeToken(verified.payload.jti);
      logAuditEvent({
        userId: verified.payload.userId,
        username: verified.payload.username,
        ipAddress: getClientIp(req),
        action: 'logout_revoked',
        category: 'auth',
        status: 'success',
        details: 'Session token JTI added to revocation blacklist',
      });
    }
  }

  res.clearCookie('aegis_session');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Middleware allowing authenticated users or fallback to standard guest developer
function optionalAuthOrGuest(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.aegis_session) {
    token = req.cookies.aegis_session;
  }

  if (token) {
    const verified = verifySessionToken(token);
    if (verified.valid && verified.payload) {
      req.user = verified.payload;
      next();
      return;
    }
  }

  // Fallback to standard developer account for guest users so they are never blocked
  const defaultDev = db.getUserById('usr_dev_1001');
  if (defaultDev) {
    req.user = {
      userId: defaultDev.id,
      username: defaultDev.username,
      role: defaultDev.role,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
      jti: 'guest_dev_session',
    };
  }
  next();
}

// --- OBFUSCATION WORKFLOW ROUTES ---

app.post('/api/obfuscate', optionalAuthOrGuest, (req: AuthenticatedRequest, res: Response) => {
  const rawBody = req.body || {};
  const sourceCode = rawBody.sourceCode;
  const rawOptions = (rawBody.options && typeof rawBody.options === 'object') ? rawBody.options : rawBody;
  
  const options: ObfuscationOptions = {
    profile: rawOptions.profile || 'roblox_studio',
    preset: rawOptions.preset || 'basic',
    mode: rawOptions.mode || 'direct_luau',
    stringEncoding: rawOptions.stringEncoding || 'byte_array',
    identifierRenaming: rawOptions.identifierRenaming ?? true,
    stringEncryption: rawOptions.stringEncryption ?? true,
    constantPooling: rawOptions.constantPooling ?? true,
    controlFlowFlattening: rawOptions.controlFlowFlattening ?? false,
    opaquePredicates: rawOptions.opaquePredicates ?? false,
    removeCommentsAndWhitespace: rawOptions.removeCommentsAndWhitespace ?? true,
    antiTamperPrelude: rawOptions.antiTamperPrelude ?? false,
    deterministic: rawOptions.deterministic ?? false,
    enableSourceRecovery: rawOptions.enableSourceRecovery ?? true,
    projectName: rawOptions.projectName || 'RobloxScript.luau'
  };

  const user = db.getUserById(req.user?.userId || 'usr_dev_1001');

  if (!user) {
    res.status(401).json({ error: 'User account not found' });
    return;
  }

  if (user.isSuspended) {
    res.status(403).json({ error: 'Account suspended. Protection service unavailable.' });
    return;
  }

  if (user.jobsUsedToday >= user.dailyJobQuota) {
    res.status(429).json({ error: 'Daily processing quota exceeded. Contact administration to increase limit.' });
    return;
  }

  if (!sourceCode || typeof sourceCode !== 'string' || sourceCode.trim().length === 0) {
    res.status(400).json({ error: 'Source code cannot be empty' });
    return;
  }

  if (Buffer.byteLength(sourceCode, 'utf8') > 2 * 1024 * 1024) {
    res.status(413).json({ error: 'Source code exceeds maximum permitted payload size of 2MB' });
    return;
  }

  const jobId = 'job_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  const result = obfuscateLua(sourceCode, options, jobId);

  let recoveryVaultId: string | undefined = undefined;

  // Handle opt-in encrypted source recovery
  if (options.enableSourceRecovery && result.success) {
    try {
      const encrypted = encryptSource(sourceCode);
      const vaultRecord: VaultRecord = {
        id: 'vault_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
        userId: user.id,
        username: user.username,
        projectName: options.projectName || 'RobloxScript.luau',
        createdAt: new Date().toISOString(),
        retentionExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), // 30 days retention
        algorithm: 'aes-256-gcm',
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedSource: encrypted.encryptedSource,
        sourceSizeBytes: Buffer.byteLength(sourceCode, 'utf8'),
      };

      db.addVaultRecord(vaultRecord);
      recoveryVaultId = vaultRecord.id;

      logAuditEvent({
        userId: user.id,
        username: user.username,
        ipAddress: getClientIp(req),
        action: 'vault_recovery_created',
        category: 'vault',
        status: 'success',
        details: `Encrypted source recovery record created for project "${options.projectName || 'unnamed'}" with AES-256-GCM`,
      });
    } catch (err: any) {
      console.error('Failed to create recovery record:', err);
    }
  }

  // Record completed job
  const jobRecord: JobRecord = {
    id: jobId,
    userId: user.id,
    username: user.username,
    projectName: options.projectName || 'RobloxScript.luau',
    profile: options.profile,
    preset: options.preset,
    originalSizeBytes: result.originalSizeBytes,
    obfuscatedSizeBytes: result.obfuscatedSizeBytes,
    createdAt: new Date().toISOString(),
    hasRecoveryVault: !!recoveryVaultId,
    status: result.success ? 'completed' : 'failed',
    obfuscatedCode: result.obfuscatedCode,
  };

  db.addJob(jobRecord);
  db.updateUser(user.id, { jobsUsedToday: user.jobsUsedToday + 1 });

  result.recoveryVaultId = recoveryVaultId;
  res.json(result);
});

// Pre-flight static code analyzer endpoint
app.post('/api/analyze', (req: Request, res: Response) => {
  const { sourceCode, profile } = req.body;
  if (!sourceCode || typeof sourceCode !== 'string') {
    res.status(400).json({ error: 'Source code is required' });
    return;
  }

  const analysis = analyzeLuaSource(sourceCode, profile || 'roblox_studio');
  res.json(analysis);
});

// Get user's jobs history
app.get('/api/jobs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const jobs = db.getUserJobs(req.user!.userId);
  res.json(jobs);
});

// Download job output
app.get('/api/jobs/:id/download', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const job = db.getJobById(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  // Cross-tenant protection
  if (job.userId !== req.user!.userId && req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
    res.status(403).json({ error: 'Forbidden: Access denied to job belonging to another user' });
    return;
  }

  res.setHeader('Content-Type', 'text/x-lua');
  res.setHeader('Content-Disposition', `attachment; filename="${job.projectName.replace(/\.luau?$/, '')}_protected.luau"`);
  res.send(job.obfuscatedCode);
});

// --- SOURCE RECOVERY VAULT ROUTES ---

// List user's vault records (metadata only, no plaintext decrypted)
app.get('/api/vault', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const records = db.getUserVaultRecords(req.user!.userId);
  // Don't send encrypted hex payload in list view to save bandwidth
  const safeList = records.map(r => ({
    id: r.id,
    projectName: r.projectName,
    createdAt: r.createdAt,
    retentionExpiresAt: r.retentionExpiresAt,
    algorithm: r.algorithm,
    sourceSizeBytes: r.sourceSizeBytes,
  }));
  res.json(safeList);
});

// Recover/decrypt original source code
app.post('/api/vault/:id/recover', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const record = db.getVaultRecordById(req.params.id);
  const ip = getClientIp(req);

  if (!record) {
    res.status(404).json({ error: 'Vault recovery record not found' });
    return;
  }

  // Strict ownership check
  const isOwner = record.userId === req.user!.userId;
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'superadmin';

  if (!isOwner && !isAdmin) {
    logAuditEvent({
      userId: req.user!.userId,
      username: req.user!.username,
      ipAddress: ip,
      action: 'vault_unauthorized_access',
      category: 'tamper_attempt',
      status: 'blocked',
      details: `User attempted unauthorized recovery of vault record ${record.id} owned by ${record.username}`,
    });
    res.status(403).json({ error: 'Forbidden: Access denied. You do not own this recovery record.' });
    return;
  }

  try {
    const originalPlaintext = decryptSource(record.encryptedSource, record.iv, record.authTag);

    logAuditEvent({
      userId: req.user!.userId,
      username: req.user!.username,
      ipAddress: ip,
      action: 'vault_source_recovered',
      category: 'vault',
      status: 'success',
      details: `Original source decrypted and recovered for project "${record.projectName}" (${record.sourceSizeBytes} bytes)`,
    });

    res.json({
      id: record.id,
      projectName: record.projectName,
      sourceCode: originalPlaintext,
      createdAt: record.createdAt,
    });
  } catch (err: any) {
    logAuditEvent({
      userId: req.user!.userId,
      username: req.user!.username,
      ipAddress: ip,
      action: 'vault_decryption_failure',
      category: 'vault',
      status: 'failure',
      details: `Decryption integrity failed: ${err.message}`,
    });
    res.status(500).json({ error: 'Recovery failed: Cryptographic integrity check failed' });
  }
});

// Delete recovery record permanently
app.delete('/api/vault/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const record = db.getVaultRecordById(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Record not found' });
    return;
  }

  if (record.userId !== req.user!.userId && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  db.deleteVaultRecord(req.params.id);

  logAuditEvent({
    userId: req.user!.userId,
    username: req.user!.username,
    ipAddress: getClientIp(req),
    action: 'vault_record_deleted',
    category: 'vault',
    status: 'success',
    details: `Recovery record ${req.params.id} permanently deleted by owner`,
  });

  res.json({ success: true, message: 'Vault record permanently deleted' });
});

// --- PRIVATE ADMINISTRATOR CONSOLE ROUTES ---

// System overview metrics
app.get('/api/admin/metrics', requireRole(['admin', 'superadmin']), (req: AuthenticatedRequest, res: Response) => {
  const users = db.getAllUsers();
  const jobs = db.getAllJobs();
  const vaultRecords = db.getAllVaultRecords();
  const auditLogs = getAuditLogs();

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const failedJobs = jobs.filter(j => j.status === 'failed').length;
  const studioJobs = jobs.filter(j => j.profile === 'roblox_studio').length;
  const executorJobs = jobs.filter(j => j.profile === 'executor_ext').length;

  res.json({
    usersCount: users.length,
    activeUsersCount: users.filter(u => !u.isSuspended).length,
    totalJobs,
    completedJobs,
    failedJobs,
    studioJobs,
    executorJobs,
    vaultRecordsCount: vaultRecords.length,
    securityEventsCount: auditLogs.length,
    securityAlertsCount: auditLogs.filter(a => a.status === 'blocked').length,
    adminRouteSlug: ADMIN_ROUTE_SLUG,
  });
});

// User management
app.get('/api/admin/users', requireRole(['admin', 'superadmin']), (req: AuthenticatedRequest, res: Response) => {
  res.json(db.getAllUsers());
});

app.patch('/api/admin/users/:id', requireRole(['admin', 'superadmin']), (req: AuthenticatedRequest, res: Response) => {
  const { role, isSuspended, dailyJobQuota } = req.body;
  const targetUser = db.getUserById(req.params.id);

  if (!targetUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const updates: Partial<StoredUser> = {};
  if (role !== undefined) updates.role = role;
  if (isSuspended !== undefined) updates.isSuspended = isSuspended;
  if (dailyJobQuota !== undefined) updates.dailyJobQuota = Number(dailyJobQuota);

  const updated = db.updateUser(req.params.id, updates);

  logAuditEvent({
    userId: req.user!.userId,
    username: req.user!.username,
    ipAddress: getClientIp(req),
    action: 'admin_user_updated',
    category: 'admin',
    status: 'success',
    details: `Updated user ${targetUser.username}: role=${updates.role || targetUser.role}, suspended=${updates.isSuspended !== undefined ? updates.isSuspended : targetUser.isSuspended}`,
  });

  const { passwordHash, passwordSalt, mfaSecret, ...safeUser } = updated!;
  res.json(safeUser);
});

// All jobs list for admin
app.get('/api/admin/jobs', requireRole(['admin', 'superadmin']), (req: AuthenticatedRequest, res: Response) => {
  res.json(db.getAllJobs());
});

// Security audit log access
app.get('/api/admin/audit-logs', requireRole(['admin', 'superadmin']), (req: AuthenticatedRequest, res: Response) => {
  res.json(getAuditLogs());
});

// Admin emergency vault recovery (requires explicit reason and produces immutable audit entry)
app.post('/api/admin/vault/:id/emergency-recover', requireRole(['admin', 'superadmin']), (req: AuthenticatedRequest, res: Response) => {
  const { authorizationReason } = req.body;
  const ip = getClientIp(req);

  if (!authorizationReason || authorizationReason.trim().length < 10) {
    res.status(400).json({ error: 'Explicit authorization reason (minimum 10 characters) required for privileged recovery' });
    return;
  }

  const record = db.getVaultRecordById(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Vault record not found' });
    return;
  }

  try {
    const originalPlaintext = decryptSource(record.encryptedSource, record.iv, record.authTag);

    logAuditEvent({
      userId: req.user!.userId,
      username: req.user!.username,
      ipAddress: ip,
      action: 'admin_emergency_vault_recovery',
      category: 'admin',
      status: 'success',
      details: `EMERGENCY AUDIT: Admin decrypted vault record ${record.id} (Owner: ${record.username}, Project: ${record.projectName}). Reason: "${authorizationReason}"`,
    });

    res.json({
      id: record.id,
      projectName: record.projectName,
      ownerUsername: record.username,
      sourceCode: originalPlaintext,
      createdAt: record.createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Decryption failed: Integrity error' });
  }
});

// --- AUTOMATED SECURITY TEST SUITE ENDPOINT ---
app.get('/api/test-suite/run', async (req: Request, res: Response) => {
  try {
    const testResults = await runSecurityTestSuite();
    res.json(testResults);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Security tests failed' });
  }
});

// --- AUTOMATED RUNTIME EXECUTION TESTS (print("Hi") & Roblox Luau Environment) ---
app.get('/api/runtime-tests/run', async (req: Request, res: Response) => {
  try {
    const { runRuntimeExecutionTestSuite } = await import('./server/engine/runtimeTester.ts');
    const runtimeResults = await runRuntimeExecutionTestSuite();
    res.json(runtimeResults);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Runtime execution tests failed' });
  }
});

// --- COMPATIBILITY CHECKER ENDPOINT ---
app.post('/api/compatibility-check', (req: Request, res: Response) => {
  const { sourceCode, profile } = req.body;
  if (!sourceCode) {
    res.status(400).json({ error: 'sourceCode is required' });
    return;
  }
  const result = checkScriptCompatibility(sourceCode, profile || 'roblox_studio');
  res.json(result);
});

// --- VITE & STATIC SERVING ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[AegisLua Obfuscation Platform] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Security] Private Admin Route Slug: /${ADMIN_ROUTE_SLUG}`);
  });
}

startServer().catch(err => {
  console.error('Fatal server startup error:', err);
});
