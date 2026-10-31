export interface EncodedStringResult {
  codeSnippet: string;
  bytesCount: number;
}

export interface ConstantPoolResult {
  prelude: string;
  accessorName: string;
  idMap: Map<string, number>;
  poolSize: number;
  decoyCount: number;
  xorKey: number;
  seed: number;
}

const ROBLOX_DECOY_STRINGS = [
  'VirtualInputManager',
  'HttpService',
  'TeleportService',
  'DataStoreService',
  'ScriptContext',
  'getrawmetatable',
  'hookmetamethod',
  'CharacterAdded',
  'HumanoidRootPart',
  'FireServer',
  'ReplicatedFirst',
  'TamperViolation',
  'CheckCaller',
  'IsA',
  'FindFirstChildOfClass',
  'TweenService',
  '__index',
  '__newindex',
  '__metatable',
  'RemoteSecurityBypass',
  'AntiExploitHeartbeat',
  'Adonis_SecurityCore',
  'DexExplorer_Banned',
  'MemoryDumpIntegrity',
  'ClientSecurityToken',
  'ReplicatedStorage',
  'Workspace',
  'Players',
  'LocalPlayer',
  'SetCoreGuiEnabled',
  'GetPropertyChangedSignal',
  'UserInputService',
  'RunService',
  'Stepped',
  'RenderStepped',
  'Heartbeat',
  'GetAsync',
  'PostAsync',
  'PolicyService',
  'Decompiled_By_Aegis_Trap'
];

/**
 * Creates a centralized encrypted constant pool table with dynamic accessor,
 * uniform entry padding (Item 5), dynamic length/MAC positions (Item 4),
 * 100% pool warmup access (Item 1), derived seed (Item 2), and zero comments.
 */
