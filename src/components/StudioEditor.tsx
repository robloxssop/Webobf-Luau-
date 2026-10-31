import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Play,
  Upload,
  Sparkles,
  Info,
  AlertTriangle,
  Cpu,
  FileText
} from 'lucide-react';
import {
  CompatibilityProfile,
  ObfuscationOptions,
  ObfuscationResult
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

  // Live pre-flight analysis state
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [detectedExecutorApis, setDetectedExecutorApis] = useState<string[]>([]);
  const [isSyntaxValid, setIsSyntaxValid] = useState<boolean>(true);

  // Run pre-flight analysis
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!sourceCode.trim()) {
        setDetectedExecutorApis([]);
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
        setDetectedExecutorApis(data.detectedExecutorApis || []);
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
      preset: 'luraph',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      barcodeRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: true,
      antiHookTraps: true,
      globalAccessObfuscation: true,
      memberAccessObfuscation: true,
      deterministic: false,
      enableSourceRecovery: true,
      projectName,
    };

    onObfuscate(sourceCode, options);
  };

  const lineCount = sourceCode.split('\n').length;
  const byteSize = new Blob([sourceCode]).size;

  return (
    <div className="space-y-5">
      {/* Target Compatibility Selector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-cyan-400" />
              เลือกแพลตฟอร์มเป้าหมาย (Target Platform)
            </label>
            <p className="text-xs text-slate-400 mt-1">
              ระบบจะเข้ารหัสด้วยเทคโนโลยีป้องกันระดับสูงสุด (Luraph Engine) โดยอัตโนมัติ
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setProfile('roblox_studio')}
              className={`px-4 py-2.5 text-xs font-medium rounded-md transition-all text-left min-w-[140px] cursor-pointer ${
                profile === 'roblox_studio'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <span>Roblox Studio</span>
              </div>
              <div className="text-[10px] text-slate-400 font-normal">สำหรับแมพ/เกมปกติ (100% Safe)</div>
            </button>

            <button
              type="button"
              onClick={() => setProfile('executor_ext')}
              className={`px-4 py-2.5 text-xs font-medium rounded-md transition-all text-left min-w-[140px] cursor-pointer ${
                profile === 'executor_ext'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <span>Executor</span>
              </div>
              <div className="text-[10px] text-slate-400 font-normal">สำหรับตัวรันสคริปต์ภายนอก</div>
            </button>
          </div>
        </div>

        {/* Profile Warning Banners */}
        {profile === 'roblox_studio' && detectedExecutorApis.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">แจ้งเตือน: </span>
              โค้ดนี้มีการเรียกใช้ Executor APIs (
              <span className="font-mono text-amber-100">{detectedExecutorApis.join(', ')}</span>
              ) ซึ่ง Roblox Studio ปกติไม่รองรับ หากนำไปใส่ในเกม Studio จะเกิด Error แนะนำเปลี่ยนเป็นโหมด Executor
            </div>
          </div>
        )}

        {profile === 'executor_ext' && (
          <div className="mt-4 p-3 rounded-lg bg-violet-950/30 border border-violet-500/30 text-violet-200 text-xs flex items-start gap-2.5">
            <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-violet-300">Executor Mode Active: </span>
              อนุญาตให้ใช้ฟังก์ชันพิเศษของตัวรันภายนอกได้ทุกชนิด
            </div>
          </div>
        )}
      </div>

      {/* Editor & Pre-Flight Analysis Container */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        {/* Editor Header Bar */}
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-cyan-400" />
              Source Code (โค้ดต้นฉบับ):
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
            <select
              onChange={(e) => handleLoadSample(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">-- ตัวอย่างสคริปต์ (Templates) --</option>
              {SAMPLE_SCRIPTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span>{lineCount} lines</span>
            <span>·</span>
            <span>{(byteSize / 1024).toFixed(1)} KB</span>
            <span>·</span>
            <label className="text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1 font-sans">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload</span>
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
            placeholder="-- วางโค้ด Roblox Luau หรือ standard Lua ของคุณที่นี่..."
          />
        </div>

        {/* Pre-Flight AST Analysis Status Bar */}
        <div className="px-4 py-3 bg-slate-950/90 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">สถานะโค้ด:</span>
            {analysisLoading ? (
              <span className="text-slate-400 font-mono text-xs">กำลังตรวจสอบ AST...</span>
            ) : isSyntaxValid ? (
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                <ShieldCheck className="w-4 h-4" />
                ไวยากรณ์ถูกต้อง (Valid Luau)
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1 font-medium">
                <AlertTriangle className="w-4 h-4" />
                พบข้อผิดพลาดทางไวยากรณ์ (Syntax Error)
              </span>
            )}
          </div>

          <div>
            <button
              type="button"
              disabled={isProcessing || !sourceCode.trim()}
              onClick={handleExecuteObfuscation}
              className="px-6 py-2.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-cyan-300 hover:from-cyan-300 hover:to-cyan-200 rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>กำลังแปลงโค้ดด้วย Luraph Engine...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Obfuscate Code (แปลงโค้ดทันที)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

