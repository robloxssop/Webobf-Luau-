/**
 * Pure-Luau Bytecode Compiler and Virtual Machine Generator
 * Translates Lua/Luau AST statements into an encrypted bytecode representation
 * with randomized opcodes, position-dependent instruction stream cipher,
 * and a self-contained runtime interpreter executing 100% natively in Roblox Studio.
 */

import * as luaparse from 'luaparse';

export interface VMCompilationResult {
  success: boolean;
  code: string;
  instructionCount: number;
  constantCount: number;
  error?: string;
}

export function compileToLuauVM(
  sourceCode: string,
  options: {
    seed?: number;
    antiTamper?: boolean;
  } = {}
): VMCompilationResult {
  const seed = (options.seed ?? Math.floor(Math.random() * 0xffff)) & 0xff;

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

  // Opcode Mapping (Randomized per build)
  const baseOpcodes = [
    'OP_LOADK',      // 1: Load constant into register
    'OP_GETGLOBAL',  // 2: Load global variable into register
    'OP_SETGLOBAL',  // 3: Set global variable from register
    'OP_MOVE',       // 4: Move register to register
    'OP_CALL',       // 5: Call function in register with args
    'OP_BINOP',      // 6: Binary operation
    'OP_NEWTABLE',   // 7: Create table
    'OP_SETTABLE',   // 8: Table assignment
    'OP_GETTABLE',   // 9: Table index
    'OP_JMP',        // 10: Jump
    'OP_JMPIF',      // 11: Conditional jump
    'OP_RETURN',     // 12: Return
  ];

  // Random permutation of opcode IDs
  const opMap = new Map<string, number>();
  const shuffledOps = [...baseOpcodes];
  for (let i = shuffledOps.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOps[i], shuffledOps[j]] = [shuffledOps[j], shuffledOps[i]];
  }
  shuffledOps.forEach((opName, idx) => {
    opMap.set(opName, idx + 1);
  });

  const constants: any[] = [];
  const constMap = new Map<string, number>();

  function addConstant(val: any): number {
    const key = typeof val + '_' + JSON.stringify(val);
    if (constMap.has(key)) {
      return constMap.get(key)!;
    }
    const idx = constants.length + 1; // 1-indexed in Lua
    constants.push(val);
    constMap.set(key, idx);
    return idx;
  }

  const rawInstructions: [number, number, number, number][] = [];

  function emit(op: string, a = 0, b = 0, c = 0) {
    const opCode = opMap.get(op) || 0;
    rawInstructions.push([opCode, a, b, c]);
  }

  // Symbol table mapping local variables to registers
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
    } else {
      // Fallback: load nil
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

    // Move arguments into consecutive registers starting at fnReg + 1
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
    }
  }

  for (const stmt of ast.body) {
    compileStatement(stmt);
  }

  // Final return instruction
  emit('OP_RETURN', 0, 0, 0);

  // Position-dependent bytecode encryption
  const encryptedInstructions: [number, number, number, number][] = [];
  for (let i = 0; i < rawInstructions.length; i++) {
    const pc = i + 1; // 1-based PC in Lua
    const [op, a, b, c] = rawInstructions[i];
    const encOp = (op ^ ((seed + pc * 47) % 256)) & 0xff;
    const encA = (a ^ ((seed + pc * 31) % 256)) & 0xff;
    const encB = (b ^ ((seed + pc * 19) % 256)) & 0xff;
    const encC = (c ^ ((seed + pc * 13) % 256)) & 0xff;
    encryptedInstructions.push([encOp, encA, encB, encC]);
  }

  // Format constants pool in Lua syntax
  const constStrs = constants.map((c) => {
    if (c === null) return 'nil';
    if (typeof c === 'string') return JSON.stringify(c);
    if (typeof c === 'number') return c.toString();
    if (typeof c === 'boolean') return c ? 'true' : 'false';
    return 'nil';
  });

  const bcLines = encryptedInstructions
    .map((inst) => `{${inst[0]},${inst[1]},${inst[2]},${inst[3]}}`)
    .join(',');

  const opLoadk = opMap.get('OP_LOADK');
  const opGetglobal = opMap.get('OP_GETGLOBAL');
  const opSetglobal = opMap.get('OP_SETGLOBAL');
  const opMove = opMap.get('OP_MOVE');
  const opCall = opMap.get('OP_CALL');
  const opBinop = opMap.get('OP_BINOP');
  const opGettable = opMap.get('OP_GETTABLE');
  const opSettable = opMap.get('OP_SETTABLE');
  const opReturn = opMap.get('OP_RETURN');

  const vmScript = `-- [AegisLua Virtual Machine Container]
-- Mode: Luau Virtual Machine | Target: Roblox Studio Client & Server (Zero loadstring)
local _BC = {${bcLines}}
local _K = {${constStrs.join(',')}}
local _SEED = ${seed}

local function _AEGIS_VM(_bytecode, _constants, _seed)
    local _stack = {}
    local _pc = 1
    local _env = (type(getfenv) == "function" and getfenv()) or _G
    local _unpack = unpack or table.unpack
    local _bxor = (type(bit32) == "table" and bit32.bxor) or function(a, b)
        local res, bit = 0, 1
        while a > 0 or b > 0 do
            local ra, rb = a % 2, b % 2
            if ra ~= rb then res = res + bit end
            a = math.floor(a / 2)
            b = math.floor(b / 2)
            bit = bit * 2
        end
        return res
    end

    while _pc <= #_bytecode do
        local _i = _bytecode[_pc]
        local _op = _bxor(_i[1], (_seed + (_pc * 47)) % 256)
        local _a  = _bxor(_i[2], (_seed + (_pc * 31)) % 256)
        local _b  = _bxor(_i[3], (_seed + (_pc * 19)) % 256)
        local _c  = _bxor(_i[4], (_seed + (_pc * 13)) % 256)

        if _op == ${opLoadk} then
            _stack[_a] = _constants[_b]
        elseif _op == ${opGetglobal} then
            local _gname = _constants[_b]
            _stack[_a] = _env[_gname]
        elseif _op == ${opSetglobal} then
            local _gname = _constants[_b]
            _env[_gname] = _stack[_a]
        elseif _op == ${opMove} then
            _stack[_a] = _stack[_b]
        elseif _op == ${opCall} then
            local _fn = _stack[_a]
            if type(_fn) == "function" then
                local _args = {}
                for _idx = 1, _c do
                    _args[_idx] = _stack[_a + _idx]
                end
                local _res = _fn(_unpack(_args, 1, _c))
                _stack[_b] = _res
            end
        elseif _op == ${opBinop} then
            local _opStr = _constants[_c] or "+"
            local _v1 = _stack[_a]
            local _v2 = _stack[_b]
            if _opStr == "+" then _stack[_a] = _v1 + _v2
            elseif _opStr == "-" then _stack[_a] = _v1 - _v2
            elseif _opStr == "*" then _stack[_a] = _v1 * _v2
            elseif _opStr == "/" then _stack[_a] = _v1 / _v2
            elseif _opStr == ".." then _stack[_a] = tostring(_v1) .. tostring(_v2)
            elseif _opStr == "==" then _stack[_a] = (_v1 == _v2)
            end
        elseif _op == ${opGettable} then
            local _tbl = _stack[_b]
            if type(_tbl) == "table" or type(_tbl) == "userdata" then
                _stack[_a] = _tbl[_constants[_c]]
            end
        elseif _op == ${opSettable} then
            local _tbl = _stack[_a]
            if type(_tbl) == "table" then
                _tbl[_constants[_b]] = _stack[_c]
            end
        elseif _op == ${opReturn} then
            if _b > 0 then
                return _stack[_a]
            end
            return
        end
        _pc = _pc + 1
    end
end

_AEGIS_VM(_BC, _K, _SEED)
`;

  return {
    success: true,
    code: vmScript.trim(),
    instructionCount: encryptedInstructions.length,
    constantCount: constants.length,
  };
}