export function createEncryptedConstantPool(
  strings: string[],
  options: {
    seed?: number;
    xorKey?: number;
    accessorName?: string;
    addDecoys?: boolean;
    padSize?: number;
  } = {}
): ConstantPoolResult {
  const seed = (options.seed ?? (Math.floor(Math.random() * 200) + 20)) & 0xff;
  const xorKey = (options.xorKey ?? (Math.floor(Math.random() * 200) + 20)) & 0xff;
  
  const randTag = Math.random().toString(36).substring(2, 6);
  const accessorName = options.accessorName || `_k_${randTag}`;
  const cacheVar = `_c_${randTag}`;
  const poolVar = `_p_${randTag}`;
  const saltVar = `_s_${randTag}`;
  const xorFuncVar = `_x_${randTag}`;
  const idArgVar = `_id_${randTag}`;
  const cachedVar = `_cd_${randTag}`;
  const byteArrVar = `_b_${randTag}`;
  const lenVar = `_l_${randTag}`;
  const bufVar = `_buf_${randTag}`;
  const rRegVar = `_r_${randTag}`;
  const aRegVar = `_a_${randTag}`;
  const decArrVar = `_da_${randTag}`;
  const posLenVar = `_pl_${randTag}`;
  const posMacVar = `_pmc_${randTag}`;
  const macExpVar = `_me_${randTag}`;
  const realLenVar = `_rl_${randTag}`;
  const macFoundVar = `_mf_${randTag}`;
  const bufIdxVar = `_bi_${randTag}`;

  const secretSalt = options.seed
    ? ((options.seed * 0x45d9f3b ^ 0x6a09e667) >>> 0)
    : (Math.floor(Math.random() * 0x7fffffff) ^ 0x3f5a1b2c) >>> 0;

  const idMap = new Map<string, number>();
  const tableEntries: string[] = [];

  const uniqueStrings = Array.from(new Set(strings));

  interface PoolItem {
    text: string;
    isDecoy: boolean;
  }

  const allPoolItems: PoolItem[] = uniqueStrings.map((str) => ({
    text: str,
    isDecoy: false,
  }));

  let decoyCount = 0;
  if (options.addDecoys !== false) {
    const decoyPool = [...ROBLOX_DECOY_STRINGS];
    for (let i = decoyPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [decoyPool[i], decoyPool[j]] = [decoyPool[j], decoyPool[i]];
    }
    const decoysToAdd = Math.min(decoyPool.length, Math.max(16, Math.floor(uniqueStrings.length * 1.5)));
    for (let i = 0; i < decoysToAdd; i++) {
      const decoyStr = decoyPool[i];
      if (!uniqueStrings.includes(decoyStr)) {
        allPoolItems.push({
          text: decoyStr,
          isDecoy: true,
        });
        decoyCount++;
      }
    }
  }

  for (let i = allPoolItems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPoolItems[i], allPoolItems[j]] = [allPoolItems[j], allPoolItems[i]];
  }

  let maxPayloadBytes = 0;
  for (const item of allPoolItems) {
    const bLen = Buffer.byteLength(item.text, 'utf8');
    if (bLen > maxPayloadBytes) maxPayloadBytes = bLen;
  }
  const padSize = Math.max(options.padSize || 32, maxPayloadBytes + 6);

  const usedIds = new Set<number>();
  interface EncryptedEntry {
    id: number;
    text: string;
    isDecoy: boolean;
  }
  const assignedEntries: EncryptedEntry[] = [];

  for (let i = 0; i < allPoolItems.length; i++) {
    let id = 0;
    while (!id || usedIds.has(id)) {
      if (options.seed) {
        id = ((0x1024 + (i * 0x41c64e6d ^ (options.seed * 31337 + i * 197))) & 0xffff) >>> 0;
        if (id < 0x1024) id += 0x1024;
      } else {
        id = Math.floor(Math.random() * 0xee00) + 0x1024;
      }
    }
    usedIds.add(id);

    const item = allPoolItems[i];
    assignedEntries.push({
      id,
      text: item.text,
      isDecoy: item.isDecoy,
    });

    if (!item.isDecoy) {
      idMap.set(item.text, id);
    }
  }

  // Encrypt each entry with dynamic length & MAC positions
  for (const entry of assignedEntries) {
    const buf = Buffer.from(entry.text, 'utf8');
    const realLen = buf.length;

    const posLen = (entry.id % 5) + 1;
    let posMac = ((entry.id * 13) % 5) + 1;
    if (posMac === posLen) posMac = (posMac % 5) + 1;

    const mac = ((secretSalt ^ (entry.id * 53) ^ xorKey ^ (realLen * 17)) & 0xff);

    const fullPayload: number[] = new Array(padSize);
    for (let p = 0; p < padSize; p++) fullPayload[p] = (Math.floor(Math.random() * 254) + 1) & 0xff;

    fullPayload[posLen - 1] = realLen;
    fullPayload[posMac - 1] = mac;

    let payloadIdx = 0;
    for (let p = 0; p < padSize; p++) {
      if (p !== posLen - 1 && p !== posMac - 1 && payloadIdx < buf.length) {
        fullPayload[p] = buf[payloadIdx++];
      }
    }

    let rState = ((secretSalt + entry.id * 31337) ^ (xorKey * 65537)) >>> 0;
    let aState = ((seed * 16777619 + entry.id * 65539) ^ 0x85ebca6b) >>> 0;
    const encBytes: number[] = [];

    for (let k = 0; k < fullPayload.length; k++) {
      rState = (Math.imul(rState, 1664525) + 1013904223) >>> 0;
      aState = (Math.imul(aState, 159733) + 3812041) >>> 0;

      const posMask = (secretSalt + (k * 137)) % 256;
      const mask = ((rState % 256) ^ posMask ^ (aState % 256)) & 0xff;
      const enc = fullPayload[k] ^ mask;
      encBytes.push(enc);

      aState = (aState + enc * 17) >>> 0;
    }

    tableEntries.push(`[0x${entry.id.toString(16)}] = {${encBytes.join(',')}}`);
  }

  const allIds = assignedEntries.map((e) => `0x${e.id.toString(16)}`);

  // Pure zero-comment runtime prelude with runtime derived seed, build salt, closed proxy env, and dynamic ID array warmup
  const prelude = `local ${accessorName} = (function()
    local ${saltVar} = (function()
        local t = math.floor(os.clock() * 1e6)
        local addr = tonumber(tostring({}):match("0x%x+")) or 0
        return (t + addr) % 4294967296
    end)()
    local ${xorFuncVar} = (type(bit32) == "table" and bit32.bxor) or function(a, b)
        local res, bit = 0, 1
        while a > 0 or b > 0 do
            local ra, rb = a % 2, b % 2
            if ra ~= rb then res = (res + bit) % 4294967296 end
            a = math.floor(a / 2)
            b = math.floor(b / 2)
            bit = (bit * 2) % 4294967296
        end
        return res % 4294967296
    end
    local _bsalt = ${xorFuncVar}(${((secretSalt ^ 0x12345678) >>> 0)}, 0x12345678)
    local ${cacheVar} = {}
    local ${poolVar} = {
        ${tableEntries.join(',\n        ')}
    }

    local ${accessorName}_fn = function(${idArgVar})
        if not ${idArgVar} then return "" end
        local ${cachedVar} = ${cacheVar}[${idArgVar}]
        if ${cachedVar} ~= nil then return ${cachedVar} end
        local ${byteArrVar} = ${poolVar}[${idArgVar}]
        if not ${byteArrVar} then return "" end
        local ${lenVar} = #${byteArrVar}
        if ${lenVar} == 0 then
            ${cacheVar}[${idArgVar}] = ""
            return ""
        end
        local ${bufVar} = {}
        local ${rRegVar} = ${xorFuncVar}((_bsalt + ${idArgVar} * 31337) % 4294967296, ${xorKey * 65537})
        local ${aRegVar} = ${xorFuncVar}((${seed} * 16777619 + ${idArgVar} * 65539) % 4294967296, 0x85ebca6b)
        local ${posLenVar} = (${idArgVar} % 5) + 1
        local ${posMacVar} = ((${idArgVar} * 13) % 5) + 1
        if ${posMacVar} == ${posLenVar} then ${posMacVar} = (${posMacVar} % 5) + 1 end
        local ${decArrVar} = {}
        for _k = 1, ${lenVar} do
            ${rRegVar} = ((${rRegVar} * 1664525) + 1013904223) % 4294967296
            ${aRegVar} = ((${aRegVar} * 159733) + 3812041) % 4294967296
            local _pm = (_bsalt + ((_k - 1) * 137)) % 256
            local _m = ${xorFuncVar}(${xorFuncVar}(${rRegVar} % 256, _pm), ${aRegVar} % 256)
            local _e = ${byteArrVar}[_k]
            ${decArrVar}[_k] = ${xorFuncVar}(_e, _m)
            ${aRegVar} = (${aRegVar} + _e * 17) % 4294967296
        end
        local ${realLenVar} = ${decArrVar}[${posLenVar}]
        local ${macFoundVar} = ${decArrVar}[${posMacVar}]
        local ${macExpVar} = ${xorFuncVar}(${xorFuncVar}(${xorFuncVar}(_bsalt, ${idArgVar} * 53), ${xorKey}), ${realLenVar} * 17) % 256
        if ${macFoundVar} ~= ${macExpVar} then
            error("", 0)
        end
        local ${bufIdxVar} = 1
        for _k = 1, ${lenVar} do
            if _k ~= ${posLenVar} and _k ~= ${posMacVar} and ${bufIdxVar} <= ${realLenVar} then
                ${bufVar}[${bufIdxVar}] = string.char(${decArrVar}[_k])
                ${bufIdxVar} = ${bufIdxVar} + 1
            end
        end
        local _s_res = table.concat(${bufVar})
        ${cacheVar}[${idArgVar}] = _s_res
        return _s_res
    end
    local _ids = {${allIds.join(', ')}}
    for _idx = 1, ${allIds.length} do
        local _pid = _ids[((${saltVar} + _idx - 1) % ${allIds.length}) + 1]
        ${accessorName}_fn(_pid)
    end
    return ${accessorName}_fn
end)()`;




  return {
    prelude,
    accessorName,
    idMap,
    poolSize: assignedEntries.length,
    decoyCount,
    xorKey,
    seed,
  };
}

