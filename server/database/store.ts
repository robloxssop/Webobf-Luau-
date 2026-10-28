import { User, JobRecord, VaultRecord } from '../../src/types/index.ts';
import { hashPassword } from '../security/auth.ts';

export interface StoredUser extends User {
  passwordHash: string;
  passwordSalt: string;
  mfaSecret?: string;
}

// In-memory persistent database store
class DatabaseStore {
  private users: Map<string, StoredUser> = new Map();
  private jobs: Map<string, JobRecord> = new Map();
  private vaultRecords: Map<string, VaultRecord> = new Map();

  constructor() {
    this.seedInitialUsers();
    this.seedSampleJobs();
  }

  private seedInitialUsers() {
    // 1. Standard Developer User
    const devPass = hashPassword('robloxDev2026!');
    const devUser: StoredUser = {
      id: 'usr_dev_1001',
      username: 'BloxDeveloper',
      email: 'developer@aegislua.io',
      role: 'user',
      createdAt: '2026-03-15T10:00:00.000Z',
      isSuspended: false,
      dailyJobQuota: 50,
      jobsUsedToday: 4,
      mfaEnabled: false,
      passwordHash: devPass.hash,
      passwordSalt: devPass.salt,
    };
    this.users.set(devUser.id, devUser);

    // 2. Security Administrator User
    const adminPass = hashPassword('AegisSecAdmin#9981');
    const adminUser: StoredUser = {
      id: 'usr_adm_9001',
      username: 'SecOpsAdmin',
      email: 'admin@aegislua.internal',
      role: 'admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      isSuspended: false,
      dailyJobQuota: 500,
      jobsUsedToday: 12,
      mfaEnabled: true,
      mfaSecret: 'AEGIS2026MFA',
      passwordHash: adminPass.hash,
      passwordSalt: adminPass.salt,
    };
    this.users.set(adminUser.id, adminUser);
  }

  private seedSampleJobs() {
    const job1: JobRecord = {
      id: 'job_sample_01',
      userId: 'usr_dev_1001',
      username: 'BloxDeveloper',
      projectName: 'MainExperienceLeaderstats.luau',
      profile: 'roblox_studio',
      preset: 'advanced',
      originalSizeBytes: 1420,
      obfuscatedSizeBytes: 3840,
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      hasRecoveryVault: true,
      status: 'completed',
      obfuscatedCode: `-- [AegisLua Obfuscated]\nlocal _0x1a = game:GetService("Players")\n...`,
    };
    this.jobs.set(job1.id, job1);
  }

  // User Management
  getUserById(id: string): StoredUser | undefined {
    return this.users.get(id);
  }

  getUserByUsernameOrEmail(identifier: string): StoredUser | undefined {
    const lower = identifier.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === lower || u.email.toLowerCase() === lower) {
        return u;
      }
    }
    return undefined;
  }

  createUser(user: StoredUser): void {
    this.users.set(user.id, user);
  }

  updateUser(id: string, updates: Partial<StoredUser>): StoredUser | undefined {
    const u = this.users.get(id);
    if (!u) return undefined;
    const updated = { ...u, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values()).map(u => {
      const { passwordHash, passwordSalt, mfaSecret, ...safeUser } = u;
      return safeUser;
    });
  }

  // Job Management
  addJob(job: JobRecord): void {
    this.jobs.set(job.id, job);
  }

  getJobById(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  getUserJobs(userId: string): JobRecord[] {
    return Array.from(this.jobs.values())
      .filter(j => j.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getAllJobs(): JobRecord[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Recovery Vault Management
  addVaultRecord(record: VaultRecord): void {
    this.vaultRecords.set(record.id, record);
  }

  getVaultRecordById(id: string): VaultRecord | undefined {
    return this.vaultRecords.get(id);
  }

  getUserVaultRecords(userId: string): VaultRecord[] {
    return Array.from(this.vaultRecords.values())
      .filter(r => r.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getAllVaultRecords(): VaultRecord[] {
    return Array.from(this.vaultRecords.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  deleteVaultRecord(id: string): boolean {
    return this.vaultRecords.delete(id);
  }
}

export const db = new DatabaseStore();
