import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Cpu,
  Terminal,
  AlertTriangle,
  Code2,
  FileCheck
} from 'lucide-react';
import { SecurityTestResult, RuntimeTestResult } from '../types/index.ts';

export const SecurityTestsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'runtime' | 'security'>('runtime');
  
  // Security invariants state
  const [securityTests, setSecurityTests] = useState<SecurityTestResult[]>([]);
  const [isSecurityRunning, setIsSecurityRunning] = useState(false);
  const [lastSecurityExecuted, setLastSecurityExecuted] = useState<string | null>(null);

  // Runtime execution tests state
  const [runtimeTests, setRuntimeTests] = useState<RuntimeTestResult[]>([]);
  const [isRuntimeRunning, setIsRuntimeRunning] = useState(false);
  const [lastRuntimeExecuted, setLastRuntimeExecuted] = useState<string | null>(null);

  const runSecurityTests = async () => {
    setIsSecurityRunning(true);
    try {
      const res = await fetch('/api/test-suite/run');
      if (res.ok) {
        const data = await res.json();
        setSecurityTests(data);
        setLastSecurityExecuted(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to run security test suite:', err);
    } finally {
      setIsSecurityRunning(false);
    }
  };

  const runRuntimeTests = async () => {
    setIsRuntimeRunning(true);
    try {
      const res = await fetch('/api/runtime-tests/run');
      if (res.ok) {
        const data = await res.json();
        setRuntimeTests(Array.isArray(data) ? data : (data.results || []));
        setLastRuntimeExecuted(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to run runtime test suite:', err);
    } finally {
      setIsRuntimeRunning(false);
    }
  };

  useEffect(() => {
    runRuntimeTests();
    runSecurityTests();
  }, []);

  const totalSecurityPassed = securityTests.filter(t => t.passed).length;
  const allSecurityPassed = securityTests.length > 0 && totalSecurityPassed === securityTests.length;

  const totalRuntimePassed = runtimeTests.filter(t => t.passed).length;
  const allRuntimePassed = runtimeTests.length > 0 && totalRuntimePassed === runtimeTests.length;

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
              activeTab === 'runtime'
                ? (allRuntimePassed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400')
                : (allSecurityPassed ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400')
            }`}>
              {activeTab === 'runtime' ? <Cpu className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {activeTab === 'runtime'
                  ? 'Roblox Luau Runtime Execution Verification Suite'
                  : 'Automated Platform Security & Authorization Invariants'}
              </h2>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                {activeTab === 'runtime' ? (
                  <>
                    <span>Live Fengari Luau Sandbox</span>
                    <span>·</span>
                    <span>Direct Luau vs loadstring</span>
                    <span>·</span>
                    <span>Unicode UTF-8</span>
                    <span>·</span>
                    <span>Zero Mock Data</span>
                  </>
                ) : (
                  <>
                    <span>Deny-by-default Authorization</span>
                    <span>·</span>
                    <span>AES-256-GCM Integrity</span>
                    <span>·</span>
                    <span>Tenant Isolation</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">
              Last run:{' '}
              {activeTab === 'runtime' ? lastRuntimeExecuted || 'Pending' : lastSecurityExecuted || 'Pending'}
            </span>
            <button
              disabled={activeTab === 'runtime' ? isRuntimeRunning : isSecurityRunning}
              onClick={activeTab === 'runtime' ? runRuntimeTests : runSecurityTests}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${
                (activeTab === 'runtime' ? isRuntimeRunning : isSecurityRunning) ? 'animate-spin' : ''
              }`} />
              <span>
                {activeTab === 'runtime'
                  ? isRuntimeRunning ? 'Executing Luau VM Tests...' : 'Run Luau Runtime Suite'
                  : isSecurityRunning ? 'Running Invariant Checks...' : 'Execute Security Suite'}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Switcher & Stats */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('runtime')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'runtime'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Roblox Luau Runtime Tests</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-900 border border-slate-700">
                {totalRuntimePassed}/{runtimeTests.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'security'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Security & RBAC Invariants</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-900 border border-slate-700">
                {totalSecurityPassed}/{securityTests.length}
              </span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-400">
            {activeTab === 'runtime'
              ? 'Verifies obfuscated print("Hi") and UTF-8 in simulated Roblox Studio & Executor runtimes'
              : 'Verifies tamper-resistance, credential safety, and permission boundaries'}
          </div>
        </div>
      </div>

      {/* Tab 1: Runtime Execution Verification */}
      {activeTab === 'runtime' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Real In-Process Luau Sandbox Execution Matrix
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Live Evaluation with fengari VM · Actual stdout comparison
            </span>
          </div>

          {isRuntimeRunning && runtimeTests.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-mono">
              Running real Lua/Luau execution tests in isolated sandbox...
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {runtimeTests.map((t) => (
                <div key={t.id} className="p-5 hover:bg-slate-950/40 transition-colors space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {t.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-white font-mono">{t.id}</span>
                      <span className="text-xs font-semibold text-slate-200">{t.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {t.environment}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-cyan-400">
                        {t.executionTimeMs} ms
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* Input Code */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                      <div className="text-[10px] uppercase tracking-wider font-mono text-slate-400 mb-1 flex items-center gap-1.5">
                        <Code2 className="w-3 h-3 text-cyan-400" />
                        Source Script Input
                      </div>
                      <pre className="text-xs font-mono text-slate-300 bg-slate-900/50 p-2 rounded overflow-x-auto">
                        {t.inputCode}
                      </pre>
                    </div>

                    {/* Output comparison */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                      <div className="text-[10px] uppercase tracking-wider font-mono text-slate-400 mb-1 flex items-center gap-1.5">
                        <FileCheck className="w-3 h-3 text-emerald-400" />
                        Expected vs Actual stdout
                      </div>
                      <div className="space-y-1.5 text-xs font-mono">
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Expected</span>
                          <span className="text-slate-200">{t.expectedOutput}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            t.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>Actual</span>
                          <span className={`font-semibold ${t.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.actualOutput || '<silent / no output>'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 bg-slate-950/40 px-3 py-1.5 rounded border border-slate-850">
                    <span className="font-semibold text-slate-300">Analysis: </span>
                    {t.notes}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Security & RBAC Invariants */}
      {activeTab === 'security' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">
              Security Control Verification Matrix
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Zero Mock Data · Live Cryptographic Assertions
            </span>
          </div>

          {isSecurityRunning && securityTests.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-mono">
              Executing cryptographic and RBAC security test assertions...
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {securityTests.map((test) => (
                <div
                  key={test.id}
                  className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-950/40 transition-colors"
                >
                  <div className="space-y-1 max-w-3xl">
                    <div className="flex items-center gap-2">
                      {test.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-white">
                        {test.id}: {test.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                        {test.category}
                      </span>
                      {test.httpStatus && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-cyan-400">
                          HTTP {test.httpStatus}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed pl-6">
                      {test.description}
                    </p>

                    <div className="text-[11px] text-slate-300 font-mono pl-6 pt-0.5 flex items-center gap-2">
                      <span className="text-slate-400">Result:</span>
                      <span>{test.details}</span>
                    </div>
                  </div>

                  <div className="pl-6 md:pl-0 shrink-0 text-right">
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {test.latencyMs} ms
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

