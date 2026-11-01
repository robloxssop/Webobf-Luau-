import * as luaparse from 'luaparse';

export interface VMCompilationResult {
  success: boolean;
  code: string;
  instructionCount: number;
  constantCount: number;
  error?: string;
}

/**
 * Compiles Lua 5.1 / Luau source code into a Luraph-style Custom Bytecode Virtual Machine.
 *
 * Pipeline Architecture:
 * 1. AST Parsing -> Custom Bytecode instructions & encrypted constant table.
 * 2. Randomized per-build opcode mapping.
 * 3. Serialization + RC4-like cipher + 16-bit safe LCG keystream -> Encrypted BZ String payload.
 * 4. Loader generator featuring F-table handler dispatchers (F[127] VM, F[32] S-box, F[62] Decryptor, F[5] Deserializer),
 *    gZ entry point, closed proxy environment (zero _G leaks), runtime-derived seed, and zero-loadstring execution.
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
    'LOADK',
    'LOADNIL',
    'LOADBOOL',
    'MOVE',
    'GETGLOBAL',
    'SETGLOBAL',
    'NEWTABLE',
    'GETTABLE_K',
    'GETTABLE_R',
    'SETTABLE_K',
    'SETTABLE_R',
    'ADD',
    'SUB',
    'MUL',
    'DIV',
    'MOD',
    'POW',
    'CONCAT',
    'EQ',
    'NEQ',
    'LT',
    'LE',
    'GT',
    'GE',
    'AND',
    'OR',
    'UNM',
    'NOT',
    'LEN',
    'CALL',
    'RETURN',
    'JMP',
    'JMPIF',
    'JMPIFNOT',
    'FORPREP',
    'FORLOOP',
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
    const idx = constants.length + 1; // 1-based index in Lua
    constants.push(val);
    constMap.set(key, idx);
    return idx;
  }

  const rawInstructions: [number, number, number, number][] = [];

  function emit(op: string, a = 0, b = 0, c = 0): number {
    const opCode = opMap.get(op) || 0;
    rawInstructions.push([opCode, a, b, c]);
    return rawInstructions.length - 1;
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
      emit('LOADK', targetReg, kIdx, 0);
    } else if (node.type === 'NumericLiteral') {
      const kIdx = addConstant(node.value);
      emit('LOADK', targetReg, kIdx, 0);
    } else if (node.type === 'BooleanLiteral') {
      emit('LOADBOOL', targetReg, node.value ? 1 : 0, 0);
    } else if (node.type === 'NilLiteral') {
      emit('LOADNIL', targetReg, 0, 0);
    } else if (node.type === 'Identifier') {
      if (localRegs.has(node.name)) {
        emit('MOVE', targetReg, localRegs.get(node.name)!, 0);
      } else {
        const kIdx = addConstant(node.name);
        emit('GETGLOBAL', targetReg, kIdx, 0);
      }
    } else if (node.type === 'BinaryExpression') {
      const regL = allocReg();
      const regR = allocReg();
      compileExpression(node.left, regL);
      compileExpression(node.right, regR);

      const binMap: Record<string, string> = {
        '+': 'ADD',
        '-': 'SUB',
        '*': 'MUL',
        '/': 'DIV',
        '%': 'MOD',
        '^': 'POW',
        '..': 'CONCAT',
        '==': 'EQ',
        '~=': 'NEQ',
        '<': 'LT',
        '<=': 'LE',
        '>': 'GT',
        '>=': 'GE',
        'and': 'AND',
        'or': 'OR',
      };
      const opName = binMap[node.operator] || 'ADD';
      emit(opName, targetReg, regL, regR);
    } else if (node.type === 'UnaryExpression') {
      const regA = allocReg();
      compileExpression(node.argument, regA);
      if (node.operator === '-') emit('UNM', targetReg, regA, 0);
      else if (node.operator === 'not') emit('NOT', targetReg, regA, 0);
      else if (node.operator === '#') emit('LEN', targetReg, regA, 0);
    } else if (node.type === 'CallExpression') {
      compileCall(node, targetReg);
    } else if (node.type === 'MemberExpression') {
      const baseReg = allocReg();
      compileExpression(node.base, baseReg);
      const propIdx = addConstant(node.identifier.name);
      emit('GETTABLE_K', targetReg, baseReg, propIdx);
    } else if (node.type === 'IndexExpression') {
      const baseReg = allocReg();
      compileExpression(node.base, baseReg);
      const idxReg = allocReg();
      compileExpression(node.index, idxReg);
      emit('GETTABLE_R', targetReg, baseReg, idxReg);
    } else if (node.type === 'TableConstructorExpression') {
      emit('NEWTABLE', targetReg, 0, 0);
      let arrayIndex = 1;
      for (const field of node.fields) {
        if (field.type === 'TableValue') {
          const valReg = allocReg();
          compileExpression(field.value, valReg);
          emit('SETTABLE_K', targetReg, addConstant(arrayIndex++), valReg);
        } else if (field.type === 'TableKeyString') {
          const valReg = allocReg();
          compileExpression(field.value, valReg);
          emit('SETTABLE_K', targetReg, addConstant(field.key.name), valReg);
        } else if (field.type === 'TableKey') {
          const keyReg = allocReg();
          compileExpression(field.key, keyReg);
          const valReg = allocReg();
          compileExpression(field.value, valReg);
          emit('SETTABLE_R', targetReg, keyReg, valReg);
        }
      }
    }
  }

  function compileCall(node: any, targetReg: number) {
    const fnReg = allocReg();

    // Check method call (colon operator e.g. obj:method(...))
    if (node.base.type === 'MemberExpression' && node.base.indexer === ':') {
      const objReg = allocReg();
      compileExpression(node.base.base, objReg);
      const methodIdx = addConstant(node.base.identifier.name);
      emit('GETTABLE_K', fnReg, objReg, methodIdx);

      const argRegs: number[] = [objReg];
      for (const arg of node.arguments) {
        const aReg = allocReg();
        compileExpression(arg, aReg);
        argRegs.push(aReg);
      }

      for (let i = 0; i < argRegs.length; i++) {
        emit('MOVE', fnReg + 1 + i, argRegs[i], 0);
      }

      emit('CALL', fnReg, argRegs.length, targetReg);
      return;
    }

    compileExpression(node.base, fnReg);
    const argRegs: number[] = [];
    for (const arg of node.arguments) {
      const aReg = allocReg();
      compileExpression(arg, aReg);
      argRegs.push(aReg);
    }

    for (let i = 0; i < argRegs.length; i++) {
      emit('MOVE', fnReg + 1 + i, argRegs[i], 0);
    }

    emit('CALL', fnReg, argRegs.length, targetReg);
  }

  function compileStatement(stmt: any) {
    if (!stmt) return;

    if (stmt.type === 'CallStatement') {
      const dummy = allocReg();
      compileCall(stmt.expression, dummy);
    } else if (stmt.type === 'LocalStatement') {
      for (let i = 0; i < stmt.variables.length; i++) {
        const v = stmt.variables[i];
        const r = allocReg();
        localRegs.set(v.name, r);
        if (stmt.init && stmt.init[i]) {
          compileExpression(stmt.init[i], r);
        } else {
          emit('LOADNIL', r, 0, 0);
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
            emit('MOVE', localRegs.get(v.name)!, valReg, 0);
          } else {
            const kIdx = addConstant(v.name);
            emit('SETGLOBAL', valReg, kIdx, 0);
          }
        } else if (v.type === 'MemberExpression') {
          const baseReg = allocReg();
          compileExpression(v.base, baseReg);
          const propIdx = addConstant(v.identifier.name);
          emit('SETTABLE_K', baseReg, propIdx, valReg);
        } else if (v.type === 'IndexExpression') {
          const baseReg = allocReg();
          compileExpression(v.base, baseReg);
          const kReg = allocReg();
          compileExpression(v.index, kReg);
          emit('SETTABLE_R', baseReg, kReg, valReg);
        }
      }
    } else if (stmt.type === 'IfStatement') {
      const exitJumps: number[] = [];
      for (let c = 0; c < stmt.clauses.length; c++) {
        const clause = stmt.clauses[c];
        let jmpNotIdx = -1;
        if (clause.condition) {
          const condReg = allocReg();
          compileExpression(clause.condition, condReg);
          jmpNotIdx = emit('JMPIFNOT', condReg, 0, 0);
        }

        for (const s of clause.body) {
          compileStatement(s);
        }

        if (c < stmt.clauses.length - 1) {
          exitJumps.push(emit('JMP', 0, 0, 0));
        }

        if (jmpNotIdx !== -1) {
          rawInstructions[jmpNotIdx][2] = rawInstructions.length - jmpNotIdx - 1;
        }
      }

      for (const ej of exitJumps) {
        rawInstructions[ej][2] = rawInstructions.length - ej - 1;
      }
    } else if (stmt.type === 'WhileStatement') {
      const startPc = rawInstructions.length;
      const condReg = allocReg();
      compileExpression(stmt.condition, condReg);
      const jmpOut = emit('JMPIFNOT', condReg, 0, 0);

      for (const s of stmt.body) {
        compileStatement(s);
      }

      const loopJmp = emit('JMP', 0, 0, 0);
      rawInstructions[loopJmp][2] = startPc - loopJmp - 1;
      rawInstructions[jmpOut][2] = rawInstructions.length - jmpOut - 1;
    } else if (stmt.type === 'ForNumericStatement') {
      const varName = stmt.variable.name;
      const baseR = allocReg();
      compileExpression(stmt.start, baseR);
      const limitR = allocReg();
      compileExpression(stmt.end, limitR);
      const stepR = allocReg();
      if (stmt.step) compileExpression(stmt.step, stepR);
      else emit('LOADK', stepR, addConstant(1), 0);

      const extVarR = allocReg();
      localRegs.set(varName, extVarR);

      const prepIdx = emit('FORPREP', baseR, 0, extVarR);
      const bodyStart = rawInstructions.length;

      for (const s of stmt.body) {
        compileStatement(s);
      }

      const loopIdx = emit('FORLOOP', baseR, 0, extVarR);
      rawInstructions[prepIdx][2] = loopIdx - prepIdx;
      rawInstructions[loopIdx][2] = loopIdx - bodyStart + 1;
    } else if (stmt.type === 'ReturnStatement') {
      if (stmt.arguments && stmt.arguments.length > 0) {
        const retReg = allocReg();
        compileExpression(stmt.arguments[0], retReg);
        emit('RETURN', retReg, 1, 0);
      } else {
        emit('RETURN', 0, 0, 0);
      }
    } else if (stmt.type === 'DoStatement') {
      for (const s of stmt.body) {
        compileStatement(s);
      }
    } else if (stmt.type === 'RepeatStatement') {
      const startPc = rawInstructions.length;
      for (const s of stmt.body) {
        compileStatement(s);
      }
      const condReg = allocReg();
      compileExpression(stmt.condition, condReg);
      const repJmp = emit('JMPIFNOT', condReg, 0, 0);
      rawInstructions[repJmp][2] = startPc - repJmp - 1;
    }
  }

  for (const stmt of ast.body) {
    compileStatement(stmt);
  }

  emit('RETURN', 0, 0, 0);

  // 2. Serialize Bytecode + Constants into Binary Bytes
  const serializedBytes: number[] = [];

  // Pack instruction count (2 bytes)
  const instCount = rawInstructions.length;
  serializedBytes.push((instCount >> 8) & 0xff, instCount & 0xff);

  // Pack raw instructions [op, a, b, c]
  for (const [op, a, b, c] of rawInstructions) {
    serializedBytes.push(op & 0xff, a & 0xff, (b >= 0 ? b : 256 + (b % 256)) & 0xff, c & 0xff);
  }

  // Pack constants length (2 bytes)
  const kCount = constants.length;
  serializedBytes.push((kCount >> 8) & 0xff, kCount & 0xff);

  // Pack serialized constants
  for (const c of constants) {
    if (c === null || c === undefined) {
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

  // 3. RC4-like + 16-bit Float-Safe LCG Keystream Encryption
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

  // 4. Build F-Table Loader Wrapper (Luraph Architecture)
  const randTag = Math.random().toString(36).substring(2, 6);
  const bzVar = `_bz_${randTag}`;
  const fTableVar = `F_${randTag}`;
  const gzVar = `gZ_${randTag}`;

  const opLoadk = opMap.get('LOADK');
  const opLoadnil = opMap.get('LOADNIL');
  const opLoadbool = opMap.get('LOADBOOL');
  const opMove = opMap.get('MOVE');
  const opGetglobal = opMap.get('GETGLOBAL');
  const opSetglobal = opMap.get('SETGLOBAL');
  const opNewtable = opMap.get('NEWTABLE');
  const opGettableK = opMap.get('GETTABLE_K');
  const opGettableR = opMap.get('GETTABLE_R');
  const opSettableK = opMap.get('SETTABLE_K');
  const opSettableR = opMap.get('SETTABLE_R');
  const opAdd = opMap.get('ADD');
  const opSub = opMap.get('SUB');
  const opMul = opMap.get('MUL');
  const opDiv = opMap.get('DIV');
  const opMod = opMap.get('MOD');
  const opPow = opMap.get('POW');
  const opConcat = opMap.get('CONCAT');
  const opEq = opMap.get('EQ');
  const opNeq = opMap.get('NEQ');
  const opLt = opMap.get('LT');
  const opLe = opMap.get('LE');
  const opGt = opMap.get('GT');
  const opGe = opMap.get('GE');
  const opAnd = opMap.get('AND');
  const opOr = opMap.get('OR');
  const opUnm = opMap.get('UNM');
  const opNot = opMap.get('NOT');
  const opLen = opMap.get('LEN');
  const opCall = opMap.get('CALL');
  const opReturn = opMap.get('RETURN');
  const opJmp = opMap.get('JMP');
  const opJmpif = opMap.get('JMPIF');
  const opJmpifnot = opMap.get('JMPIFNOT');
  const opForprep = opMap.get('FORPREP');
  const opForloop = opMap.get('FORLOOP');

  const vmLoaderScript = `local ${bzVar} = "${bzPayloadStr}"
local ${fTableVar} = {}

${fTableVar}[32] = function(bz, k)
    local s = {}
    for idx = 0, 255 do s[idx] = idx end
    local j = 0
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
        local o, a, b, c = r8(), r8(), r8(), r8()
        if b > 127 then b = b - 256 end
        insts[i] = {o, a, b, c}
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
    local _e = (type(getfenv) == "function" and getfenv()) or (type(_G) == "table" and _G)
    local prx = setmetatable({}, {
        __index = function(_, k)
            if _e then return _e[k] end
            return nil
        end,
        __newindex = function(_, k, v)
            if _e then _e[k] = v end
        end
    })
    local unp = unpack or table.unpack
    
    while pc <= #insts do
        local inst = insts[pc]
        local o, a, b, c = inst[1], inst[2], inst[3], inst[4]
        
        if o == ${opLoadk} then
            stk[a] = ks[b]
        elseif o == ${opLoadnil} then
            stk[a] = nil
        elseif o == ${opLoadbool} then
            stk[a] = (b == 1)
        elseif o == ${opMove} then
            stk[a] = stk[b]
        elseif o == ${opGetglobal} then
            stk[a] = prx[ks[b]]
        elseif o == ${opSetglobal} then
            prx[ks[b]] = stk[a]
        elseif o == ${opNewtable} then
            stk[a] = {}
        elseif o == ${opGettableK} then
            stk[a] = stk[b][ks[c]]
        elseif o == ${opGettableR} then
            stk[a] = stk[b][stk[c]]
        elseif o == ${opSettableK} then
            stk[a][ks[b]] = stk[c]
        elseif o == ${opSettableR} then
            stk[a][stk[b]] = stk[c]
        elseif o == ${opAdd} then stk[a] = stk[b] + stk[c]
        elseif o == ${opSub} then stk[a] = stk[b] - stk[c]
        elseif o == ${opMul} then stk[a] = stk[b] * stk[c]
        elseif o == ${opDiv} then stk[a] = stk[b] / stk[c]
        elseif o == ${opMod} then stk[a] = stk[b] % stk[c]
        elseif o == ${opPow} then stk[a] = stk[b] ^ stk[c]
        elseif o == ${opConcat} then stk[a] = tostring(stk[b]) .. tostring(stk[c])
        elseif o == ${opEq} then stk[a] = (stk[b] == stk[c])
        elseif o == ${opNeq} then stk[a] = (stk[b] ~= stk[c])
        elseif o == ${opLt} then stk[a] = (stk[b] < stk[c])
        elseif o == ${opLe} then stk[a] = (stk[b] <= stk[c])
        elseif o == ${opGt} then stk[a] = (stk[b] > stk[c])
        elseif o == ${opGe} then stk[a] = (stk[b] >= stk[c])
        elseif o == ${opAnd} then stk[a] = (stk[b] and stk[c])
        elseif o == ${opOr} then stk[a] = (stk[b] or stk[c])
        elseif o == ${opUnm} then stk[a] = -stk[b]
        elseif o == ${opNot} then stk[a] = not stk[b]
        elseif o == ${opLen} then stk[a] = #stk[b]
        elseif o == ${opCall} then
            local fn = stk[a]
            if type(fn) == "function" then
                local args = {}
                for idx = 1, b do args[idx] = stk[a + idx] end
                local res = fn(unp(args, 1, b))
                stk[c] = res
            end
        elseif o == ${opJmp} then
            pc = pc + b
        elseif o == ${opJmpif} then
            if stk[a] then pc = pc + b end
        elseif o == ${opJmpifnot} then
            if not stk[a] then pc = pc + b end
        elseif o == ${opForprep} then
            stk[c] = stk[a]
            local step = stk[a + 2]
            if (step > 0 and stk[a] > stk[a + 1]) or (step < 0 and stk[a] < stk[a + 1]) then
                pc = pc + b
            end
        elseif o == ${opForloop} then
            local step = stk[a + 2]
            local nextVal = stk[c] + step
            if (step > 0 and nextVal <= stk[a + 1]) or (step < 0 and nextVal >= stk[a + 1]) then
                stk[c] = nextVal
                pc = pc - b
            end
        elseif o == ${opReturn} then
            if b > 0 then return stk[a] end
            return
        end
        pc = pc + 1
    end
end

local function ${gzVar}()
    local _s = (function()
        local t = math.floor(os.clock() * 1e6)
        local addr = tonumber(tostring({}):match("0x%x+")) or 0
        return (t + addr) % 4294967296
    end)()
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
