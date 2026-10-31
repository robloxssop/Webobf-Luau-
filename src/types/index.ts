export type CompatibilityProfile = 'roblox_studio' | 'executor_ext';

export type ObfuscationPreset = 'basic' | 'advanced' | 'maximum' | 'luraph';

export type ObfuscationMode = 'direct_luau' | 'luau_vm' | 'dynamic_payload';

export type StringEncodingMode = 'byte_array' | 'base64_xor';

export type PipelinePhase = 'Parsing' | 'Encoding' | 'Decoding' | 'Transformation' | 'Runtime Compatibility';

export type UserRole = 'user' | 'auditor' | 'admin' | 'superadmin';

export interface ObfuscationOptions {
  profile: CompatibilityProfile;
  preset: ObfuscationPreset;
  mode?: ObfuscationMode;
  stringEncoding?: StringEncodingMode;
  identifierRenaming: boolean;
  barcodeRenaming?: boolean;
  stringEncryption: boolean;
  constantPooling: boolean;
  controlFlowFlattening: boolean;
  opaquePredicates: boolean;
  removeCommentsAndWhitespace: boolean;
  antiTamperPrelude: boolean;
  antiHookTraps?: boolean;
  globalAccessObfuscation?: boolean;
  memberAccessObfuscation?: boolean;
  deterministic: boolean;
  seed?: number;
  enableSourceRecovery: boolean;
  projectName?: string;
}

export interface Diagnostic {
  phase?: PipelinePhase;
  severity: 'info' | 'warning' | 'error';
  line?: number;
  column?: number;
  message: string;
  rule: string;
  mitigation?: string;
}

export interface RuntimeCompatibilityIssue {
  api: string;
  severity: 'warning' | 'error';
  affectedEnvironments: string[];
  reason: string;
  mitigation: string;
}

export interface ObfuscationResult {
  jobId: string;
  success: boolean;
  obfuscatedCode: string;
  originalSizeBytes: number;
  obfuscatedSizeBytes: number;
  transformationTimeMs: number;
  diagnostics: Diagnostic[];
  profile: CompatibilityProfile;
  preset: ObfuscationPreset;
  mode: ObfuscationMode;
  recoveryVaultId?: string;
  astValid: boolean;
  compatibilityIssues?: RuntimeCompatibilityIssue[];
  failedPhase?: PipelinePhase;
  errorMessage?: string;
}

export interface RuntimeTestResult {
  id: string;
  name: string;
  inputCode: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  environment: string;
  executionTimeMs: number;
  notes: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: string;
  isSuspended: boolean;
  dailyJobQuota: number;
  jobsUsedToday: number;
  mfaEnabled: boolean;
}

export interface JobRecord {
  id: string;
  userId: string;
  username: string;
  projectName: string;
  profile: CompatibilityProfile;
  preset: ObfuscationPreset;
  originalSizeBytes: number;
  obfuscatedSizeBytes: number;
  createdAt: string;
  hasRecoveryVault: boolean;
  status: 'completed' | 'failed' | 'processing';
  obfuscatedCode: string;
}

export interface VaultRecord {
  id: string;
  userId: string;
  username: string;
  projectName: string;
  createdAt: string;
  retentionExpiresAt: string;
  algorithm: string;
  iv: string;
  authTag: string;
  encryptedSource: string;
  sourceSizeBytes: number;
}

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  userId?: string;
  username?: string;
  ipAddress: string;
  action: string;
  category: 'auth' | 'admin' | 'vault' | 'rate_limit' | 'tamper_attempt';
  status: 'success' | 'failure' | 'blocked';
  details: string;
}

export interface SecurityTestResult {
  id: string;
  name: string;
  description: string;
  category: 'RBAC' | 'Authentication' | 'Crypto' | 'Isolation' | 'Redaction';
  passed: boolean;
  httpStatus?: number;
  latencyMs: number;
  details: string;
}
