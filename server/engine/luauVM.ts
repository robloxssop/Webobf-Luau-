import * as luaparse from 'luaparse';

export interface VMCompilationResult {
  success: boolean;
  code: string;
  instructionCount: number;
  constantCount: number;
  error?: string;
}

/**
 * Compiles Lua 5.1 / Luau source code into a Luraph-style Custom Bytecode VM.
 *
 * Pipeline Architecture:
 * 1. AST Parsing -> Custom Bytecode instructions & encrypted constant table.
 * 2. Randomized per-build opcode mapping.
 * 3. Serialization + RC4-like cipher + 32-bit LCG keystream -> Encrypted BZ String payload.
 * 4. Loader generator featuring F-table handler dispatchers (F[127], F[32], F[62]), gZ string decryptor,
 *    and zero-loadstring execution compatible with Roblox Studio & external executors.
 */
export function compileToLuauVM(
  sourceCode: string,
  options: {
    seed?: number;
    antiTamper?: boolean;
  } = {}
): VMCompilationResult {
  const seed = (options.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;

  let ast: any;
  try {
    ast = luaparse.parse(sourceCode, {
      wait: false,
      comments: false,
      locations: true,
      ranges: true,
      luaVersion: '5.1',
    });
  } catch (err: any) {
    return {
      success: false,
      code: '',
      instructionCount: 0,
      constantCount: 0,
      error: `AST parse error before VM compilation: ${err.message}`,
    };
  }

  const baseOpcodes = [
    'OP_LOADK',
    'OP_GETGLOBAL',
    'OP_SETGLOBAL',
    'OP_MOVE',
    'OP_CALL',
    'OP_BINOP',
    'OP_NEWTABLE',
    'OP_SETTABLE',
    'OP_GETTABLE',
    'OP_JMP',
    'OP_JMPIF',
    'OP_RETURN',
    'OP_FORPREP',
    'OP_FORLOOP',
  ];

  // 1. Per-build randomized opcode mapping
  const opMap = new Map<string, number>();
  const shuffledOps = [...baseOpcodes];
  let prngState = seed ^ 0xa5a5a5a5;
  const lcgNext = () => {
    prngState = (Math.imul(1103515245, prngState) + 12345) >>> 0;
    return prngState;
  };

  for (let i = shuffledOps.length - 1; i > 0; i--) {
    const j = lcgNext() % (i + 1);
    [shuffledOps[i], shuffledOps[j]] = [shuffledOps[j], shuffledOps[i]];
  }

  // Assign distinct opcode numbers (e.g. 10..23)
  const opcodeBase = (lcgNext() % 50) + 10;
  shuffledOps.forEach((opName, idx) => {
    opMap.set(opName, opcodeBase + idx);
  });

  const constants: any[] = [];
  const constMap = new Map<string, number>();

  function addConstant(val: any): number {
    const key = typeof val + '_' + JSON.stringify(val);
    if (constMap.has(key)) {
      return constMap.get(key)!;
    }
    const idx = constants.length + 1;
    constants.push(val);
    constMap.set(key, idx);
    return idx;
  }

  const rawInstructions: [number, number, number, number][] = [];

  function emit(op: string, a = 0, b = 0, c = 0) {
    const opCode = opMap.get(op) || 0;
    rawInstructions.push([opCode, a, b, c]);
  }

  const localRegs = new Map<string, number>();
  let nextReg = 0;

  function allocReg(): number {
    return nextReg++;
  }

  function compileExpression(node: any, targetReg: number) {
    if (!node) return;

    if (node.type === 'StringLiteral') {
      let strVal = '';
      if (typeof node.raw === 'string' && (node.raw.startsWith('"') || node.raw.startsWith("'"))) {
        strVal = node.raw.slice(1, -1);
      } else {
        strVal = node.value ?? '';
      }
      const kIdx = addConstant(strVal);
      emit('OP_LOADK', targetReg, kIdx, 0);
    } else if (node.type === 'NumericLiteral') {
      const kIdx = addConstant(node.value);
      emit('OP_LOADK', targetReg, kIdx, 0);
    } else if (node.type === 'BooleanLiteral') {
      const kIdx = addConstant(node.value);
      emit('OP_LOADK', targetReg, kIdx, 0);
    } else if (node.type === 'NilLiteral') {
      const kIdx = addConstant(null);
      emit('OP_LOADK', targetReg, kIdx, 0);
    } else if (node.type === 'Identifier') {
      if (localRegs.has(node.name)) {
        emit('OP_MOVE', targetReg, localRegs.get(node.name)!, 0);
      } else {
        const kIdx = addConstant(node.name);
        emit('OP_GETGLOBAL', targetReg, kIdx, 0);
      }
    } else if (node.type === 'CallExpression') {
      compileCall(node, targetReg);
    } else if (node.type === 'BinaryExpression') {
      const regL = allocReg();
      const regR = allocReg();
      compileExpression(node.left, regL);
      compileExpression(node.right, regR);
      const opIdx = addConstant(node.operator);
      emit('OP_BINOP', targetReg, regL, regR);
    } else if (node.type === 'MemberExpression') {
      const baseReg = allocReg();
      compileExpression(node.base, baseReg);
      const propIdx = addConstant(node.identifier.name);
      emit('OP_GETTABLE', targetReg, baseReg, propIdx);
    } else if (node.type === 'IndexExpression') {
      const baseReg = allocReg();
      compileExpression(node.base, baseReg);
      const idxReg = allocReg();
      compileExpression(node.index, idxReg);
      emit('OP_GETTABLE', targetReg, baseReg, idxReg);
    } else if (node.type === 'TableConstructorExpression') {
      emit('OP_NEWTABLE', targetReg, 0, 0);
      let fieldIdx = 1;
      for (const field of node.fields) {
        if (field.type === 'TableValue') {
          const valReg = allocReg();
          compileExpression(field.value, valReg);
          const kIdx = addConstant(fieldIdx++);
          emit('OP_SETTABLE', targetReg, kIdx, valReg);
        } else if (field.type === 'TableKeyString') {
          const valReg = allocReg();
          compileExpression(field.value, valReg);
          const kIdx = addConstant(field.key.name);
          emit('OP_SETTABLE', targetReg, kIdx, valReg);
        } else if (field.type === 'TableKey') {
          const keyReg = allocReg();
          compileExpression(field.key, keyReg);
          const valReg = allocReg();
          compileExpression(field.value, valReg);
          emit('OP_SETTABLE', targetReg, keyReg, valReg);
        }
      }
    } else {
      const kIdx = addConstant(null);
      emit('OP_LOADK', targetReg, kIdx, 0);
    }
  }

  function compileCall(node: any, resultReg: number) {
    const fnReg = allocReg();
    compileExpression(node.base, fnReg);

    const argCount = node.arguments.length;
    const argRegs: number[] = [];
    for (let i = 0; i < argCount; i++) {
      const aReg = allocReg();
      compileExpression(node.arguments[i], aReg);
      argRegs.push(aReg);
    }

    for (let i = 0; i < argCount; i++) {
      emit('OP_MOVE', fnReg + 1 + i, argRegs[i], 0);
    }

    emit('OP_CALL', fnReg, resultReg, argCount);
  }

  function compileStatement(stmt: any) {
    if (stmt.type === 'CallStatement') {
      const dummyReg = allocReg();
      compileCall(stmt.expression, dummyReg);
    } else if (stmt.type === 'LocalStatement') {
      for (let i = 0; i < stmt.variables.length; i++) {
        const v = stmt.variables[i];
        const r = allocReg();
        localRegs.set(v.name, r);
        if (stmt.init && stmt.init[i]) {
          compileExpression(stmt.init[i], r);
        } else {
          emit('OP_LOADK', r, addConstant(null), 0);
        }
      }
    } else if (stmt.type === 'AssignmentStatement') {
      for (let i = 0; i < stmt.variables.length; i++) {
        const v = stmt.variables[i];
        const valReg = allocReg();
        if (stmt.init && stmt.init[i]) {
          compileExpression(stmt.init[i], valReg);
        }
        if (v.type === 'Identifier') {
          if (localRegs.has(v.name)) {
            emit('OP_MOVE', localRegs.get(v.name)!, valReg, 0);
          } else {
            const kIdx = addConstant(v.name);
            emit('OP_SETGLOBAL', valReg, kIdx, 0);
          }
        } else if (v.type === 'MemberExpression') {
          const baseReg = allocReg();
          compileExpression(v.base, baseReg);
          const kIdx = addConstant(v.identifier.name);
          emit('OP_SETTABLE', baseReg, kIdx, valReg);
        } else if (v.type === 'IndexExpression') {
          const baseReg = allocReg();
          compileExpression(v.base, baseReg);
          const keyReg = allocReg();
          compileExpression(v.index, keyReg);
          emit('OP_SETTABLE', baseReg, keyReg, valReg);
        }
      }
    } else if (stmt.type === 'ReturnStatement') {
      if (stmt.arguments && stmt.arguments.length > 0) {
        const retReg = allocReg();
        compileExpression(stmt.arguments[0], retReg);
        emit('OP_RETURN', retReg, 1, 0);
      } else {
        emit('OP_RETURN', 0, 0, 0);
      }
    } else if (stmt.type === 'ForNumericStatement') {
      const varName = stmt.variable.name;
      const varReg = allocReg();
      localRegs.set(varName, varReg);

      compileExpression(stmt.start, varReg);
      const limitReg = allocReg();
      compileExpression(stmt.end, limitReg);
      const stepReg = allocReg();
      if (stmt.step) {
        compileExpression(stmt.step, stepReg);
      } else {
        emit('OP_LOADK', stepReg, addConstant(1), 0);
      }

      const prepPcIndex = rawInstructions.length;
      emit('OP_FORPREP', varReg, 0, 0);

      const bodyStartPc = rawInstructions.length;
      if (Array.isArray(stmt.body)) {
        for (const s of stmt.body) {
          compileStatement(s);
        }
      }

      const loopPcIndex = rawInstructions.length;
      emit('OP_FORLOOP', varReg, bodyStartPc, 0);
      const totalLoopSpan = loopPcIndex - prepPcIndex;
      rawInstructions[prepPcIndex][2] = totalLoopSpan;
    } else if (stmt.type === 'IfStatement') {
      for (const clause of stmt.clauses) {
        const condReg = allocReg();
        if (clause.condition) {
          compileExpression(clause.condition, condReg);
        }
        const jmpIfIndex = rawInstructions.length;
        if (clause.condition) {
          emit('OP_JMPIF', condReg, 0, 0);
        }
        if (Array.isArray(clause.body)) {
          for (const s of clause.body) {
            compileStatement(s);
          }
        }
        if (clause.condition) {
          rawInstructions[jmpIfIndex][2] = rawInstructions.length - jmpIfIndex;
        }
      }
    }
  }

  for (const stmt of ast.body) {
    compileStatement(stmt);
  }

  emit('OP_RETURN', 0, 0, 0);

  // 2. Serialize Bytecode + Constants into BZ Payload
  const serializedBytes: number[] = [];

  // Pack instruction length (2 bytes)
  const instCount = rawInstructions.length;
  serializedBytes.push((instCount >> 8) & 0xff, instCount & 0xff);

  // Pack raw instructions [op, a, b, c]
  for (const [op, a, b, c] of rawInstructions) {
    serializedBytes.push(op & 0xff, a & 0xff, b & 0xff, c & 0xff);
  }

  // Pack constants length (2 bytes)
  const kCount = constants.length;
  serializedBytes.push((kCount >> 8) & 0xff, kCount & 0xff);

  // Pack serialized constants
  for (const c of constants) {
    if (c === null) {
      serializedBytes.push(0); // type 0 = nil
    } else if (typeof c === 'boolean') {
      serializedBytes.push(1, c ? 1 : 0); // type 1 = boolean
    } else if (typeof c === 'number') {
      serializedBytes.push(2); // type 2 = number
      const numStr = c.toString();
      serializedBytes.push(numStr.length & 0xff);
      for (let i = 0; i < numStr.length; i++) {
        serializedBytes.push(numStr.charCodeAt(i) & 0xff);
      }
    } else if (typeof c === 'string') {
      serializedBytes.push(3); // type 3 = string
      const strBytes = Array.from(Buffer.from(c, 'utf8'));
      serializedBytes.push((strBytes.length >> 8) & 0xff, strBytes.length & 0xff);
      for (const b of strBytes) {
        serializedBytes.push(b & 0xff);
      }
    } else {
      serializedBytes.push(0);
    }
  }

  // RC4-like + 16-bit float-safe LCG Keystream Encryption over serialized bytes
  const rc4S = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  const keyByte = seed % 256;
  for (let i = 0; i < 256; i++) {
    j = (j + rc4S[i] + keyByte + (i * 37)) % 256;
    [rc4S[i], rc4S[j]] = [rc4S[j], rc4S[i]];
  }

  const encryptedBZBytes: number[] = [];
  let rc4I = 0;
  let rc4J = 0;
  let lcgKey = seed % 65536;

  for (let pos = 0; pos < serializedBytes.length; pos++) {
    rc4I = (rc4I + 1) % 256;
    rc4J = (rc4J + rc4S[rc4I]) % 256;
    [rc4S[rc4I], rc4S[rc4J]] = [rc4S[rc4J], rc4S[rc4I]];
    const rc4K = rc4S[(rc4S[rc4I] + rc4S[rc4J]) % 256];

    lcgKey = (lcgKey * 31 + 10139) % 65536;
    const lcgK = (lcgKey >>> 8) & 0xff;

    const encByte = (serializedBytes[pos] ^ rc4K ^ lcgK ^ ((pos * 13) % 256)) & 0xff;
    encryptedBZBytes.push(encByte);
  }

  // Format BZ payload string with strict 3-digit decimal escape padding
  const bzPayloadStr = encryptedBZBytes.map((b) => `\\${b.toString().padStart(3, '0')}`).join('');


  // 3. Build F-Table Loader Wrapper (F[127] for VM dispatcher, F[32]/F[62] for Decoders, gZ for stream reader)
  const opLoadk = opMap.get('OP_LOADK');
  const opGetglobal = opMap.get('OP_GETGLOBAL');
  const opSetglobal = opMap.get('OP_SETGLOBAL');
  const opMove = opMap.get('OP_MOVE');
  const opCall = opMap.get('OP_CALL');
  const opBinop = opMap.get('OP_BINOP');
  const opNewtable = opMap.get('OP_NEWTABLE');
  const opGettable = opMap.get('OP_GETTABLE');
  const opSettable = opMap.get('OP_SETTABLE');
  const opReturn = opMap.get('OP_RETURN');
  const opForprep = opMap.get('OP_FORPREP');
  const opForloop = opMap.get('OP_FORLOOP');
  const opJmpif = opMap.get('OP_JMPIF');

  const randTag = Math.random().toString(36).substring(2, 6);
  const bzVar = `_bz_${randTag}`;
  const fTableVar = `F_${randTag}`;
  const gzVar = `gZ_${randTag}`;

  const vmLoaderScript = `local ${bzVar} = "${bzPayloadStr}"
local ${fTableVar} = {}

${fTableVar}[32] = function(b, k)
    local i, j = 0, 0
    local s = {}
    for idx = 0, 255 do s[idx] = idx end
    local kb = (k % 256)
    for idx = 0, 255 do
        j = (j + s[idx] + kb + (idx * 37)) % 256
        s[idx], s[j] = s[j], s[idx]
    end
    return s
end

${fTableVar}[62] = function(bz, k, s)
    local res = {}
    local len = #bz
    local i, j = 0, 0
    local lcg = k % 65536
    for p = 1, len do
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        local k1 = s[(s[i] + s[j]) % 256]
        lcg = (lcg * 31 + 10139) % 65536
        local k2 = math.floor(lcg / 256) % 256
        local b = bz:byte(p)
        local dec = (type(bit32) == "table" and bit32.bxor(b, k1, k2, (p - 1) * 13 % 256)) or (function()
            local r, m = 0, 1
            local x1 = b
            local x2 = k1
            local x3 = k2
            local x4 = ((p - 1) * 13) % 256
            while x1 > 0 or x2 > 0 or x3 > 0 or x4 > 0 do
                local b1, b2, b3, b4 = x1 % 2, x2 % 2, x3 % 2, x4 % 2
                if (b1 + b2 + b3 + b4) % 2 == 1 then r = r + m end
                x1, x2, x3, x4 = math.floor(x1/2), math.floor(x2/2), math.floor(x3/2), math.floor(x4/2)
                m = m * 2
            end
            return r
        end)()
        res[p] = dec
    end
    return res
end


${fTableVar}[5] = function(decBytes)
    local pos = 1
    local function r8()
        local b = decBytes[pos]
        pos = pos + 1
        return b
    end
    local function r16()
        local h = r8()
        local l = r8()
        return h * 256 + l
    end
    
    local numInst = r16()
    local insts = {}
    for i = 1, numInst do
        insts[i] = {r8(), r8(), r8(), r8()}
    end
    
    local numK = r16()
    local ks = {}
    for i = 1, numK do
        local kt = r8()
        if kt == 0 then
            ks[i] = nil
        elseif kt == 1 then
            ks[i] = (r8() == 1)
        elseif kt == 2 then
            local nlen = r8()
            local ns = ""
            for p = 1, nlen do ns = ns .. string.char(r8()) end
            ks[i] = tonumber(ns)
        elseif kt == 3 then
            local slen = r16()
            local ss = {}
            for p = 1, slen do ss[p] = string.char(r8()) end
            ks[i] = table.concat(ss)
        end
    end
    return insts, ks
end

${fTableVar}[127] = function(insts, ks)
    local stk = {}
    local pc = 1
    local env = (type(getfenv) == "function" and getfenv()) or _G
    local unp = unpack or table.unpack
    
    while pc <= #insts do
        local inst = insts[pc]
        local op, a, b, c = inst[1], inst[2], inst[3], inst[4]
        
        if op == ${opLoadk} then
            stk[a] = ks[b]
        elseif op == ${opGetglobal} then
            stk[a] = env[ks[b]]
        elseif op == ${opSetglobal} then
            env[ks[b]] = stk[a]
        elseif op == ${opMove} then
            stk[a] = stk[b]
        elseif op == ${opCall} then
            local fn = stk[a]
            if type(fn) == "function" then
                local args = {}
                for idx = 1, c do args[idx] = stk[a + idx] end
                local res = fn(unp(args, 1, c))
                stk[b] = res
            end
        elseif op == ${opBinop} then
            local opStr = ks[c] or "+"
            local v1, v2 = stk[a], stk[b]
            if opStr == "+" then stk[a] = v1 + v2
            elseif opStr == "-" then stk[a] = v1 - v2
            elseif opStr == "*" then stk[a] = v1 * v2
            elseif opStr == "/" then stk[a] = v1 / v2
            elseif opStr == ".." then stk[a] = tostring(v1) .. tostring(v2)
            elseif opStr == "==" then stk[a] = (v1 == v2)
            end
        elseif op == ${opNewtable} then
            stk[a] = {}
        elseif op == ${opGettable} then
            local tbl = stk[b]
            if type(tbl) == "table" or type(tbl) == "userdata" then
                stk[a] = tbl[ks[c]]
            end
        elseif op == ${opSettable} then
            local tbl = stk[a]
            if type(tbl) == "table" then
                tbl[ks[b]] = stk[c]
            end
        elseif op == ${opForprep} then
            stk[a] = stk[a] - stk[a + 2]
            pc = pc + b
        elseif op == ${opForloop} then
            local step = stk[a + 2]
            local count = stk[a] + step
            stk[a] = count
            if (step > 0 and count <= stk[a + 1]) or (step < 0 and count >= stk[a + 1]) then
                pc = pc - b
            end
        elseif op == ${opJmpif} then
            if stk[a] then
                pc = pc + b
            end
        elseif op == ${opReturn} then
            if b > 0 then return stk[a] end
            return
        end
        pc = pc + 1
    end
end

local function ${gzVar}()
    local sTable = ${fTableVar}[32](${bzVar}, ${seed})
    local dec = ${fTableVar}[62](${bzVar}, ${seed}, sTable)
    local insts, ks = ${fTableVar}[5](dec)
    return ${fTableVar}[127](insts, ks)
end

${gzVar}()
`;

  return {
    success: true,
    code: vmLoaderScript.trim(),
    instructionCount: rawInstructions.length,
    constantCount: constants.length,
  };
}

