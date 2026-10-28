import { CompatibilityProfile, Diagnostic, RuntimeCompatibilityIssue } from '../../src/types/index.ts';

export const KNOWN_ROBLOX_STUDIO_GLOBALS = new Set([
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

export interface CompatibilityCheckRule {
  name: string;
  pattern: RegExp;
  severity: 'warning' | 'error';
  affectedEnvironments: string[];
  reason: string;
  mitigation: string;
}

export const COMPATIBILITY_RULES: CompatibilityCheckRule[] = [
  {
    name: 'Dynamic Loadstring Execution',
    pattern: /\bloadstring\s*\(/g,
    severity: 'warning',
    affectedEnvironments: ['Roblox Studio (LocalScript)', 'Roblox Studio (ServerScriptService with LoadStringEnabled=false)'],
    reason: '`loadstring` is completely nil on Roblox clients (LocalScripts) and disabled by default on Roblox servers. Calling loadstring will result in a runtime exception.',
    mitigation: 'Use AegisLua "Direct Luau Execution" mode which emits direct AST statements without dynamic loadstring wrappers, or enable ServerScriptService.LoadStringEnabled for server scripts.',
  },
  {
    name: 'Executor Global Environment Access',
    pattern: /\b(getgenv|getrenv|getreg|getgc|getinstances|getnilinstances)\b/g,
    severity: 'error',
    affectedEnvironments: ['Roblox Studio Server', 'Roblox Studio Client', 'Official Roblox Experiences'],
    reason: 'Nonstandard executor environments inject custom registry inspection globals that do not exist in Roblox Studio.',
    mitigation: 'Switch to the "Executor Profile" if targeting third-party injectors, or use official Roblox storage services (ReplicatedStorage, ServerStorage) for Studio experiences.',
  },
  {
    name: 'Executor Function Hooks & Memory Tampering',
    pattern: /\b(hookfunction|hookmetamethod|newcclosure|replaceclosure|setreadonly|make_writeable|getrawmetatable|setrawmetatable)\b/g,
    severity: 'error',
    affectedEnvironments: ['Roblox Studio', 'Luau JIT Engine'],
    reason: 'Function and metamethod hooking violates Roblox security boundaries and is not available in official Roblox games.',
    mitigation: 'Remove custom closure hooks. For Roblox games, use standard BindableEvents or RemoteEvents for cross-script communication.',
  },
  {
    name: 'Executor Console & Drawing APIs',
    pattern: /\b(rconsoleprint|rconsolewarn|rconsoleerror|rconsoleclear|Drawing\.new)\b/g,
    severity: 'error',
    affectedEnvironments: ['Roblox Studio'],
    reason: 'Developer console injection APIs are nonstandard and will crash with "attempt to call a nil value" in Roblox Studio.',
    mitigation: 'Use standard Roblox Studio `print()`, `warn()`, and `TestService:Message()` instead.',
  },
  {
    name: 'Lua 5.1 Environment Mutation (getfenv/setfenv)',
    pattern: /\b(getfenv|setfenv)\b/g,
    severity: 'warning',
    affectedEnvironments: ['Roblox Luau Compiler'],
    reason: 'Luau de-optimizes functions that access or mutate environments via getfenv/setfenv, disabling fast-call bytecode optimizations.',
    mitigation: 'Refactor code to pass dependencies explicitly as function arguments or use lexical module closures.',
  },
];

/**
 * Checks a Lua/Luau script for environment compatibility issues
 */
export function checkScriptCompatibility(
  sourceCode: string,
  profile: CompatibilityProfile
): { issues: RuntimeCompatibilityIssue[]; diagnostics: Diagnostic[] } {
  const issues: RuntimeCompatibilityIssue[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const rule of COMPATIBILITY_RULES) {
    const matches = sourceCode.match(rule.pattern);
    if (matches && matches.length > 0) {
      const isStudio = profile === 'roblox_studio';
      const severity = isStudio ? rule.severity : 'warning';

      const issue: RuntimeCompatibilityIssue = {
        api: rule.name,
        severity,
        affectedEnvironments: rule.affectedEnvironments,
        reason: rule.reason,
        mitigation: rule.mitigation,
      };

      issues.push(issue);

      diagnostics.push({
        phase: 'Runtime Compatibility',
        severity: severity === 'error' ? 'error' : 'warning',
        rule: `compatibility-${rule.name.toLowerCase().replace(/\s+/g, '-')}`,
        message: `[Compatibility Warning] ${rule.name}: ${rule.reason}`,
        mitigation: rule.mitigation,
      });
    }
  }

  return { issues, diagnostics };
}
