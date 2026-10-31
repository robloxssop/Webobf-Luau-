import React, { useState, useEffect } from 'react';
import {
  Archive,
  Lock,
  Unlock,
  Trash2,
  Copy,
  Check,
  Calendar,
  HardDrive,
  AlertCircle,
  FileCode,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { VaultRecord } from '../types/index.ts';

interface VaultItemSummary {
  id: string;
  projectName: string;
  createdAt: string;
  retentionExpiresAt: string;
  algorithm: string;
  sourceSizeBytes: number;
}

export const RecoveryVaultPanel: React.FC = () => {
  const [vaultItems, setVaultItems] = useState<VaultItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [recoveredCode, setRecoveredCode] = useState<string | null>(null);
  const [recoveredProjectName, setRecoveredProjectName] = useState<string>('');
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [pastedCode, setPastedCode] = useState('');
  const [deobfMethod, setDeobfMethod] = useState<string | null>(null);

  const fetchVaultItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vault');
      if (res.ok) {
        const data = await res.json();
        setVaultItems(data);
      }
    } catch (err) {
      console.error('Failed to fetch vault items:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectDeobfuscate = async () => {
    if (!pastedCode || !pastedCode.trim()) return;
    setRecovering(true);
    setRecoveryError(null);
    setDeobfMethod(null);

    try {
      const savedToken = localStorage.getItem('aegis_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (savedToken) headers['Authorization'] = `Bearer ${savedToken}`;

      const res = await fetch('/api/admin/deobfuscate-direct', {
        method: 'POST',
        headers,
        body: JSON.stringify({ obfuscatedCode: pastedCode }),
      });
      const data = await res.json();

      if (res.ok && data.sourceCode) {
        setRecoveredCode(data.sourceCode);
        setRecoveredProjectName(data.projectName || 'DeobfuscatedScript.luau');
        setDeobfMethod(data.method);
      } else {
        setRecoveryError(data.error || 'Failed to deobfuscate code');
      }
    } catch (err: any) {
      setRecoveryError(err.message || 'Deobfuscation request failed');
    } finally {
      setRecovering(false);
    }
  };

  useEffect(() => {
    fetchVaultItems();
  }, []);

  const handleRecoverSource = async (id: string) => {
    setRecovering(true);
    setRecoveryError(null);
    setSelectedRecordId(id);

    try {
      const res = await fetch(`/api/vault/${id}/recover`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        setRecoveredCode(data.sourceCode);
        setRecoveredProjectName(data.projectName);
      } else {
        setRecoveryError(data.error || 'Failed to recover source code');
      }
    } catch (err: any) {
      setRecoveryError(err.message || 'Network error during recovery attempt');
    } finally {
      setRecovering(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this recovery record from the vault? This cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`/api/vault/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setVaultItems(items => items.filter(item => item.id !== id));
        if (selectedRecordId === id) {
          setRecoveredCode(null);
          setSelectedRecordId(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete vault record:', err);
    }
  };

  const handleCopyRecovered = () => {
    if (recoveredCode) {
      navigator.clipboard.writeText(recoveredCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Architecture Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Private Source Recovery Vault
              </h2>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>AES-256-GCM Authenticated Encryption</span>
                <span>·</span>
                <span>Owner-Only Authorization</span>
                <span>·</span>
                <span>Strict 30-Day Retention</span>
              </div>
            </div>
          </div>

          <button
            onClick={fetchVaultItems}
            className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Vault</span>
          </button>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
          <span className="font-semibold text-cyan-300">Cryptographic Invariant: </span>
          Obfuscation is deliberately non-reversible. The recovery vault stores your original source code encrypted with authenticated AES-256-GCM. Decryption requires valid session authorization from the owning account.
        </div>
      </div>

      {/* Instant Direct Deobfuscator (Paste Obfuscated Script) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Unlock className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Instant Direct Deobfuscator (Paste Obfuscated Script)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-cyan-400/90 bg-cyan-950/60 px-2.5 py-0.5 rounded border border-cyan-800/50">
            AES-256-GCM Vault Tag Matcher
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Paste any obfuscated Luau script generated by AegisLua. The engine will extract the embedded AES-256-GCM vault tag and decrypt the exact original source code instantly.
        </p>
        <textarea
          value={pastedCode}
          onChange={(e) => setPastedCode(e.target.value)}
          placeholder="Paste obfuscated Luau script here (e.g. local _0x1 = ... -- AEGIS_VAULT_TAG:...)"
          rows={4}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
        />
        <div className="flex justify-end">
          <button
            disabled={recovering || !pastedCode.trim()}
            onClick={handleDirectDeobfuscate}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Unlock className="w-4 h-4" />
            <span>{recovering ? 'Decrypting...' : 'Deobfuscate / Recover Source'}</span>
          </button>
        </div>
      </div>

      {/* Recovered Code Modal / Viewer */}
      {recoveredCode && (
        <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl overflow-hidden shadow-xl shadow-cyan-950/20">
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-white">
                Decrypted Original Source: {recoveredProjectName}
              </span>
              <span className="text-slate-400 font-mono">
                · {new Blob([recoveredCode]).size} bytes
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyRecovered}
                className="px-3 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-200 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Source'}</span>
              </button>
              <button
                onClick={() => setRecoveredCode(null)}
                className="px-3 py-1 text-xs rounded bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                Close Viewer
              </button>
            </div>
          </div>

          <textarea
            readOnly
            value={recoveredCode}
            rows={14}
            className="w-full bg-slate-950 p-4 font-mono text-xs text-slate-200 border-0 focus:outline-none resize-y leading-relaxed"
          />
        </div>
      )}

      {recoveryError && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-rose-200">Decryption Failed: </span>
            {recoveryError}
          </div>
        </div>
      )}

      {/* Vault Items Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-200">
            Encrypted Records ({vaultItems.length})
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Auto-Pruning After 30 Days
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 font-mono">
            Loading encrypted vault inventory...
          </div>
        ) : vaultItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No recovery records stored yet. Enable "Source Recovery Vault" when obfuscating a script in the Studio.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {vaultItems.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-950/50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-white font-mono">
                      {item.projectName}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300">
                      {item.algorithm.toUpperCase()}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3">
                    <span className="font-mono">ID: {item.id.slice(0, 16)}...</span>
                    <span>·</span>
                    <span className="tabular-nums font-mono">{(item.sourceSizeBytes / 1024).toFixed(1)} KB</span>
                    <span>·</span>
                    <span>Created: {new Date(item.createdAt).toLocaleDateString()}</span>
                    <span>·</span>
                    <span className="text-amber-400/80">
                      Expires: {new Date(item.retentionExpiresAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    disabled={recovering && selectedRecordId === item.id}
                    onClick={() => handleRecoverSource(item.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>{recovering && selectedRecordId === item.id ? 'Decrypting...' : 'Recover Source'}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteRecord(item.id)}
                    title="Permanently Delete Record"
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-950 rounded border border-slate-800 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
