import * as luaparse from 'luaparse';
import {
  ObfuscationOptions,
  ObfuscationResult,
  Diagnostic,
  ObfuscationMode,
  StringEncodingMode
} from '../../src/types/index.ts';
import { ROBLOX_STUDIO_GLOBALS, analyzeLuaSource, sanitizeLuauSyntax } from './luauAnalyzer.ts';
import { checkScriptCompatibility } from './compatibilityChecker.ts';
import {
  encodeStringToByteArray,
  encodeStringToBase64,
  getByteArrayRuntimeDecoder,
  getBase64RuntimeDecoder,
  getDynamicCompilationRuntimeWrapper,
  createEncryptedConstantPool,
  ConstantPoolResult
} from './codecs.ts';
import { applyControlFlowFlattening } from './controlFlowFlattener.ts';
import { compileToLuauVM } from './luauVM.ts';
import {
  generateBarcodeIdentifier,
  getLuraphAntiTamperPrelude,
  getGlobalRegistryVirtualizer,
  encodeNumberLuraph
} from './luraphProtector.ts';

// PRNG generator for deterministic vs random builds
class PRNG {
  private state: number;

  constructor(seed?: number) {
    this.state = seed !== undefined ? (seed >>> 0) : Math.floor(Math.random() * 0xffffffff);
  }

  // Simple Mulberry32 PRNG
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextHex(length: number): string {
    const chars = '0123456789abcdef';
    let res = '';
    for (let i = 0; i < length; i++) {
      res += chars[this.nextInt(0, chars.length - 1)];
    }
    return res;
  }
}

/**
 * Collects all table key names ({ key = val }) and member expression properties (obj.prop, obj:method)
 * so that local variable renaming never corrupts table dictionary schemas.
 */
function collectTableAndMemberProperties(ast: any): Set<string> {
  const propertyNames = new Set<string>();

  function walk(node: any) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'TableKeyString' && node.key && node.key.name) {
      propertyNames.add(node.key.name);
    } else if (node.type === 'MemberExpression' && node.identifier && node.identifier.name) {
      propertyNames.add(node.identifier.name);
    }

    for (const key of Object.keys(node)) {
      if (key !== 'range' && key !== 'loc') {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(walk);
        } else if (child && typeof child === 'object') {
          walk(child);
        }
      }
    }
  }

  walk(ast);
  return propertyNames;
}

/**
 * Traverses an AST tree and collects local identifiers that can be safely renamed
 * without colliding with Roblox globals, table keys, or member properties.
 */
function collectIdentifiersToRename(ast: any): Set<string> {
  const localNames = new Set<string>();
  const protectedProperties = collectTableAndMemberProperties(ast);

  function isSafeToRename(name: string): boolean {
    if (!name || name.length === 0) return false;
    if (ROBLOX_STUDIO_GLOBALS.has(name)) return false;
    if (protectedProperties.has(name)) return false;
    return true;
  }

  function walk(node: any) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'LocalStatement') {
      if (Array.isArray(node.variables)) {
        for (const v of node.variables) {
          if (v && v.type === 'Identifier' && isSafeToRename(v.name)) {
            localNames.add(v.name);
          }
        }
      }
    } else if (node.type === 'FunctionDeclaration') {
      if (node.isLocal && node.identifier && node.identifier.type === 'Identifier') {
        if (isSafeToRename(node.identifier.name)) {
          localNames.add(node.identifier.name);
        }
      }
      if (Array.isArray(node.parameters)) {
        for (const p of node.parameters) {
          if (p && p.type === 'Identifier' && isSafeToRename(p.name)) {
            localNames.add(p.name);
          }
        }
      }
    } else if (node.type === 'ForNumericStatement' || node.type === 'ForGenericStatement') {
      if (node.variable && node.variable.type === 'Identifier' && isSafeToRename(node.variable.name)) {
        localNames.add(node.variable.name);
      }
      if (Array.isArray(node.variables)) {
        for (const v of node.variables) {
          if (v && v.type === 'Identifier' && isSafeToRename(v.name)) {
            localNames.add(v.name);
          }
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key !== 'range' && key !== 'loc' && key !== 'base' && key !== 'indexer') {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(walk);
        } else if (child && typeof child === 'object') {
          walk(child);
        }
      }
    }
  }

  walk(ast);
  return localNames;
}

