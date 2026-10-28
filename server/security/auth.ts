import crypto from 'crypto';
import { User, UserRole } from '../../src/types/index.ts';
import { logAuditEvent } from './auditLogger.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'aegis_jwt_signing_secret_min_32_characters_length_secure_prod_2026';

// In-memory revoked token set
const revokedTokens = new Set<string>();

export interface SessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  mfaVerified?: boolean;
  issuedAt: number;
  expiresAt: number;
  jti: string; // unique token ID
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const generatedSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, generatedSalt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt: generatedSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const result = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(result, 'hex'));
}

export function createSessionToken(user: User, mfaVerified = false, ttlMinutes = 60): string {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomBytes(16).toString('hex');

  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    mfaVerified,
    issuedAt: now,
    expiresAt: now + (ttlMinutes * 60),
    jti,
  };

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

export function verifySessionToken(token: string): { valid: boolean; payload?: SessionPayload; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'No token provided' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [header, body, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return { valid: false, error: 'Cryptographic signature mismatch' };
  }

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);

    if (payload.expiresAt < now) {
      return { valid: false, error: 'Session has expired' };
    }

    if (revokedTokens.has(payload.jti)) {
      return { valid: false, error: 'Session has been revoked' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Invalid token payload' };
  }
}

export function revokeToken(jti: string): void {
  revokedTokens.add(jti);
}

// In-memory rate limiting tracker for authentication and recovery attempts
interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

const loginAttempts = new Map<string, AttemptRecord>();

export function checkRateLimit(key: string, maxAttempts = 5, windowMs = 60000, lockoutMs = 300000): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record) {
    return { allowed: true };
  }

  if (record.lockedUntil && record.lockedUntil > now) {
    return { allowed: false, waitSeconds: Math.ceil((record.lockedUntil - now) / 1000) };
  }

  if (now - record.firstAttempt > windowMs) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  if (record.count >= maxAttempts) {
    record.lockedUntil = now + lockoutMs;
    loginAttempts.set(key, record);
    return { allowed: false, waitSeconds: Math.ceil(lockoutMs / 1000) };
  }

  return { allowed: true };
}

export function recordFailedAttempt(key: string, maxAttempts = 5, lockoutMs = 300000): void {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || (now - record.firstAttempt > 60000)) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
    if (record.count >= maxAttempts) {
      record.lockedUntil = now + lockoutMs;
    }
    loginAttempts.set(key, record);
  }
}

export function clearRateLimit(key: string): void {
  loginAttempts.delete(key);
}
