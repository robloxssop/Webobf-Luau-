import React from 'react';
import { BookOpen, ShieldAlert, Cpu, CheckCircle2, AlertTriangle, Terminal, Code2, Lock } from 'lucide-react';

export const DocGuide: React.FC = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Title */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              AegisLua Architecture & Compatibility Guide
            </h1>
            <p className="text-xs text-slate-400">
              Roblox Luau Runtime Security, Compatibility Boundaries, and Code Protection Semantics
            </p>
          </div>
        </div>
      </div>

      {/* Critical Security Invariant */}
      <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-5 space-y-2">
        <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Core Platform Security Principle
        </div>
        <p className="text-xs text-amber-200/90 leading-relaxed">
          Obfuscation protects developer intellectual property, proprietary algorithms, and game assets against casual inspection and source theft. However,{' '}
          <strong className="text-white">obfuscation is NOT an anti-cheat mechanism</strong>. In Roblox, any code running on the client (LocalScripts, ModuleScripts) executes within an environment physically owned by the player. Secure games must enforce server authority: validating character positions, inventory transactions, and remote event arguments on the Roblox server.
        </p>
      </div>

      {/* Compatibility Profiles Matrix */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          Execution Profiles & Environment Taxonomy
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="font-bold text-cyan-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              1. Roblox Studio (Luau Engine)
            </div>
            <p className="text-slate-400 leading-relaxed">
              Standard official runtime utilized by Roblox game servers and clients. All globals are bound to official Roblox APIs (<code className="text-cyan-200">game</code>, <code className="text-cyan-200">workspace</code>, <code className="text-cyan-200">Players</code>, <code className="text-cyan-200">task</code>). Nonstandard executor calls are flagged as errors during pre-flight analysis.
            </p>
            <ul className="text-slate-300 space-y-1 list-disc list-inside pt-1">
              <li>Full Luau AST syntax compatibility</li>
              <li>Preserves Roblox Services & Events (<code className="text-slate-200">Connect</code>, <code className="text-slate-200">Once</code>)</li>
              <li>Safe for production experiences published to Roblox</li>
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="font-bold text-violet-300 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-violet-400" />
              2. Executor / Nonstandard Environment
            </div>
            <p className="text-slate-400 leading-relaxed">
              Third-party injection runtimes providing nonstandard global tables (<code className="text-violet-200">getgenv</code>, <code className="text-violet-200">hookfunction</code>, <code className="text-violet-200">setreadonly</code>). These scripts are <strong className="text-white">not compatible</strong> with standard Roblox Studio or normal game servers.
            </p>
            <ul className="text-slate-300 space-y-1 list-disc list-inside pt-1">
              <li>Scanned for custom environment hooks</li>
              <li>Displays explicit runtime warnings</li>
              <li>Never claims universal multi-executor compatibility</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Transformation Pipeline Capabilities */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Code2 className="w-4 h-4 text-cyan-400" />
          Implemented vs Unsupported Transformations
        </h2>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-mono border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Feature</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              <tr>
                <td className="px-3 py-2 font-mono font-medium text-white">Scope-Aware Identifier Renaming</td>
                <td className="px-3 py-2 text-emerald-400 font-semibold">Supported</td>
                <td className="px-3 py-2 text-slate-400">Lexically scoped renaming of local variables and function parameters, preserving Roblox service properties.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono font-medium text-white">Byte-Array String Cipher</td>
                <td className="px-3 py-2 text-emerald-400 font-semibold">Supported</td>
                <td className="px-3 py-2 text-slate-400">Encodes string literals into numeric byte arrays decoded by a pure, portable inline runtime helper.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono font-medium text-white">Safe Arithmetic & Boolean Literals</td>
                <td className="px-3 py-2 text-emerald-400 font-semibold">Supported</td>
                <td className="px-3 py-2 text-slate-400">Replaces constants with logically equivalent arithmetic and boolean evaluations without runtime overhead.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono font-medium text-white">Constant Pooling</td>
                <td className="px-3 py-2 text-emerald-400 font-semibold">Supported</td>
                <td className="px-3 py-2 text-slate-400">Aggregates repeating numeric and string values into scoped arrays to disrupt visual pattern analysis.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono font-medium text-white">Non-Linear Jump-Table CFF</td>
                <td className="px-3 py-2 text-emerald-400 font-semibold">Supported</td>
                <td className="px-3 py-2 text-slate-400">Decomposes sequential blocks into an indirect jump table (_jmp_tbl) with dead decoy branches and strict scope hoisting.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono font-medium text-white">Dynamic Rolling Key String Cipher</td>
                <td className="px-3 py-2 text-emerald-400 font-semibold">Supported</td>
                <td className="px-3 py-2 text-slate-400">Multi-key cipher with position-dependent masks and accumulator feedback. Works with UTF-8 multi-byte characters and Base64.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono font-medium text-white">Luraph Barcode & Anti-Hook Sentinel</td>
                <td className="px-3 py-2 text-emerald-400 font-semibold">Supported</td>
                <td className="px-3 py-2 text-slate-400">Barcode identifier mangling (_IlIIlIllI), shielded non-destructive metatable inspection (zero silent drops), and CFG invariants.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono font-medium text-white">Pure-Luau Bytecode VM Mode</td>
                <td className="px-3 py-2 text-emerald-400 font-semibold">Supported</td>
                <td className="px-3 py-2 text-slate-400">Compiles statements into custom bytecode opcodes (LOADK, GETGLOBAL, CALL) executed by an in-memory Luau VM without loadstring.</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono font-medium text-white">Direct Luau Native Mode</td>
                <td className="px-3 py-2 text-emerald-400 font-semibold">Supported (Default)</td>
                <td className="px-3 py-2 text-slate-400">Runs natively on both Roblox Studio Client (LocalScripts) and Server (Script) without requiring LoadStringEnabled.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Encrypted Recovery Vault Architecture */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Lock className="w-4 h-4 text-cyan-400" />
          Encrypted Source Recovery Vault Architecture
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Commercial obfuscation platforms frequently face situations where developers lose their original source files. AegisLua provides an opt-in recovery vault built upon <strong className="text-white">AES-256-GCM authenticated encryption</strong>:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="font-semibold text-cyan-300">1. Dedicated Secret Master Key</div>
            <div className="text-slate-400 mt-1">Master encryption keys are managed independently of the application database and never exposed to client browsers.</div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="font-semibold text-cyan-300">2. Authenticated Tag Integrity</div>
            <div className="text-slate-400 mt-1">Each record has a unique 96-bit random IV and 128-bit authentication tag to prevent bit-flipping attacks.</div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="font-semibold text-cyan-300">3. Immutable Audit Trail</div>
            <div className="text-slate-400 mt-1">Every decryption or administrative emergency access requires verified authorization and generates a permanent security event.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