/**
 * Evaluates escaped character sequences in string literals
 */
function unescapeLuaString(rawContent: string): string {
  try {
    // Unescape standard Lua escape sequences
    return rawContent
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  } catch {
    return rawContent;
  }
}

/**
 * Virtualizes table key assignments ({ key = val }) and dot member expressions (obj.prop)
 * into index expressions with strings ({ ["key"] = val }, obj["prop"])
 * so that all identifiers and field names are absorbed into the centralized constant pool.
 */
function virtualizeTableKeysAndMembers(source: string): string {
  try {
    const ast = luaparse.parse(source, { ranges: true, luaVersion: '5.1' });
    const replacements: { start: number; end: number; replacement: string }[] = [];

    function walk(node: any) {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'TableKeyString' && node.key && node.key.name) {
        replacements.push({
          start: node.key.range[0],
          end: node.key.range[1],
          replacement: `["${node.key.name}"]`
        });
      } else if (node.type === 'MemberExpression' && node.indexer === '.' && node.identifier && node.identifier.name) {
        replacements.push({
          start: node.base.range[1],
          end: node.identifier.range[1],
          replacement: `["${node.identifier.name}"]`
        });
      } else if (node.type === 'FunctionDeclaration' && node.identifier && node.identifier.type === 'MemberExpression') {
        const mem = node.identifier;
        if (mem.identifier && mem.identifier.name && mem.base && mem.base.range) {
          const openParenIdx = source.indexOf('(', mem.identifier.range[1]);
          if (openParenIdx !== -1) {
            if (mem.indexer === ':') {
              const hasParams = node.parameters && node.parameters.length > 0;
              const selfParam = hasParams ? 'self, ' : 'self';
              replacements.push({
                start: node.range[0],
                end: openParenIdx + 1,
                replacement: `${source.slice(mem.base.range[0], mem.base.range[1])}["${mem.identifier.name}"] = function(${selfParam}`
              });
            } else if (mem.indexer === '.') {
              replacements.push({
                start: node.range[0],
                end: openParenIdx + 1,
                replacement: `${source.slice(mem.base.range[0], mem.base.range[1])}["${mem.identifier.name}"] = function(`
              });
            }
          }
        }
      } else if (node.type === 'CallExpression' && node.base && node.base.type === 'MemberExpression' && node.base.indexer === ':') {
        const mem = node.base;
        if (mem.base && mem.base.type === 'Identifier' && mem.identifier && mem.identifier.name && mem.base.name !== 'game' && mem.base.name !== 'workspace') {
          const objName = mem.base.name;
          const methodName = mem.identifier.name;
          const openParenIdx = source.indexOf('(', mem.identifier.range[1]);
          if (openParenIdx !== -1) {
            const hasArgs = node.arguments && node.arguments.length > 0;
            replacements.push({
              start: mem.base.range[0],
              end: openParenIdx + 1,
              replacement: `${objName}["${methodName}"](${objName}${hasArgs ? ', ' : ''}`
            });
          }
        }
      }

      for (const k of Object.keys(node)) {
        if (k !== 'range' && k !== 'loc') {
          const child = node[k];
          if (Array.isArray(child)) child.forEach(walk);
          else if (child && typeof child === 'object') walk(child);
        }
      }
    }

    walk(ast);
    replacements.sort((a, b) => b.start - a.start);

    let result = source;
    for (const r of replacements) {
      result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
    }
    return result;
  } catch {
    return source;
  }
}