export function encodeStringToByteArray(text: string, xorKey: number = 0xa7, seed: number = 0x5b): EncodedStringResult {
  const buf = Buffer.from(text, 'utf8');
  const encryptedBytes: number[] = [];

  let rollingKey = xorKey & 0xff;
  let accum = seed & 0xff;

  for (let i = 0; i < buf.length; i++) {
    const mask = (rollingKey ^ ((seed + (i * 13)) & 0xff) ^ accum) & 0xff;
    const enc = buf[i] ^ mask;
    encryptedBytes.push(enc);
    accum = (accum + enc + 17) & 0xff;
    rollingKey = ((rollingKey * 31) + 7) & 0xff;
  }

  return {
    codeSnippet: `_dec_rt({${encryptedBytes.join(',')}}, ${xorKey}, ${seed})`,
    bytesCount: encryptedBytes.length,
  };
}

export function encodeStringToBase64(text: string, xorKey: number = 0x5c, seed: number = 0x3a): EncodedStringResult {
  const rawB64 = Buffer.from(text, 'utf8').toString('base64');
  const encChars: number[] = [];

  let rollingKey = xorKey & 0xff;
  let accum = seed & 0xff;

  for (let i = 0; i < rawB64.length; i++) {
    const mask = (rollingKey ^ ((seed + (i * 7)) & 0xff) ^ accum) & 0xff;
    const enc = rawB64.charCodeAt(i) ^ mask;
    encChars.push(enc);
    accum = (accum + enc + 11) & 0xff;
    rollingKey = ((rollingKey * 19) + 5) & 0xff;
  }

  return {
    codeSnippet: `_b64_rt({${encChars.join(',')}}, ${xorKey}, ${seed})`,
    bytesCount: Buffer.byteLength(text, 'utf8'),
  };
}

