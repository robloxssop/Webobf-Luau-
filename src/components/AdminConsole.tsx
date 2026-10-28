import React, { useState, useEffect } from 'react';
import {
  Lock,
  Users,
  ShieldAlert,
  Activity,
  Archive,
  Search,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  ShieldCheck,
  RefreshCw,
  Eye,
  Trash2,
  Copy,
  Check
} from 'lucide-react';
import { User, JobRecord, SecurityAuditEvent, VaultRecord } from '../types/index.ts';

interface AdminMetrics {
  usersCount: number;
  activeUsersCount: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  studioJobs: number;
  executorJobs: number;
  vaultRecordsCount: number;
  securityEventsCount: number;
  securityAlertsCount: number;
  adminRouteSlug: string;
}

export const AdminConsole: React.FC = () => {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditEvent[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'users' | 'jobs' | 'audit' | 'vault'>('overview');
  const [loading, setLoading] = useState(true);

  // Search and filters
  const [auditFilter, setAuditFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Emergency Vault Recovery State
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [selectedVaultJobId, setSelectedVaultJobId] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [recoveredSecretSource, setRecoveredSecretSource] = useState<string | null>(null);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [metricsRes, usersRes, jobsRes, auditRes] = await Promise.all([
        fetch('/api/admin/metrics'),
        fetch('/api/admin/users'),
        fetch('/api/admin/jobs'),
        fetch('/api/admin/audit-logs'),
      ]);

      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (jobsRes.ok) setJobs(await jobsRes.json());
      if (auditRes.ok) setAuditLogs(await auditRes.json());
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setUsers(users.map(u => (u.id === userId ? { ...u, ...updated } : u)));
      }
    } catch (err) {
      console.error('Failed to update user:', err);
    }
  };

  const handleExecuteEmergencyRecovery = async (vaultId: string) => {
    if (!emergencyReason || emergencyReason.trim().length < 10) {
      setEmergencyError('A verified authorization reason of at least 10 characters is legally required for privileged recovery.');
      return;
    }

    setEmergencyError(null);
    try {
      const res = await fetch(`/api/admin/vault/${vaultId}/emergency-recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizationReason: emergencyReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecoveredSecretSource(data.sourceCode);
      } else {
        setEmergencyError(data.error || 'Emergency decryption failed');
      }
    } catch (err: any) {
      setEmergencyError(err.message || 'Network error during emergency recovery');
    }
  };

  const filteredLogs = auditLogs.filter(log => {
    const matchesFilter = auditFilter === 'all' || log.category === auditFilter;
    const matchesQuery = searchQuery === '' ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.username && log.username.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesQuery;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-violet-900/40 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Private Security Administration Console
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-950 border border-violet-800 text-violet-300">
                  Role: Superadmin / SecOps
                </span>
              </h2>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>RBAC Authorized</span>
                <span>·</span>
                <span>Immutable Audit Trail Active</span>
                <span>·</span>
                <span>Route Slug: /{metrics?.adminRouteSlug || 'sys-console-sec-ops'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={fetchAdminData}
            className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Telemetry</span>
          </button>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="mt-5 flex items-center gap-2 border-t border-slate-800/80 pt-4 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              activeSubTab === 'overview'
                ? 'bg-violet-950 text-violet-300 border border-violet-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Overview Metrics
          </button>
          <button
            onClick={() => setActiveSubTab('users')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              activeSubTab === 'users'
                ? 'bg-violet-950 text-violet-300 border border-violet-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            User Accounts ({users.length})
          </button>
          <button
            onClick={() => setActiveSubTab('jobs')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              activeSubTab === 'jobs'
                ? 'bg-violet-950 text-violet-300 border border-violet-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Job Activity ({jobs.length})
          </button>
          <button
            onClick={() => setActiveSubTab('audit')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              activeSubTab === 'audit'
                ? 'bg-violet-950 text-violet-300 border border-violet-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Security Audit Trail ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* OVERVIEW SUBTAB */}
      {activeSubTab === 'overview' && metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-cyan-400" />
              Registered Accounts
            </div>
            <div className="text-2xl font-bold text-white font-mono tabular-nums">
              {metrics.usersCount}
            </div>
            <div className="text-[11px] text-slate-400">
              {metrics.activeUsersCount} active · 0 suspended
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-cyan-400" />
              Obfuscation Jobs
            </div>
            <div className="text-2xl font-bold text-white font-mono tabular-nums">
              {metrics.totalJobs}
            </div>
            <div className="text-[11px] text-slate-400">
              {metrics.studioJobs} Studio · {metrics.executorJobs} Executor
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-cyan-400" />
              Encrypted Vault Records
            </div>
            <div className="text-2xl font-bold text-white font-mono tabular-nums">
              {metrics.vaultRecordsCount}
            </div>
            <div className="text-[11px] text-slate-400">
              AES-256-GCM 30-day retention
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-violet-400" />
              Security Interceptions
            </div>
            <div className="text-2xl font-bold text-violet-300 font-mono tabular-nums">
              {metrics.securityAlertsCount}
            </div>
            <div className="text-[11px] text-slate-400">
              Blocked tampering / rate limits
            </div>
          </div>
        </div>
      )}

      {/* USER MANAGEMENT SUBTAB */}
      {activeSubTab === 'users' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">
              User Accounts & Quotas
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Server-Side Role Control
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Quota</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-950/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{u.username}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateUser(u.id, { role: e.target.value as any })}
                        className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded px-2 py-1"
                      >
                        <option value="user">user</option>
                        <option value="auditor">auditor</option>
                        <option value="admin">admin</option>
                        <option value="superadmin">superadmin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">
                      {u.jobsUsedToday} / {u.dailyJobQuota}
                    </td>
                    <td className="px-4 py-3">
                      {u.isSuspended ? (
                        <span className="text-rose-400 font-semibold">Suspended</span>
                      ) : (
                        <span className="text-emerald-400 font-medium">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleUpdateUser(u.id, { isSuspended: !u.isSuspended })}
                        className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                          u.isSuspended
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {u.isSuspended ? 'Reactivate' : 'Suspend'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* JOB QUEUE SUBTAB */}
      {activeSubTab === 'jobs' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">
              System Job Stream ({jobs.length})
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {jobs.map(job => (
              <div key={job.id} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white font-mono">{job.projectName}</span>
                    <span className="text-slate-400">by {job.username}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {job.profile}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                      {job.preset}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-1">
                    {(job.originalSizeBytes / 1024).toFixed(1)} KB → {(job.obfuscatedSizeBytes / 1024).toFixed(1)} KB · {new Date(job.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="text-emerald-400 font-mono text-xs">
                  {job.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECURITY AUDIT LOGS SUBTAB */}
      {activeSubTab === 'audit' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden space-y-0">
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-200">Audit Events:</span>
              <select
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-300 rounded px-2.5 py-1 text-xs"
              >
                <option value="all">All Categories</option>
                <option value="auth">Authentication</option>
                <option value="admin">Admin Operations</option>
                <option value="vault">Vault Access</option>
                <option value="rate_limit">Rate Limiting</option>
                <option value="tamper_attempt">Tampering Attempts</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit trail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-200 px-3 py-1 rounded text-xs focus:outline-none focus:border-cyan-500 w-48 sm:w-64"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto">
            {filteredLogs.map(log => (
              <div key={log.id} className="p-4 text-xs space-y-1 hover:bg-slate-950/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                      log.status === 'blocked'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : log.status === 'failure'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {log.status}
                    </span>
                    <span className="text-white font-medium">{log.action}</span>
                    <span className="text-slate-400">· {log.category}</span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="text-slate-300 font-mono text-[11px] pl-2 border-l border-slate-800">
                  {log.details}
                </div>

                <div className="text-[10px] text-slate-400 font-mono">
                  User: {log.username || 'unauthenticated'} · IP: {log.ipAddress} · ID: {log.id}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