function splitStringIntoFragments(str: string, minLen = 2, maxLen = 4): string[] {
  if (str.length <= maxLen) return [str];
  const fragments: string[] = [];
  let pos = 0;
  while (pos < str.length) {
    const rem = str.length - pos;
    if (rem <= maxLen) {
      fragments.push(str.slice(pos));
      break;
    }
    const len = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen;
    fragments.push(str.slice(pos, pos + len));
    pos += len;
  }
  return fragments;
}

/**
 * Obfuscates Roblox Lua / Luau code with verified AST transformation and runtime compatibility.
 */
export function obfuscateLua(
  sourceCode: string,
  rawOptions?: Partial<ObfuscationOptions>,
  jobId: string = 'job_' + Date.now().toString(36)
): ObfuscationResult {
  const startTime = Date.now();
  const diagnostics: Diagnostic[] = [];

  const isLuraphPreset = rawOptions?.preset === 'luraph';

  const options: ObfuscationOptions = {
    profile: rawOptions?.profile || 'roblox_studio',
    preset: rawOptions?.preset || 'basic',
    mode: rawOptions?.mode || 'direct_luau',
    stringEncoding: rawOptions?.stringEncoding || 'byte_array',
    identifierRenaming: isLuraphPreset ? true : (rawOptions?.identifierRenaming ?? true),
    barcodeRenaming: isLuraphPreset ? true : (rawOptions?.barcodeRenaming ?? (rawOptions?.preset === 'maximum')),
    stringEncryption: isLuraphPreset ? true : (rawOptions?.stringEncryption ?? true),
    constantPooling: isLuraphPreset ? true : (rawOptions?.constantPooling ?? true),
    controlFlowFlattening: isLuraphPreset ? (rawOptions?.controlFlowFlattening ?? true) : (rawOptions?.preset === 'maximum' ? (rawOptions?.controlFlowFlattening ?? true) : (rawOptions?.controlFlowFlattening ?? false)),
    opaquePredicates: isLuraphPreset ? true : (rawOptions?.opaquePredicates ?? (rawOptions?.preset !== 'basic')),
    removeCommentsAndWhitespace: rawOptions?.removeCommentsAndWhitespace ?? true,
    antiTamperPrelude: isLuraphPreset ? true : (rawOptions?.antiTamperPrelude ?? (rawOptions?.preset === 'maximum')),
    antiHookTraps: isLuraphPreset ? true : (rawOptions?.antiHookTraps ?? false),
    globalAccessObfuscation: isLuraphPreset ? true : (rawOptions?.globalAccessObfuscation ?? (rawOptions?.preset === 'maximum')),
    memberAccessObfuscation: isLuraphPreset ? true : (rawOptions?.memberAccessObfuscation ?? (rawOptions?.preset === 'maximum')),
    deterministic: rawOptions?.deterministic ?? false,
    enableSourceRecovery: rawOptions?.enableSourceRecovery ?? false,
    projectName: rawOptions?.projectName || 'RobloxScript.luau'
  };

  const mode: ObfuscationMode = options.mode || 'direct_luau';
  const stringEncoding: StringEncodingMode = options.stringEncoding || 'byte_array';

  // --- PHASE 1: PARSING ---
  const analysis = analyzeLuaSource(sourceCode, options.profile);
  for (const diag of analysis.diagnostics) {
    diagnostics.push({
      ...diag,
      phase: 'Parsing',
    });
  }

  if (!analysis.valid) {
    return {
      jobId,
      success: false,
      obfuscatedCode: `-- [AegisLua Build Failed]\n-- Analysis error in Parsing phase: Syntax could not be parsed safely.\n-- Review diagnostics for error coordinates.`,
      originalSizeBytes: Buffer.byteLength(sourceCode, 'utf8'),
      obfuscatedSizeBytes: 0,
      transformationTimeMs: Date.now() - startTime,
      diagnostics,
      profile: options.profile,
      preset: options.preset,
      mode,
      failedPhase: 'Parsing',
      errorMessage: analysis.syntaxError?.message || 'Lua/Luau AST syntax parsing failed',
      astValid: false,
    };
  }

  // --- PHASE 2: RUNTIME COMPATIBILITY CHECK ---
  const compat = checkScriptCompatibility(sourceCode, options.profile);
  diagnostics.push(...compat.diagnostics);

  const prng = new PRNG(options.deterministic ? (options.seed || 1337) : undefined);
  // Sanitize Luau-specific syntax (compound operators like +=, type annotations) for universal execution
  let processedCode = sanitizeLuauSyntax(sourceCode).sanitized;

  // Apply Member & Table Key Virtualization
  if (options.memberAccessObfuscation) {
    processedCode = virtualizeTableKeysAndMembers(processedCode);
  }

  let activeAst = analysis.ast;
  if (options.memberAccessObfuscation) {
    try {
      activeAst = luaparse.parse(processedCode, { ranges: true, luaVersion: '5.1' });
    } catch {
      activeAst = analysis.ast;
    }
  }

  // --- PHASE 3: IDENTIFIER ANALYSIS ---
  const localIdentifiers = collectIdentifiersToRename(activeAst);
  const identifierMap = new Map<string, string>();

  let index = 1;
  for (const name of localIdentifiers) {
    if (!identifierMap.has(name)) {
      const mangled = (options.barcodeRenaming || isLuraphPreset || options.preset === 'maximum')
        ? generateBarcodeIdentifier(index, options.seed || prng.nextInt(100, 99999))
        : `_Il_0x${prng.nextHex(3)}_${index.toString(16)}`;
      identifierMap.set(name, mangled);
      index++;
    }
  }

  // Apply features by preset
  const applyRenaming = options.identifierRenaming || options.preset !== 'basic';
  const applyStringEnc = options.stringEncryption || options.preset === 'advanced' || options.preset === 'maximum' || isLuraphPreset;
  const applyAntiTamper = options.antiTamperPrelude || options.preset === 'maximum' || isLuraphPreset;

  // Standard Roblox and Lua 5.1 / Luau globals eligible for virtualization
  const VIRTUALIZED_GLOBALS = [
    'game', 'workspace', 'task', 'script', 'math', 'string', 'table',
    'pairs', 'ipairs', 'Vector3', 'CFrame', 'Instance', 'Color3', 'Enum',
    'tonumber', 'tostring', 'print', 'warn', 'pcall', 'tick', 'type',
    'unpack', 'select', 'setmetatable', 'getmetatable', 'rawget', 'rawset'
  ];

  // --- PHASE 4: ENCODING & CONSTANT PROTECTION ---
  const encodedPlaceholderMap = new Map<string, string>();
  let placeholderCounter = 0;
  let activeConstantPool: ConstantPoolResult | null = null;
  let activeGAccessorName = '_g_' + Math.random().toString(36).substring(2, 6);
  const virtualizedGlobalsUsed: string[] = [];

  const useConstantPool = options.constantPooling && mode !== 'luau_vm';

  if (applyStringEnc || options.globalAccessObfuscation) {
    try {
      const stringLiteralRegex = /("([^"\\]*(\\.[^"\\]*)*)"|'([^'\\]*(\\.[^'\\]*)*)')/g;

      if (useConstantPool) {
        const randTag = Math.random().toString(36).substring(2, 6);
        const kAccessorName = '_k_' + randTag;
        const gAccessorName = activeGAccessorName;

        const extractedStrings: string[] = [];
        const stringToFragmentsMap = new Map<string, string[]>();

        let match: RegExpExecArray | null;
        while ((match = stringLiteralRegex.exec(processedCode)) !== null) {
          const rawContent = match[0].slice(1, -1);
          if (rawContent.length > 0) {
            const unescaped = unescapeLuaString(rawContent);
            if (!stringToFragmentsMap.has(unescaped)) {
              // Fragment splitting for string encryption (Item 4)
              const fragments = (isLuraphPreset || options.preset === 'maximum' || options.preset === 'advanced')
                ? splitStringIntoFragments(unescaped, 2, 4)
                : [unescaped];
              stringToFragmentsMap.set(unescaped, fragments);
              for (const frag of fragments) {
                extractedStrings.push(frag);
              }
            }
          }
        }

        // Collect virtualized globals if globalAccessObfuscation is enabled
        if (options.globalAccessObfuscation) {
          const protectedProps = collectTableAndMemberProperties(activeAst);
          for (const g of VIRTUALIZED_GLOBALS) {
            if (!localIdentifiers.has(g) && !protectedProps.has(g)) {
              const gRegex = new RegExp(`(?<![.:"'\\w])${g}\\b`);
              if (gRegex.test(processedCode)) {
                virtualizedGlobalsUsed.push(g);
                extractedStrings.push(g);
              }
            }
          }
        }

        activeConstantPool = createEncryptedConstantPool(extractedStrings, {
          seed: options.seed || prng.nextInt(100, 99999),
          xorKey: prng.nextInt(0x15, 0xeb),
          accessorName: kAccessorName,
          addDecoys: true,
        });

        // Replace strings with concatenated fragment accessors (Item 4 & Bug 8 Fix)
        processedCode = processedCode.replace(stringLiteralRegex, (m) => {
          const rawContent = m.slice(1, -1);
          if (rawContent.length === 0) return m;
          const unescaped = unescapeLuaString(rawContent);
          const fragments = stringToFragmentsMap.get(unescaped) || [unescaped];
          const codeParts: string[] = [];
          for (const frag of fragments) {
            const id = activeConstantPool!.idMap.get(frag);
            if (id !== undefined) {
              codeParts.push(`${activeConstantPool!.accessorName}(0x${id.toString(16)})`);
            }
          }
          if (codeParts.length > 0) {
            const placeholder = `__STR_FRAG_${placeholderCounter++}__`;
            encodedPlaceholderMap.set(placeholder, codeParts.join(' .. '));
            return placeholder;
          }
          return m;
        });

        // Replace virtualized globals with placeholders mapped to gAccessorName(id)
        if (options.globalAccessObfuscation && virtualizedGlobalsUsed.length > 0) {
          for (const g of virtualizedGlobalsUsed) {
            const id = activeConstantPool.idMap.get(g);
            if (id !== undefined) {
              const gRegex = new RegExp(`(?<![.:"'\\w])${g}\\b`, 'g');
              const placeholder = `__GLOB_FRAG_${placeholderCounter++}__`;
              processedCode = processedCode.replace(gRegex, placeholder);
              encodedPlaceholderMap.set(placeholder, `${gAccessorName}(0x${id.toString(16)})`);
            }
          }
        }

        diagnostics.push({
          phase: 'Encoding',
          severity: 'info',
          message: `Centralized Encrypted Constant Pool created: ${activeConstantPool.poolSize} entries (${activeConstantPool.decoyCount} decoy honeypots) with rolling per-ID cipher. Zero inline byte arrays exposed.`,
          rule: 'constant-pool-success',
        });

        if (virtualizedGlobalsUsed.length > 0) {
          diagnostics.push({
            phase: 'Transformation',
            severity: 'info',
            message: `Global Access Virtualization applied to ${virtualizedGlobalsUsed.length} globals (${virtualizedGlobalsUsed.join(', ')}).`,
            rule: 'global-virtualization-applied',
          });
        }
      } else if (applyStringEnc) {
        // Fallback to inline byte array or base64 (e.g. for strict base64 / byte array unit tests)
        processedCode = processedCode.replace(stringLiteralRegex, (match) => {
          const rawContent = match.slice(1, -1);
          if (rawContent.length === 0) return match;

          const unescaped = unescapeLuaString(rawContent);
          const xorKey = prng.nextInt(0x15, 0xeb);
          const stringSeed = prng.nextInt(0x11, 0xf7);
          const encoded = stringEncoding === 'base64_xor'
            ? encodeStringToBase64(unescaped, xorKey, stringSeed)
            : encodeStringToByteArray(unescaped, xorKey, stringSeed);

          const placeholder = `__AEGIS_STR_${placeholderCounter++}__`;
          encodedPlaceholderMap.set(placeholder, encoded.codeSnippet);
          return placeholder;
        });

        diagnostics.push({
          phase: 'Encoding',
          severity: 'info',
          message: `Successfully encoded ${encodedPlaceholderMap.size} string literals using ${stringEncoding === 'base64_xor' ? 'Base64 Rolling Cipher' : 'Dynamic Rolling UTF-8 Byte-Array'} scheme with accumulator feedback.`,
          rule: 'string-encoding-success',
        });
      }
    } catch (err: any) {
      return {
        jobId,
        success: false,
        obfuscatedCode: `-- [AegisLua Build Failed]\n-- String Encoding phase failed: ${err.message}`,
        originalSizeBytes: Buffer.byteLength(sourceCode, 'utf8'),
        obfuscatedSizeBytes: 0,
        transformationTimeMs: Date.now() - startTime,
        diagnostics,
        profile: options.profile,
        preset: options.preset,
        mode,
        failedPhase: 'Encoding',
        errorMessage: err.message,
        astValid: false,
      };
    }
  }

  // --- PHASE 5: TRANSFORMATION (BOOLEANS, NUMBERS, RENAMING) ---
  try {
    if (isLuraphPreset || options.preset !== 'basic' || options.opaquePredicates) {
      // Dynamic runtime-environment boolean transformation (immune to constant folding)
      processedCode = processedCode.replace(/\btrue\b/g, '((type(pcall) == "function") and (#type("a") == 6))');
      processedCode = processedCode.replace(/\bfalse\b/g, '((type(pcall) ~= "function") or (#type("a") ~= 6))');

      // Safe integer arithmetic transformation using Luraph number encoder
      processedCode = processedCode.replace(/(?<![\w.])\b([0-9][0-9]?)\b(?![\w.])/g, (match, numStr) => {
        const num = parseInt(numStr, 10);
        if (num >= 0 && num <= 50) {
          return (isLuraphPreset || options.preset === 'maximum') ? encodeNumberLuraph(num) : `(${num + 7}-7)`;
        }
        return match;
      });
    }

    // Rename local variables (ensures we do not rename object properties like .Name or :Method)
    if (applyRenaming && identifierMap.size > 0) {
      for (const [original, mangled] of identifierMap.entries()) {
        const varRegex = new RegExp(`(?<![.:"'\\w])${original}\\b`, 'g');
        processedCode = processedCode.replace(varRegex, mangled);
      }
      diagnostics.push({
        phase: 'Transformation',
        severity: 'info',
        message: `${isLuraphPreset ? 'Luraph barcode' : 'Scope-aware'} renaming applied to ${identifierMap.size} local identifiers.`,
        rule: 'identifier-renaming-success',
      });
    }

    // Restore string & global placeholders
    for (const [placeholder, codeSnippet] of encodedPlaceholderMap.entries()) {
      processedCode = processedCode.split(placeholder).join(codeSnippet);
    }

    // --- CONTROL FLOW FLATTENING PASS ---
    const applyCFF = options.controlFlowFlattening || options.preset === 'maximum' || isLuraphPreset;
    if (applyCFF) {
      try {
        const cffResult = applyControlFlowFlattening(processedCode, {
          opaquePredicates: options.opaquePredicates || isLuraphPreset,
          seed: options.seed || prng.nextInt(1000, 99999),
        });
        if (cffResult.flattened) {
          processedCode = cffResult.code;
          diagnostics.push({
            phase: 'Transformation',
            severity: 'info',
            message: `Control Flow Flattening applied: ${cffResult.blockCount} blocks (${cffResult.decoyCount} decoy branches) routed through non-linear jump-table dispatcher.`,
            rule: 'cff-flattening-applied',
          });
        }
      } catch (cffErr: any) {
        diagnostics.push({
          phase: 'Transformation',
          severity: 'warning',
          message: `Control flow flattening skipped for complex construct: ${cffErr.message}`,
          rule: 'cff-skipped',
        });
      }
    }

    if (isLuraphPreset) {
      diagnostics.push({
        phase: 'Transformation',
        severity: 'info',
        message: 'Luraph-Grade protection active: Barcode variable obfuscation, anti-hook sentinel, decompiler trap branch, and control flow flattening applied.',
        rule: 'luraph-protections-applied',
      });
    }
  } catch (err: any) {
    return {
      jobId,
      success: false,
      obfuscatedCode: `-- [AegisLua Build Failed]\n-- Transformation phase failed: ${err.message}`,
      originalSizeBytes: Buffer.byteLength(sourceCode, 'utf8'),
      obfuscatedSizeBytes: 0,
      transformationTimeMs: Date.now() - startTime,
      diagnostics,
      profile: options.profile,
      preset: options.preset,
      mode,
      failedPhase: 'Transformation',
      errorMessage: err.message,
      astValid: false,
    };
  }

  // Comment & whitespace minification
  if (options.removeCommentsAndWhitespace) {
    processedCode = processedCode.replace(/--\[\[[\s\S]*?\]\]/g, '');
    processedCode = processedCode.replace(/--[^\n\r]*/g, '');
    processedCode = processedCode.replace(/\n\s*\n+/g, '\n');
  }

  // --- PHASE 6: DECODING RUNTIME PRELUDE & EXECUTION WRAPPER ---
  const preludeLines: string[] = options.removeCommentsAndWhitespace ? [] : [
    `-- Protected by AegisLua Code Protection System [Profile: ${options.profile} | Preset: ${options.preset} | Mode: ${mode}]`,
  ];

  if (isLuraphPreset || options.antiHookTraps) {
    preludeLines.push(getLuraphAntiTamperPrelude({ seed: options.seed || prng.nextInt(100, 99999) }));
  } else if (applyAntiTamper) {
    preludeLines.push(
      `local _ENV_CHECK = (type(pcall) == "function" and type(table) == "table" and type(string) == "table")`,
      `if not _ENV_CHECK then error("", 0) end`
    );
  }

  // Inject decoding helper or constant pool (VM has built-in constant table)
  if (mode !== 'luau_vm') {
    if (activeConstantPool) {
      preludeLines.push(activeConstantPool.prelude);
      if (options.globalAccessObfuscation && virtualizedGlobalsUsed.length > 0) {
        preludeLines.push(getGlobalRegistryVirtualizer(activeConstantPool.accessorName, activeGAccessorName).prelude);
      }
    } else if (applyStringEnc && encodedPlaceholderMap.size > 0) {
      if (stringEncoding === 'base64_xor') {
        preludeLines.push(getBase64RuntimeDecoder());
      } else {
        preludeLines.push(getByteArrayRuntimeDecoder());
      }
    }
  }

  let finalOutput = '';

  if (mode === 'luau_vm') {
    // Pure-Luau Bytecode Virtual Machine mode (Zero loadstring, Roblox Studio compatible)
    const vmRes = compileToLuauVM(sourceCode, {
      seed: options.seed || prng.nextInt(1, 255),
      antiTamper: applyAntiTamper,
    });

    if (vmRes.success) {
      finalOutput = preludeLines.join('\n') + '\n\n' + vmRes.code;
      diagnostics.push({
        phase: 'Transformation',
        severity: 'info',
        message: `Compiled to Pure-Luau Bytecode VM (${vmRes.instructionCount} instructions, ${vmRes.constantCount} constants). Executes without loadstring.`,
        rule: 'luau-vm-compiled',
      });
    } else {
      diagnostics.push({
        phase: 'Transformation',
        severity: 'warning',
        message: `Luau VM compilation fallback to Direct Luau: ${vmRes.error}`,
        rule: 'luau-vm-fallback',
      });
      finalOutput = preludeLines.join('\n') + '\n\n' + processedCode.trim();
    }
  } else if (mode === 'dynamic_payload') {
    // Dynamic payload wrapper with ACTIVE capability check (Requirement 5)
    let payloadInner = processedCode.trim();
    if (applyStringEnc && encodedPlaceholderMap.size > 0) {
      const decoderCode = stringEncoding === 'base64_xor'
        ? getBase64RuntimeDecoder()
        : getByteArrayRuntimeDecoder();
      payloadInner = decoderCode + '\n' + payloadInner;
    }

    const encodedPayload = stringEncoding === 'base64_xor'
      ? encodeStringToBase64(payloadInner, prng.nextInt(0x15, 0xeb))
      : encodeStringToByteArray(payloadInner, prng.nextInt(0x15, 0xeb));

    const dynamicWrapper = getDynamicCompilationRuntimeWrapper(encodedPayload.codeSnippet);
    finalOutput = preludeLines.join('\n') + '\n\n' + dynamicWrapper;
  } else {
    finalOutput = preludeLines.join('\n') + '\n\n' + processedCode.trim();
  }

  // Unconditionally strip all comment lines and fingerprints (Item 1 & 2)
  finalOutput = finalOutput.replace(/--\[\[[\s\S]*?\]\]/g, '');
  finalOutput = finalOutput.replace(/--[^\n\r]*/g, '');
  finalOutput = finalOutput.replace(/\n\s*\n+/g, '\n').trim();

  // --- PHASE 7: POST-TRANSFORMATION AST VALIDATION (Requirement 1 & 3) ---
  let astValid = false;
  try {
    const postAst = luaparse.parse(finalOutput, {
      wait: false,
      comments: false,
      luaVersion: '5.1',
    });
    astValid = !!postAst;
    diagnostics.push({
      phase: 'Parsing',
      severity: 'info',
      message: 'Post-transformation verification successful: output AST conforms to Lua 5.1/Luau specification.',
      rule: 'post-ast-verification-success',
    });
  } catch (err: any) {
    diagnostics.push({
      phase: 'Transformation',
      severity: 'error',
      message: `Post-transformation AST syntax validation failed: ${err.message || 'Unknown syntax error'}. Obfuscation aborted to prevent emitting broken code.`,
      rule: 'post-ast-verification-failure',
      mitigation: 'Adjust transformation settings or check source code syntax before obfuscating.',
    });

    return {
      jobId,
      success: false,
      obfuscatedCode: `-- [AegisLua Build Failed]\n-- Post-transformation AST validation failed: ${err.message}\n-- Aborted to prevent emitting non-executable code.`,
      originalSizeBytes: Buffer.byteLength(sourceCode, 'utf8'),
      obfuscatedSizeBytes: 0,
      transformationTimeMs: Date.now() - startTime,
      diagnostics,
      profile: options.profile,
      preset: options.preset,
      mode,
      failedPhase: 'Transformation',
      errorMessage: err.message,
      astValid: false,
    };
  }

  const originalSizeBytes = Buffer.byteLength(sourceCode, 'utf8');
  const obfuscatedSizeBytes = Buffer.byteLength(finalOutput, 'utf8');
  const transformationTimeMs = Date.now() - startTime;

  return {
    jobId,
    success: true,
    obfuscatedCode: finalOutput,
    originalSizeBytes,
    obfuscatedSizeBytes,
    transformationTimeMs,
    diagnostics,
    profile: options.profile,
    preset: options.preset,
    mode,
    compatibilityIssues: compat.issues,
    astValid,
  };
}
