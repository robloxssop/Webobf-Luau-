import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Play,
  Upload,
  FileCode,
  Sliders,
  Sparkles,
  Info,
  AlertTriangle,
  Lock,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  FileText,
  Code2
} from 'lucide-react';
import {
  CompatibilityProfile,
  ObfuscationPreset,
  ObfuscationMode,
  StringEncodingMode,
  ObfuscationOptions,
  ObfuscationResult,
  Diagnostic,
  RuntimeCompatibilityIssue
} from '../types/index.ts';
import { SAMPLE_SCRIPTS } from '../utils/sampleScripts.ts';

interface StudioEditorProps {
  onObfuscate: (sourceCode: string, options: ObfuscationOptions) => Promise<void>;
  isProcessing: boolean;
  result: ObfuscationResult | null;
}

export const StudioEditor: React.FC<StudioEditorProps> = ({
  onObfuscate,
  isProcessing,
}) => {
  const [sourceCode, setSourceCode] = useState<string>(SAMPLE_SCRIPTS[0].code);
  const [projectName, setProjectName] = useState<string>('TestScript.luau');
  const [profile, setProfile] = useState<CompatibilityProfile>('roblox_studio');
  const [preset, setPreset] = useState<ObfuscationPreset>('advanced');
  const [mode, setMode] = useState<ObfuscationMode>('direct_luau');
  const [stringEncoding, setStringEncoding] = useState<StringEncodingMode>('byte_array');

  // Fine-grained options
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [identifierRenaming, setIdentifierRenaming] = useState(true);
  const [barcodeRenaming, setBarcodeRenaming] = useState(false);
  const [stringEncryption, setStringEncryption] = useState(true);
  const [constantPooling, setConstantPooling] = useState(true);
  const [controlFlowFlattening, setControlFlowFlattening] = useState(false);
  const [opaquePredicates, setOpaquePredicates] = useState(true);
  const [removeCommentsAndWhitespace, setRemoveCommentsAndWhitespace] = useState(true);
  const [antiTamperPrelude, setAntiTamperPrelude] = useState(false);
  const [antiHookTraps, setAntiHookTraps] = useState(false);
  const [globalAccessObfuscation, setGlobalAccessObfuscation] = useState(false);
  const [deterministic, setDeterministic] = useState(false);
  const [seed, setSeed] = useState(42069);
  const [enableSourceRecovery, setEnableSourceRecovery] = useState(true);

  // Live pre-flight analysis state
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [detectedRobloxGlobals, setDetectedRobloxGlobals] = useState<string[]>([]);
  const [detectedExecutorApis, setDetectedExecutorApis] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isSyntaxValid, setIsSyntaxValid] = useState<boolean>(true);

  // Sync preset changes with option defaults
  const handlePresetChange = (newPreset: ObfuscationPreset) => {
    setPreset(newPreset);
    if (newPreset === 'basic') {
      setIdentifierRenaming(true);
      setBarcodeRenaming(false);
      setStringEncryption(false);
      setConstantPooling(false);
      setControlFlowFlattening(false);
      setOpaquePredicates(false);
      setAntiTamperPrelude(false);
      setAntiHookTraps(false);
      setGlobalAccessObfuscation(false);
    } else if (newPreset === 'advanced') {
      setIdentifierRenaming(true);
      setBarcodeRenaming(false);
      setStringEncryption(true);
      setConstantPooling(true);
      setControlFlowFlattening(false);
      setOpaquePredicates(true);
      setAntiTamperPrelude(false);
      setAntiHookTraps(false);
      setGlobalAccessObfuscation(false);
    } else if (newPreset === 'maximum') {
      setIdentifierRenaming(true);
      setBarcodeRenaming(false);
      setStringEncryption(true);
      setConstantPooling(true);
      setControlFlowFlattening(true);
      setOpaquePredicates(true);
      setAntiTamperPrelude(true);
      setAntiHookTraps(false);
      setGlobalAccessObfuscation(false);
    } else if (newPreset === 'luraph') {
      setMode('direct_luau'); // 100% Roblox Studio safe (zero loadstring)
      setIdentifierRenaming(true);
      setBarcodeRenaming(true);
      setStringEncryption(true);
      setConstantPooling(true);
      setControlFlowFlattening(true);
      setOpaquePredicates(true);
      setAntiTamperPrelude(true);
      setAntiHookTraps(true);
      setGlobalAccessObfuscation(true);
    }
  };

  // Run pre-flight analysis
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!sourceCode.trim()) {
        setDetectedRobloxGlobals([]);
        setDetectedExecutorApis([]);
        setDiagnostics([]);
        setIsSyntaxValid(true);
        return;
      }

      setAnalysisLoading(true);
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceCode, profile }),
        });
        const data = await res.json();
        setDetectedRobloxGlobals(data.detectedRobloxGlobals || []);
        setDetectedExecutorApis(data.detectedExecutorApis || []);
        setDiagnostics(data.diagnostics || []);
        setIsSyntaxValid(data.valid);
      } catch (err) {
        console.error('Pre-flight analysis error:', err);
      } finally {
        setAnalysisLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [sourceCode, profile]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProjectName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setSourceCode(content);
      }
    };
    reader.readAsText(file);
  };

  const handleLoadSample = (sampleId: string) => {
    const found = SAMPLE_SCRIPTS.find(s => s.id === sampleId);
    if (found) {
      setSourceCode(found.code);
      setProjectName(`${found.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.luau`);
      setProfile(found.profile);
    }
  };

  const handleExecuteObfuscation = () => {
    const options: ObfuscationOptions = {
      profile,
      preset,
      mode,
      stringEncoding,
      identifierRenaming,
      barcodeRenaming: preset === 'luraph' || barcodeRenaming,
      stringEncryption,
      constantPooling,
      controlFlowFlattening,
      opaquePredicates,
      removeCommentsAndWhitespace,
      antiTamperPrelude,
      antiHookTraps: preset === 'luraph' || antiHookTraps,
      globalAccessObfuscation: preset === 'luraph' || globalAccessObfuscation,
      deterministic,
      seed: deterministic ? seed : undefined,
      enableSourceRecovery,
      projectName,
    };

    onObfuscate(sourceCode, options);
  };

  const lineCount = sourceCode.split('\n').length;
  const byteSize = new Blob([sourceCode]).size;

  return (
    <div className="space-y-6">
      {/* Quick Start 3-Step Guide Banner */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-violet-950/30 border border-cyan-500/30 rounded-xl p-4 text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            วิธีใช้งานง่ายๆ ใน 3 ขั้นตอน (Quick Start)
          </span>
          <span className="text-[11px] text-cyan-300 font-mono">ใช้งานได้ทันที ไม่ต้องล็อกอินซ้ำซ้อน</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-slate-300">
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
            <div>
              <div className="font-semibold text-white">วางโค้ด Luau / Lua</div>
              <div className="text-[11px] text-slate-400">วางสคริปต์ในกล่อง หรือกดเลือกตัวอย่าง (Templates)</div>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
            <div>
              <div className="font-semibold text-white">เลือกระดับ (แนะนำ: Advanced)</div>
              <div className="text-[11px] text-slate-400">Basic (เร็ว/เบา) / Advanced (ซ่อนข้อความ)</div>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
            <div>
              <div className="font-semibold text-white">กดปุ่ม Obfuscate Code</div>
              <div className="text-[11px] text-slate-400">ระบบจะแปลงโค้ดทันที พร้อมปุ่มก๊อปปี้ไปวางในเกม</div>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Toolbar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Target Compatibility Profile */}
          <div className="lg:col-span-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                Compatibility Profile (รูปแบบที่นำไปรัน)
              </label>
              <span className="text-[11px] text-slate-400">เลือกสภาพแวดล้อม</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setProfile('roblox_studio')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-all text-left whitespace-nowrap ${
                  profile === 'roblox_studio'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold">Roblox Studio</div>
                <div className="text-[10px] text-slate-400 font-normal">สำหรับแมพ/เกมปกติ 100%</div>
              </button>

              <button
                type="button"
                onClick={() => setProfile('executor_ext')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-all text-left whitespace-nowrap ${
                  profile === 'executor_ext'
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold">Executor Profile</div>
                <div className="text-[10px] text-slate-400 font-normal">สำหรับตัวรันสคริปต์ภายนอก</div>
              </button>
            </div>
          </div>

          {/* Protection Preset Selector */}
          <div className="lg:col-span-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                ระดับการป้องกัน (Preset)
              </label>
              <span className="text-[11px] text-amber-400 font-mono font-semibold">
                {preset === 'luraph' ? '🔥 Luraph Parity' : 'เลือกความลึก'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => handlePresetChange('basic')}
                className={`py-2 px-1 text-xs font-medium rounded-md transition-all text-center whitespace-nowrap ${
                  preset === 'basic'
                    ? 'bg-slate-800 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>Basic</div>
                <div className="text-[9px] text-slate-400 font-normal">เร็ว/เบา</div>
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('advanced')}
                className={`py-2 px-1 text-xs font-medium rounded-md transition-all text-center whitespace-nowrap ${
                  preset === 'advanced'
                    ? 'bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800/60 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>Advanced</div>
                <div className="text-[9px] text-cyan-400 font-normal">ซ่อนสตริง</div>
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('maximum')}
                className={`py-2 px-1 text-xs font-medium rounded-md transition-all text-center whitespace-nowrap ${
                  preset === 'maximum'
                    ? 'bg-violet-950 text-violet-300 font-semibold border border-violet-800/60 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>Maximum</div>
                <div className="text-[9px] text-violet-400 font-normal">CFF สลับโค้ด</div>
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange('luraph')}
                className={`py-2 px-1 text-xs font-medium rounded-md transition-all text-center whitespace-nowrap relative ${
                  preset === 'luraph'
                    ? 'bg-amber-950/70 text-amber-300 font-bold border border-amber-500/70 shadow-lg shadow-amber-950/40'
                    : 'text-amber-400/90 hover:text-amber-200 hover:bg-amber-950/30'
                }`}
              >
                <div className="text-amber-300 font-bold">Luraph</div>
                <div className="text-[9px] text-amber-400 font-normal">ระดับสูงสุด</div>
              </button>
            </div>
          </div>

          {/* Fixtures & Actions */}
          <div className="lg:col-span-3 space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-cyan-400" />
              Quick Templates
            </label>
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => handleLoadSample(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500/50"
              >
                {SAMPLE_SCRIPTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

        </div>

        {/* Execution Mode & String Encoding Schemes */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                โหมดการรันโค้ด (Execution Mode)
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                {mode === 'direct_luau' ? '✓ ไม่ใช้ loadstring (Direct AST)' : mode === 'luau_vm' ? '✓ Pure-Luau Bytecode VM (ไม่ใช้ loadstring)' : '⚠ Dynamic Wrapper (ต้องมี loadstring)'}
              </span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setMode('direct_luau')}
                className={`px-2.5 py-1.5 rounded transition-all text-left ${
                  mode === 'direct_luau'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>Direct Luau</div>
                <div className="text-[10px] text-slate-400 font-normal">รันตรง ปลอดภัยต่อ Studio</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('luau_vm')}
                className={`px-2.5 py-1.5 rounded transition-all text-left ${
                  mode === 'luau_vm'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>Luau Bytecode VM</div>
                <div className="text-[10px] text-emerald-400/80 font-normal">VM ในตัว (Zero loadstring)</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('dynamic_payload')}
                className={`px-2.5 py-1.5 rounded transition-all text-left ${
                  mode === 'dynamic_payload'
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>Dynamic Payload</div>
                <div className="text-[10px] text-slate-400 font-normal">มีระบบเตือนถ้าปิด loadstring</div>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                การเข้ารหัสสตริง (String Encoding)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">UTF-8 / Unicode</span>
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setStringEncoding('byte_array')}
                className={`px-2.5 py-1.5 rounded transition-all text-left ${
                  stringEncoding === 'byte_array'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>UTF-8 Byte Array</div>
                <div className="text-[10px] text-slate-400 font-normal">เสถียรที่สุด รองรับภาษาไทย/Emoji</div>
              </button>
              <button
                type="button"
                onClick={() => setStringEncoding('base64_xor')}
                className={`px-2.5 py-1.5 rounded transition-all text-left ${
                  stringEncoding === 'base64_xor'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>Base64 (RFC-4648)</div>
                <div className="text-[10px] text-slate-400 font-normal">ตัวถอดรหัส Luau แก้ไขแล้ว</div>
              </button>
            </div>
          </div>
        </div>

        {/* Profile Warning Banners */}
        {profile === 'roblox_studio' && detectedExecutorApis.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Environment Incompatibility Detected: </span>
              This code references nonstandard executor APIs (
              <span className="font-mono text-amber-100">{detectedExecutorApis.join(', ')}</span>
              ). Roblox Studio and official servers do NOT support these APIs. Switch to the Executor Profile or remove these calls to prevent script execution crashes.
            </div>
          </div>
        )}

        {profile === 'executor_ext' && (
          <div className="mt-4 p-3 rounded-lg bg-violet-950/30 border border-violet-500/30 text-violet-200 text-xs flex items-start gap-2.5">
            <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-violet-300">Executor Profile Active: </span>
              Nonstandard executor hooks are permitted. Note that execution is strictly tied to specific third-party injection runtimes and is not compatible with normal Roblox Studio servers or live game clients.
            </div>
          </div>
        )}

        {/* Encrypted Recovery Vault Toggle */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              id="enableRecovery"
              checked={enableSourceRecovery}
              onChange={(e) => setEnableSourceRecovery(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="enableRecovery" className="text-xs font-medium text-slate-200 cursor-pointer flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              Enable Encrypted Source Recovery Vault (AES-256-GCM)
            </label>
          </div>
          <div className="text-[11px] text-slate-400">
            Encrypted with private master key. Decryptable only by you.
          </div>
        </div>

        {/* Advanced Options Accordion Toggle */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-medium transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showAdvancedOptions ? 'Hide' : 'Configure'} Fine-Grained Transformations</span>
            {showAdvancedOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showAdvancedOptions && (
            <div className="mt-3 p-4 bg-slate-950 rounded-lg border border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={identifierRenaming}
                  onChange={(e) => setIdentifierRenaming(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                />
                <span>Scope-Aware Renaming</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stringEncryption}
                  onChange={(e) => setStringEncryption(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                />
                <span>XOR String Encryption & Decryptor</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={constantPooling}
                  onChange={(e) => setConstantPooling(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                />
                <span>Constant Pooling</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={controlFlowFlattening}
                  onChange={(e) => setControlFlowFlattening(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                />
                <span className="text-cyan-300 font-medium">Control Flow Flattening (CFF)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={opaquePredicates}
                  onChange={(e) => setOpaquePredicates(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                />
                <span>Opaque Predicates</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeCommentsAndWhitespace}
                  onChange={(e) => setRemoveCommentsAndWhitespace(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                />
                <span>Minify & Strip Comments</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={antiTamperPrelude}
                  onChange={(e) => setAntiTamperPrelude(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                />
                <span>Runtime Anti-Tamper Check</span>
              </label>

              <label className="flex items-center gap-2 text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={barcodeRenaming}
                  onChange={(e) => setBarcodeRenaming(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-amber-500"
                />
                <span>Barcode Renaming (_IlIIlIll)</span>
              </label>

              <label className="flex items-center gap-2 text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={antiHookTraps}
                  onChange={(e) => setAntiHookTraps(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-amber-500"
                />
                <span>Luraph Anti-Hook & Metatable Sentinel</span>
              </label>

              <label className="flex items-center gap-2 text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={globalAccessObfuscation}
                  onChange={(e) => setGlobalAccessObfuscation(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-amber-500"
                />
                <span>Global Registry Virtualization</span>
              </label>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={deterministic}
                    onChange={(e) => setDeterministic(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-cyan-500"
                  />
                  <span>Seed:</span>
                </label>
                <input
                  type="number"
                  disabled={!deterministic}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  className="w-20 bg-slate-900 border border-slate-700 text-slate-200 px-2 py-0.5 rounded text-xs disabled:opacity-40"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor & Pre-Flight Analysis Container */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        {/* Editor Header Bar */}
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-cyan-400" />
              Source Script:
            </span>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-200 px-2.5 py-1 rounded text-xs font-mono focus:outline-none focus:border-cyan-500"
              placeholder="Script.luau"
            />
          </div>

          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px] tabular-nums">
            <span>{lineCount} lines</span>
            <span>·</span>
            <span>{(byteSize / 1024).toFixed(1)} KB</span>
            <span>·</span>
            <label className="text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1 font-sans">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload File</span>
              <input
                type="file"
                accept=".lua,.luau,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Code Input Area */}
        <div className="relative">
          <textarea
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value)}
            spellCheck={false}
            rows={18}
            className="w-full bg-slate-950 p-4 font-mono text-xs text-slate-200 focus:outline-none border-0 resize-y leading-relaxed selection:bg-cyan-500/20"
            placeholder="-- Paste your Roblox Luau or standard Lua source code here..."
          />
        </div>

        {/* Pre-Flight AST Analysis Status Bar */}
        <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">AST Status:</span>
            {analysisLoading ? (
              <span className="text-slate-400 font-mono text-xs">Parsing AST...</span>
            ) : isSyntaxValid ? (
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                Valid Luau Syntax
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1 font-medium">
                Syntax Error Detected
              </span>
            )}

            {detectedRobloxGlobals.length > 0 && (
              <span className="text-slate-400 hidden sm:inline">
                · Globals: <span className="text-cyan-300 font-mono">{detectedRobloxGlobals.slice(0, 4).join(', ')}{detectedRobloxGlobals.length > 4 ? ` +${detectedRobloxGlobals.length - 4}` : ''}</span>
              </span>
            )}
          </div>

          <div>
            <button
              type="button"
              disabled={isProcessing || !sourceCode.trim()}
              onClick={handleExecuteObfuscation}
              className="px-5 py-2 text-xs font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-cyan-300 hover:from-cyan-300 hover:to-cyan-200 rounded-lg transition-all flex items-center gap-2 shadow-md shadow-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Transforming AST...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Obfuscate Code</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
