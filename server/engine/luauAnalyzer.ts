import * as luaparse from 'luaparse';
import { CompatibilityProfile, Diagnostic } from '../../src/types/index.ts';

// Standard Roblox Studio Globals and Services
export const ROBLOX_STUDIO_GLOBALS = new Set([
  'game', 'workspace', 'script', 'task', 'Instance', 'Vector3', 'Vector2',
  'CFrame', 'Color3', 'BrickColor', 'TweenInfo', 'UDim', 'UDim2', 'RaycastParams',
  'Enum', 'shared', '_G', 'plugin', 'dockwidgetplugininfo', 'DateTime',
  'Random', 'Ray', 'Region3', 'Region3int16', 'Vector3int16', 'Axes', 'Faces',
  'ColorSequence', 'ColorSequenceKeypoint', 'NumberSequence', 'NumberSequenceKeypoint',
  'NumberRange', 'Rect', 'PhysicalProperties', 'Font', 'Content',
  'print', 'warn', 'error', 'assert', 'pcall', 'xpcall', 'select', 'type',
  'typeof', 'tostring', 'tonumber', 'unpack', 'setmetatable', 'getmetatable',
  'rawget', 'rawset', 'rawequal', 'rawlen', 'next', 'pairs', 'ipairs',
  'math', 'string', 'table', 'bit32', 'os', 'debug', 'utf8', 'coroutine'
]);

// Nonstandard Executor / Exploit APIs
export const EXECUTOR_SPECIFIC_APIS = [
  'getgenv', 'getrenv', 'getreg', 'getgc', 'getinstances', 'getnilinstances',
  'hookfunction', 'hookmetamethod', 'newcclosure', 'replaceclosure',
  'setreadonly', 'isreadonly', 'make_writeable', 'make_readonly',
  'getrawmetatable', 'setrawmetatable', 'setclipboard', 'toclipboard',
  'fireclickdetector', 'fireproximityprompt', 'firetouchinterest',
  'rconsoleprint', 'rconsolewarn', 'rconsoleerror', 'rconsoleclear',
  'syn', 'fluxus', 'krnl', 'identifyexecutor', 'checkcaller',
  'isexecutorclosure', 'request', 'http_request', 'syn_request',
  'getloadedmodules', 'getconnections', 'firesignal'
];

export interface AnalysisResult {
  valid: boolean;
  ast?: any;
  diagnostics: Diagnostic[];
  hasExecutorApis: boolean;
  detectedExecutorApis: string[];
  detectedRobloxGlobals: string[];
  syntaxError?: { line: number; column: number; message: string };
}

/**
 * Pre-processes Luau syntax enhancements (e.g. compound operators, type annotations)
 * into standard Lua AST representation safe for parser inspection.
 */
export function sanitizeLuauSyntax(source: string): { sanitized: string; modifications: number } {
  let code = source;
  let modifications = 0;

  // 1. Remove Luau type assertions: expression :: type
  const typeAssertionRegex = /::\s*[A-Za-z0-9_<>.,\s|&?]+/g;
  if (typeAssertionRegex.test(code)) {
    code = code.replace(typeAssertionRegex, '');
    modifications++;
  }

  // 2. Remove single-line Luau type aliases: type Foo = ...
  const typeAliasRegex = /^\s*type\s+[A-Za-z0-9_<>]+\s*=[^\n]*/gm;
  if (typeAliasRegex.test(code)) {
    code = code.replace(typeAliasRegex, '-- [type removed]');
    modifications++;
  }

  // 3. Transform Luau compound assignment (+=, -=, *=, /=, %=, ^=, ..=) into standard assignment if needed
  // Example: a += 1  =>  a = a + (1)
  const compoundRegex = /([a-zA-Z_][a-zA-Z0-9_.]*)\s*(\+|\-|\*|\/|\%|\^|\.\.)=\s*([^;\n]+)/g;
  code = code.replace(compoundRegex, (match, variable, op, expr) => {
    modifications++;
    return `${variable} = ${variable} ${op} (${expr.trim()})`;
  });

  return { sanitized: code, modifications };
}

/**
 * Parses and analyzes Roblox Luau/Lua code with AST safety and profile checks.
 */
export function analyzeLuaSource(source: string, profile: CompatibilityProfile): AnalysisResult {
  const diagnostics: Diagnostic[] = [];
  const detectedExecutorApis: string[] = [];
  const detectedRobloxGlobals: string[] = [];

  // Check for executor APIs via lexical scanning
  for (const api of EXECUTOR_SPECIFIC_APIS) {
    const apiRegex = new RegExp(`\\b${api}\\b`, 'g');
    if (apiRegex.test(source)) {
      detectedExecutorApis.push(api);
    }
  }

  // Check for Roblox Studio globals
  for (const glob of ROBLOX_STUDIO_GLOBALS) {
    const globRegex = new RegExp(`\\b${glob}\\b`, 'g');
    if (globRegex.test(source)) {
      detectedRobloxGlobals.push(glob);
    }
  }

  const hasExecutorApis = detectedExecutorApis.length > 0;

  // Profile-specific compatibility checks
  if (profile === 'roblox_studio' && hasExecutorApis) {
    diagnostics.push({
      severity: 'warning',
      message: `Executor-specific APIs detected (${detectedExecutorApis.join(', ')}). These APIs are NOT available in normal Roblox Studio or Roblox Game servers/clients. If this script is intended for standard Roblox Studio experiences, execution will fail with nil reference errors.`,
      rule: 'profile-compatibility-check',
    });
  } else if (profile === 'executor_ext') {
    diagnostics.push({
      severity: 'info',
      message: `Executor environment profile selected. Nonstandard APIs (${detectedExecutorApis.join(', ') || 'none detected'}) will be allowed, but this code is not guaranteed to execute across different custom third-party engines.`,
      rule: 'executor-profile-notice',
    });
  }

  // Preprocess Luau syntax features
  const { sanitized } = sanitizeLuauSyntax(source);

  let ast: any = null;
  try {
    ast = luaparse.parse(sanitized, {
      wait: false,
      comments: false,
      scope: true,
      locations: true,
      ranges: true,
      luaVersion: '5.1',
    });

    diagnostics.push({
      severity: 'info',
      message: 'Source code syntax successfully parsed and validated against Lua 5.1/Luau AST grammar.',
      rule: 'ast-parse-success',
    });

    return {
      valid: true,
      ast,
      diagnostics,
      hasExecutorApis,
      detectedExecutorApis,
      detectedRobloxGlobals,
    };
  } catch (err: any) {
    const line = err.line || 1;
    const column = err.column || 1;
    const message = err.message || 'Syntax parse error in Lua source code';

    diagnostics.push({
      severity: 'error',
      line,
      column,
      message: `Parse Error at line ${line}, column ${column}: ${message}`,
      rule: 'syntax-validation-failure',
    });

    return {
      valid: false,
      diagnostics,
      hasExecutorApis,
      detectedExecutorApis,
      detectedRobloxGlobals,
      syntaxError: { line, column, message },
    };
  }
}
