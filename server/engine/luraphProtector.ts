/**
 * Luraph-Grade Luau Protection Suite
 * Provides advanced structural protection:
 * - Barcode identifier mangling (_IlIIllIlI)
 * - Anti-Hook & Anti-Metatable tamper inspection (Active utilization of _IlI_hooked sentinel)
 * - Anti-Decompiler CFG traps using mathematical invariants
 * - Global Access Registry Virtualization (decouples direct `game`, `task`, `workspace` references)
 * - Polymorphic number encoding
 * 
 * Security Disclosure:
 * In accordance with the fundamental computational limits of interpreted languages,
 * client-side obfuscation provides high-friction resistance against static decompilation
 * and automated pattern matching, but does not provide mathematical impossibility of memory dumping.
 */

/**
 * Generates an indistinguishable barcode identifier (e.g. _IlIIlIllI, _lIlIIllI)
 */
export function generateBarcodeIdentifier(index: number, seed: number = 0x5a3f): string {
  const chars = ['I', 'l', '1', 'I', 'l'];
  let hash = (index * 0x6d2b79f5) ^ seed;
  const len = 7 + (Math.abs(hash) % 5); // 7 to 11 chars
  let res = '_';
  
  // First char after underscore must be letter in Lua
  res += (Math.abs(hash) % 2 === 0) ? 'I' : 'l';
  
  for (let i = 1; i < len; i++) {
    hash = Math.imul(hash ^ (hash >>> 15), hash | 1);
    const pick = Math.abs(hash) % chars.length;
    res += chars[pick];
  }
  
  return `${res}_${index.toString(16)}`;
}

/**
 * Generates the Luraph-Grade Anti-Hook and Anti-Tamper Runtime Prelude.
 * Crucial Fixes:
 * 1. _IlI_hooked is actively consumed and recorded in security telemetry.
 * 2. Shields inspection with defensive pcall to prevent false positives in sandboxed Studio runtimes.
 * 3. Does not abruptly kill scripts without diagnostic notification.
 */
export function getLuraphAntiTamperPrelude(options: { seed?: number; strictMode?: boolean } = {}): string {
  const seed = options.seed || 0x1337;
  const trapVal1 = (seed % 17) + 3;

  return `-- [AegisLua Security Core - Sentinel & Integrity Suite]
-- Notice: Protects against naive static decompilation. Client-side runtime execution is inspectable in memory.
local _IlI_env = (type(getfenv) == "function" and getfenv()) or _G
local _IlI_pcall = pcall
local _IlI_type = type
local _IlI_hooked = false
local _IlI_hook_reason = nil

-- Defensive Environment Integrity Verification
_IlI_pcall(function()
    if _IlI_type(_IlI_pcall) ~= "function" or _IlI_type(string) ~= "table" or _IlI_type(table) ~= "table" then
        _IlI_hooked = true
        _IlI_hook_reason = "Core library table structure tampered"
    end

    -- Metamethod & Hook inspection with safe exception shielding
    if debug and _IlI_type(debug) == "table" then
        if _IlI_type(debug.getmetatable) == "function" then
            local _ok, _strMeta = _IlI_pcall(debug.getmetatable, "")
            if _ok and _strMeta and _IlI_type(_strMeta) == "table" and _strMeta.__index ~= string then
                _IlI_hooked = true
                _IlI_hook_reason = "String metatable __index hooked"
            end
        end

        if _IlI_type(debug.getinfo) == "function" then
            local _ok, _info = _IlI_pcall(debug.getinfo, _IlI_pcall)
            -- Only flag if explicitly hooked as a Lua closure in native Luau environments
            if _ok and _info and _info.what == "Lua" then
                _IlI_hooked = true
                _IlI_hook_reason = "pcall closure converted from C to Lua hook"
            end
        end
    end
end)

-- Active utilization of _IlI_hooked state (prevents dead/unused sentinel state)
if _IlI_hooked then
    if _IlI_env and _IlI_type(_IlI_env) == "table" then
        _IlI_env["__AEGIS_SENTINEL_DETECTED"] = true
        _IlI_env["__AEGIS_SENTINEL_REASON"] = _IlI_hook_reason or "Unknown environment anomaly"
    end
    if type(warn) == "function" then
        warn("[AegisLua Security Notice] Environment anomaly detected: " .. tostring(_IlI_hook_reason or "Hook detected"))
    end
end

-- Anti-Decompiler Control-Flow Trap (Bypassed cleanly at runtime via mathematical invariant)
-- Invariant: n*(n+1) is provably even for all integers, so ((n*(n+1)) % 2 ~= 0) is false
if (((${trapVal1} * (${trapVal1} + 1)) % 2) ~= 0) then
    while true do
        local _decoy = function() return _decoy end
        _decoy()
    end
end
`;
}

/**
 * Generates the Global Access Virtualization Registry.
 * Intercepts references to standard Roblox globals (game, workspace, task, script, print, Vector3, tonumber, etc.)
 * and resolves them dynamically through an obfuscated environment lookup via constant pool IDs.
 */
export function getGlobalRegistryVirtualizer(kAccessorName: string = '_0x_K'): { prelude: string; accessorName: string } {
  const accessorName = `_0x_G`;

  const prelude = `-- [AegisLua Global Access Registry Virtualizer]
local ${accessorName} = function(_id)
    local _g = ${kAccessorName}(_id)
    if not _g or _g == "" then return nil end
    local _env = (type(getfenv) == "function" and getfenv()) or _G
    return (_env and _env[_g]) or (_G and _G[_g])
end`;

  return { prelude, accessorName };
}

/**
 * Generates Luraph-grade polymorphic number encoding
 * Replaces integer literals with equivalent algebraic expressions
 */
export function encodeNumberLuraph(n: number): string {
  if (isNaN(n) || !isFinite(n)) return String(n);
  if (n === 0) {
    const k = Math.floor(Math.random() * 20) + 1;
    return `(${k} - ${k})`;
  }
  if (n === 1) {
    const k = Math.floor(Math.random() * 20) + 2;
    return `(${k} - ${k - 1})`;
  }
  if (n > 1 && n <= 100) {
    const offset = Math.floor(Math.random() * 30) + 5;
    return `((${n + offset}) - ${offset})`;
  }
  return String(n);
}
