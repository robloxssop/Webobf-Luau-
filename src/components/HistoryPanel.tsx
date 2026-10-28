import React, { useState, useEffect } from 'react';
import { History, Download, Eye, FileCode, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { JobRecord } from '../types/index.ts';

interface HistoryPanelProps {
  onSelectJob: (job: JobRecord) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ onSelectJob }) => {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error('Failed to fetch job history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleDownload = (job: JobRecord) => {
    const blob = new Blob([job.obfuscatedCode], { type: 'text/x-lua' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.projectName.replace(/\.luau?$/, '')}_protected.luau`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Processing History
            </h2>
            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Your processed obfuscation jobs</span>
              <span>·</span>
              <span>Download or re-inspect anytime</span>
            </div>
          </div>
        </div>

        <button
          onClick={fetchJobs}
          className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh History</span>
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200">
            Job Audit Records ({jobs.length})
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            Sorted by most recent
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 font-mono">
            Loading job records...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No processing jobs completed yet. Go to Studio to obfuscate your first script.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-950/50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-white font-mono">
                      {job.projectName}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 capitalize">
                      {job.profile.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/80 text-cyan-300 capitalize">
                      {job.preset}
                    </span>
                    {job.hasRecoveryVault && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300">
                        Vault Enabled
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3">
                    <span className="font-mono">ID: {job.id.slice(0, 14)}</span>
                    <span>·</span>
                    <span className="tabular-nums font-mono">
                      {(job.originalSizeBytes / 1024).toFixed(1)} KB → {(job.obfuscatedSizeBytes / 1024).toFixed(1)} KB
                    </span>
                    <span>·</span>
                    <span>{new Date(job.createdAt).toLocaleString()}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      {job.status}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onSelectJob(job)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-200 hover:text-white border border-slate-700 hover:bg-slate-750 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Output</span>
                  </button>

                  <button
                    onClick={() => handleDownload(job)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
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
