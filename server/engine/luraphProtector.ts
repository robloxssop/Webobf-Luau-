export function generateBarcodeIdentifier(index: number, seed: number = 0x5a3f): string {
  const chars = ['I', 'l', '1', 'I', 'l'];
  let hash = (index * 0x6d2b79f5) ^ seed;
  const len = 8 + (Math.abs(hash) % 6);
  let res = '_';
  
  res += (Math.abs(hash) % 2 === 0) ? 'I' : 'l';
  
  for (let i = 1; i < len; i++) {
    hash = Math.imul(hash ^ (hash >>> 15), hash | 1);
    const pick = Math.abs(hash) % chars.length;
    res += chars[pick];
  }
  
  return `${res}_${index.toString(16)}`;
}

export function getLuraphAntiTamperPrelude(options: { seed?: number; strictMode?: boolean } = {}): string {
  const randTag = Math.random().toString(36).substring(2, 6);
  const pcallVar = `_p_${randTag}`;
  const typeVar = `_t_${randTag}`;
  const hookedVar = `_hk_${randTag}`;

  return `local ${pcallVar} = pcall
local ${typeVar} = type
local ${hookedVar} = false

${pcallVar}(function()
    if ${typeVar}(${pcallVar}) ~= "function" or ${typeVar}(string) ~= "table" or ${typeVar}(table) ~= "table" then
        ${hookedVar} = true
    end

    local _okStr, _strMeta = ${pcallVar}(getmetatable, "")
    if _okStr and _strMeta and ${typeVar}(_strMeta) == "table" and _strMeta.__index ~= string then
        ${hookedVar} = true
    end

    if debug and ${typeVar}(debug) == "table" then
        if ${typeVar}(debug.gethook) == "function" then
            local _okHook, _currentHook = ${pcallVar}(debug.gethook)
            if _okHook and _currentHook ~= nil then
                ${hookedVar} = true
            end
        end

        if ${typeVar}(debug.getmetatable) == "function" then
            local _ok, _meta = ${pcallVar}(debug.getmetatable, "")
            if _ok and _meta and ${typeVar}(_meta) == "table" and _meta.__index ~= string then
                ${hookedVar} = true
            end
        end

        if ${typeVar}(debug.getinfo) == "function" then
            local _ok, _info = ${pcallVar}(debug.getinfo, ${pcallVar})
            if _ok and _info and _info.what == "Lua" then
                ${hookedVar} = true
            end

            local _okErr, _infoErr = ${pcallVar}(debug.getinfo, error)
            if _okErr and _infoErr and _infoErr.what == "Lua" then
                ${hookedVar} = true
            end
        end
    end
end)

if ${hookedVar} then
    error("", 0)
end
`;
}

export function getGlobalRegistryVirtualizer(
  kAccessorName: string = '_k_01',
  gAccessorName: string = '_g_01'
): { prelude: string; accessorName: string } {
  const accessorName = gAccessorName;
  const randTag = Math.random().toString(36).substring(2, 6);
  const cacheVar = `_c_${randTag}`;
  const envVar = `_e_${randTag}`;
  const proxyVar = `_prx_${randTag}`;
  const idVar = `_id_${randTag}`;
  const cachedVar = `_cd_${randTag}`;
  const keyVar = `_k_${randTag}`;
  const valVar = `_v_${randTag}`;

  const prelude = `local ${accessorName} = (function()
    local ${cacheVar} = {}
    local ${envVar} = (type(getfenv) == "function" and getfenv()) or (type(_G) == "table" and _G)
    local ${proxyVar} = setmetatable({}, {
        __index = function(_, _k)
            if ${envVar} then return ${envVar}[_k] end
            return nil
        end
    })
    return function(${idVar})

        local ${cachedVar} = ${cacheVar}[${idVar}]
        if ${cachedVar} ~= nil then return ${cachedVar} end
        local ${keyVar} = ${kAccessorName}(${idVar})
        if not ${keyVar} or ${keyVar} == "" then return nil end
        local ${valVar} = ${proxyVar}[${keyVar}]
        ${cacheVar}[${idVar}] = ${valVar}
        return ${valVar}
    end
end)()`;

  return { prelude, accessorName };
}



export function encodeNumberLuraph(n: number): string {
  if (isNaN(n) || !isFinite(n)) return String(n);
  if (n === 0) {
    const k = Math.floor(Math.random() * 20) + 5;
    return `(0x${(k * 2).toString(16)} - 0x${(k * 2).toString(16)})`;
  }
  if (n === 1) {
    const k = Math.floor(Math.random() * 20) + 5;
    return `(0x${(k * 2 + 1).toString(16)} - 0x${(k * 2).toString(16)})`;
  }
  if (n > 1 && n <= 100) {
    const offset = 0x2b;
    const total = n + offset;
    return `(0x${total.toString(16)} - 0x${offset.toString(16)})`;
  }
  return String(n);
}