export function getByteArrayRuntimeDecoder(): string {
  return `local _dec_rt = (function()
    local _cache = {}
    local _bxor = (type(bit32) == "table" and bit32.bxor) or function(a, b)
        local res, bit = 0, 1
        while a > 0 or b > 0 do
            local ra, rb = a % 2, b % 2
            if ra ~= rb then res = (res + bit) % 4294967296 end
            a = math.floor(a / 2)
            b = math.floor(b / 2)
            bit = (bit * 2) % 4294967296
        end
        return res % 4294967296
    end
    return function(_bytes, _key, _seed)
        _seed = _seed or 0x5b
        local _len = #_bytes
        if _len == 0 then return "" end

        local _h = 2166136261
        for _j = 1, _len do
            _h = ((_h * 16777619) + _bytes[_j]) % 4294967296
        end
        local _sig = tostring(_key) .. ":" .. tostring(_seed) .. ":" .. tostring(_len) .. ":" .. tostring(_h)
        if _cache[_sig] then return _cache[_sig] end

        local _buf = {}
        local _rKey = _key % 256
        local _accum = _seed % 256
        for _i = 1, _len do
            local _posMask = (_seed + ((_i - 1) * 13)) % 256
            local _mask = _bxor(_bxor(_rKey, _posMask), _accum)
            local _encByte = _bytes[_i]
            local _decByte = _bxor(_encByte, _mask)
            _buf[_i] = string.char(_decByte)
            _accum = (_accum + _encByte + 17) % 256
            _rKey = ((_rKey * 31) + 7) % 256
        end
        local _plain = table.concat(_buf)
        _cache[_sig] = _plain
        return _plain
    end
end)()`;
}

