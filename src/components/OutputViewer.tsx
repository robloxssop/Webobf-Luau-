import React, { useState } from 'react';
import {
  Copy,
  Download,
  Check,
  Code2,
  FileCheck2,
  AlertCircle,
  Clock,
  HardDrive,
  ShieldCheck,
  SplitSquareVertical
} from 'lucide-react';
import { ObfuscationResult } from '../types/index.ts';

interface OutputViewerProps {
  result: ObfuscationResult;
}

export const OutputViewer: React.FC<OutputViewerProps> = ({ result }) => {
  const [copied, setCopied] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(result.obfuscatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([result.obfuscatedCode], { type: 'text/x-lua' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aegis_${result.jobId.slice(0, 8)}.luau`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lineCount = result.obfuscatedCode.split('\n').length;
  const sizeDiff = result.obfuscatedSizeBytes - result.originalSizeBytes;
  const sizeRatio = ((result.obfuscatedSizeBytes / (result.originalSizeBytes || 1)) * 100).toFixed(0);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden space-y-0">
      {/* Metrics Banner */}
      <div className="p-4 bg-slate-950/90 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
        <div>
          <div className="text-[11px] text-slate-400 font-sans flex items-center gap-1">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            Payload Size
          </div>
          <div className="text-slate-100 font-semibold mt-0.5 tabular-nums">
            {(result.obfuscatedSizeBytes / 1024).toFixed(2)} KB
            <span className="text-[10px] text-slate-400 ml-1.5 font-normal">
              ({sizeDiff >= 0 ? `+${(sizeDiff / 1024).toFixed(1)} KB` : `${(sizeDiff / 1024).toFixed(1)} KB`})
            </span>
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400 font-sans flex items-center gap-1">
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            Execution Mode
          </div>
          <div className="text-slate-100 font-semibold mt-0.5">
            {result.mode === 'direct_luau' ? (
              <span className="text-emerald-400">Direct Luau (No loadstring)</span>
            ) : (
              <span className="text-violet-300">Dynamic Payload</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400 font-sans flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            Target Profile
          </div>
          <div className="text-slate-100 font-semibold mt-0.5 capitalize">
            {result.profile === 'roblox_studio' ? 'Roblox Studio' : 'Executor Profile'}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400 font-sans flex items-center gap-1">
            <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" />
            Post-AST Validation
          </div>
          <div className="text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
            {result.astValid ? 'Conforms to Lua/Luau' : 'Grammar Warning'}
          </div>
        </div>
      </div>

      {/* Failure Alert Banner (if failed) */}
      {!result.success && (
        <div className="p-4 bg-rose-950/40 border-b border-rose-800 text-rose-200 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-rose-300">
              Obfuscation Failed in Phase: {result.failedPhase || 'Parsing'}
            </div>
            <div>{result.errorMessage || 'Could not validate or transform code safely.'}</div>
          </div>
        </div>
      )}

      {/* Compatibility Advisories */}
      {result.compatibilityIssues && result.compatibilityIssues.length > 0 && (
        <div className="p-4 bg-amber-950/30 border-b border-amber-800/60 text-amber-200 text-xs space-y-2">
          <div className="font-bold text-amber-300 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            Roblox Runtime Compatibility Advisory ({result.compatibilityIssues.length} items detected)
          </div>
          <div className="space-y-1.5 pl-5">
            {result.compatibilityIssues.map((issue, idx) => (
              <div key={idx} className="text-[11px]">
                <span className="font-semibold text-white">{issue.api}: </span>
                <span>{issue.reason} </span>
                <span className="text-cyan-300">Fix: {issue.mitigation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Header */}
      <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">
            Protected Luau Output
          </span>
          <span className="text-[11px] text-slate-400 font-mono tabular-nums">
            ({lineCount} lines)
          </span>
          {result.recoveryVaultId && (
            <span className="text-[11px] text-cyan-300 font-mono ml-2">
              · Vault ID: {result.recoveryVaultId.slice(0, 14)}...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="px-3 py-1.5 rounded-md border border-slate-800 bg-slate-900 text-slate-300 hover:text-white transition-colors"
          >
            Diagnostics ({result.diagnostics.length})
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className={`px-3.5 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
              copied
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300 shadow-cyan-500/20'
            }`}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'คัดลอกสำเร็จ! (Copied)' : 'คัดลอกโค้ดไปใช้ (Copy Script)'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>ดาวน์โหลด (.luau)</span>
          </button>
        </div>
      </div>

      {/* Diagnostics Drawer */}
      {showDiagnostics && (
        <div className="p-4 bg-slate-950 border-b border-slate-800 max-h-56 overflow-y-auto space-y-2 text-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Pipeline Diagnostic Events:
          </div>
          {result.diagnostics.map((d, idx) => (
            <div
              key={idx}
              className={`p-2.5 rounded border text-xs ${
                d.severity === 'error'
                  ? 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                  : d.severity === 'warning'
                  ? 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                  : 'bg-slate-900/50 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                <span>Phase: {d.phase || 'Transformation'} · Rule: {d.rule}</span>
                {d.line && <span>Line {d.line}:{d.column}</span>}
              </div>
              <div>{d.message}</div>
              {d.mitigation && (
                <div className="mt-1 text-[11px] text-cyan-300 font-sans">
                  Mitigation: {d.mitigation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Code Area */}
      <div className="relative">
        <textarea
          readOnly
          value={result.obfuscatedCode}
          rows={16}
          className="w-full bg-slate-950 p-4 font-mono text-xs text-slate-300 focus:outline-none border-0 resize-y leading-relaxed selection:bg-cyan-500/20"
        />
      </div>
    </div>
  );
};
