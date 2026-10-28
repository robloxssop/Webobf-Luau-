import crypto from 'crypto';

// Master recovery encryption key (32 bytes = 256 bits for AES-256-GCM)
// In production, this is sourced from GCP Secret Manager or KMS
const DEFAULT_FALLBACK_KEY = 'aegis_sec_vault_aes256_gcm_2026_master_key_32!';
const rawKey = process.env.VAULT_MASTER_KEY || DEFAULT_FALLBACK_KEY;
const MASTER_KEY = crypto.createHash('sha256').update(rawKey).digest();

export interface EncryptedPayload {
  encryptedSource: string;
  iv: string;
  authTag: string;
  algorithm: 'aes-256-gcm';
}

/**
 * Encrypts source code using AES-256-GCM with authenticated tag and unique IV.
 * Plaintext source code is never logged or exposed.
 */
export function encryptSource(sourceCode: string): EncryptedPayload {
  if (!sourceCode || typeof sourceCode !== 'string') {
    throw new Error('Invalid source code provided for encryption');
  }

  // 12-byte (96-bit) IV standard for AES-GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);

  let encrypted = cipher.update(sourceCode, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encryptedSource: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    algorithm: 'aes-256-gcm',
  };
}

/**
 * Decrypts ciphertext using AES-256-GCM and verifies the authentication tag.
 * Throws an error if ciphertext or tag was tampered with.
 */
export function decryptSource(encryptedHex: string, ivHex: string, authTagHex: string): string {
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    throw new Error('Authentication tag mismatch or decryption failure: data integrity check failed');
  }
}