export function getBase64RuntimeDecoder(): string {
  return `local _b64_rt = (function()
    local _alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    local _lut = {}
    for _i = 1, 64 do
        _lut[string.sub(_alphabet, _i, _i)] = _i - 1
    end
    local _cache = {}
    local _bxor = (type(bit32) == "table" and bit32.bxor) or function(a, b)
        local res, bit = 0, 1
        while a > 0 or b > 0 do
            local ra, rb = a % 2, b % 2
            if ra ~= rb then res = (res + bit) % 4294967296 end
            a = math.floor(a / 2)
            b = math.floor(b / 2)
            bit = (bit * 2) % 4294967296
        end
        return res % 4294967296
    end
    return function(_encList, _key, _seed)
        _seed = _seed or 0x3a
        local _rawLen = #_encList
        if _rawLen == 0 then return "" end

        local _h = 2166136261
        for _j = 1, _rawLen do
            _h = ((_h * 16777619) + _encList[_j]) % 4294967296
        end
        local _sig = tostring(_key) .. ":" .. tostring(_seed) .. ":" .. tostring(_rawLen) .. ":" .. tostring(_h)
        if _cache[_sig] then return _cache[_sig] end

        local _cbuf = {}
        local _rKey = _key % 256
        local _accum = _seed % 256
        for _i = 1, _rawLen do
            local _posMask = (_seed + ((_i - 1) * 7)) % 256
            local _mask = _bxor(_bxor(_rKey, _posMask), _accum)
            local _encVal = _encList[_i]
            _cbuf[_i] = string.char(_bxor(_encVal, _mask))
            _accum = (_accum + _encVal + 11) % 256
            _rKey = ((_rKey * 19) + 5) % 256
        end

        local _rawJoined = table.concat(_cbuf)
        local _data = string.gsub(_rawJoined, "[^%w%+%/=]", "")
        local _len = #_data

        if _len == 0 or (_len % 4 ~= 0) then
            error("", 2)
        end

        local _res = {}
        local _k = 1
        for _i = 1, _len, 4 do
            local _c1 = string.sub(_data, _i, _i)
            local _c2 = string.sub(_data, _i + 1, _i + 1)
            local _c3 = string.sub(_data, _i + 2, _i + 2)
            local _c4 = string.sub(_data, _i + 3, _i + 3)

            local _b1 = _lut[_c1]
            local _b2 = _lut[_c2]

            if _b1 == nil or _b2 == nil then
                error("", 2)
            end

            _res[_k] = string.char((_b1 * 4 + math.floor(_b2 / 16)) % 256)
            _k = _k + 1

            if _c3 ~= "=" and _c3 ~= "" then
                local _b3 = _lut[_c3]
                if _b3 == nil then
                    error("", 2)
                end
                _res[_k] = string.char(((_b2 % 16) * 16 + math.floor(_b3 / 4)) % 256)
                _k = _k + 1

                if _c4 ~= "=" and _c4 ~= "" then
                    local _b4 = _lut[_c4]
                    if _b4 == nil then
                        error("", 2)
                    end
                    _res[_k] = string.char(((_b3 % 4) * 64 + _b4) % 256)
                    _k = _k + 1
                end
            elseif _c4 ~= "=" and _c4 ~= "" then
                error("", 2)
            end
        end

        local _decoded = table.concat(_res)
        _cache[_sig] = _decoded
        return _decoded
    end
end)()`;
}

export function getDynamicCompilationRuntimeWrapper(encodedPayloadCall: string): string {
  return `local _payload = ${encodedPayloadCall}
local _load = (type(loadstring) == "function" and loadstring) or (type(load) == "function" and load)

if not _load then
    error(
        "[AegisLua Runtime Compatibility Alert] Dynamic script execution ('loadstring') is disabled in this Roblox environment.\\n" ..
        "  - On Roblox Client (LocalScripts): loadstring is not permitted by platform architecture.\\n" ..
        "  - On Roblox Server (ServerScriptService): loadstring is disabled by default (LoadStringEnabled = false).\\n" ..
        "Recommendation: Obfuscate using AegisLua 'Direct Luau Execution' or 'Luau Virtual Machine' mode, which run natively on both Client and Server without loadstring.",
        2
    )
end

local _compiledChunk, _compileErr = _load(_payload)
if not _compiledChunk then
    error("[AegisLua Runtime Error] Dynamic payload compilation failed: " .. tostring(_compileErr), 2)
end

return _compiledChunk()`;
}
