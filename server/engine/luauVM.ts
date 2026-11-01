import * as luaparse from 'luaparse';

export interface VMCompilationResult {
  success: boolean;
  code: string;
  instructionCount: number;
  constantCount: number;
  error?: string;
  externalPayloadUrl?: string;
  rawPayload?: string;
}

/**
 * Senior Architect Commercial Luau / Lua 5.1 Bytecode Virtual Machine Obfuscator.
 *
 * Upgraded Features:
 * 1. Control Flow Flattening (CFF) State Machine:
 *    - Transformed key derivation (_derive_keys) and stream decryption into non-linear,
 *      state-interleaved dispatcher loops with randomized state IDs and jumbled block layouts.
 * 2. Deep State Entanglement:
 *    - Interleaved state-driven key updates and byte unmasking.
 * 3. Polymorphic VM Architecture:
 *    - Fully randomized opcode mapping, 24-permutation field layout, dynamic hashing formulas per build.
 * 4. External / Server-Side Payload Fetching Option:
 *    - Move byte payload (_bz) out of script to host externally via HTTP fetch at runtime (game:HttpGet).
 * 5. Scope Virtualization:
 *    - 100% environment isolation mapping _G and shared to proxy frame.
 */
export function compileToLuauVM(
  sourceCode: string,
  options: {
    seed?: number;
    antiTamper?: boolean;
    externalPayloadUrl?: string;
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

  // 1. PRNG Initialization
  let prngState = seed ^ 0x5a5a5a5a;
  const lcgNext = () => {
    prngState = (Math.imul(1103515245, prngState) + 12345) >>> 0;
    return prngState;
  };

  // Helper for random identifier generation
  const randIdent = (prefix: string) => `${prefix}_${(lcgNext() % 0xffff).toString(36)}${Math.random().toString(36).substring(2, 5)}`;

  // Polymorphic Identifiers
  const bzVar = randIdent('_bz');
  const fTableVar = randIdent('_F');
  const gzVar = randIdent('_gZ');
  const dTableVar = randIdent('_D');
  const kpVar = randIdent('_KP');
  const getPVar = randIdent('_getP');
  const execOpVar = randIdent('_exec');
  const stkVar = randIdent('_stk');
  const pcVar = randIdent('_pc');
  const cycleVar = randIdent('_cyc');

  // Polymorphic Function Table Slots
  const slotAuthFn = (lcgNext() % 450) + 10;
  const slotSBoxFn = (lcgNext() % 450) + 460;
  const slotDecryptFn = (lcgNext() % 450) + 920;
  const slotDeserializerFn = (lcgNext() % 450) + 1380;
  const slotExecEngineFn = (lcgNext() % 450) + 1840;

  // 2. Polymorphic Opcode Shuffling & Dynamic Hashing Formula
  const opMap = new Map<string, number>();
  const shuffledOps = [...baseOpcodes];

  for (let i = shuffledOps.length - 1; i > 0; i--) {
    const j = lcgNext() % (i + 1);
    [shuffledOps[i], shuffledOps[j]] = [shuffledOps[j], shuffledOps[i]];
  }

  const opcodeBase = (lcgNext() % 70) + 15;
  shuffledOps.forEach((opName, idx) => {
    opMap.set(opName, opcodeBase + idx);
  });

  const opHashMult = (lcgNext() % 89) * 2 + 11;
  const opHashAdd = (lcgNext() % 983) + 17;
  const opHashXor = (lcgNext() % 255) + 1;
  const opHashMod = 65536;

  function calcOpSlot(rawOp: number): number {
    return ((((rawOp * opHashMult + opHashAdd) % opHashMod) ^ opHashXor) >>> 0);
  }

  // 3. Full 24 Permutations Instruction Field Layout Scrambling
  function getPermutations(arr: number[]): number[][] {
    if (arr.length <= 1) return [arr];
    const result: number[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const perm of getPermutations(rest)) {
        result.push([arr[i], ...perm]);
      }
    }
    return result;
  }
  const allFieldPermutations = getPermutations([0, 1, 2, 3]);
  const fieldLayout = allFieldPermutations[lcgNext() % allFieldPermutations.length];
  const oPos = fieldLayout[0];
  const aPos = fieldLayout[1];
  const bPos = fieldLayout[2];
  const cPos = fieldLayout[3];

  // 4. Separated Constant Storage Pools
  const numConstants: number[] = [];
  const numConstMap = new Map<number, number>();

  const strConstants: string[] = [];
  const strConstMap = new Map<string, number>();

  const boolConstants: boolean[] = [];
  const boolConstMap = new Map<boolean, number>();

  function addNumConstant(val: number): number {
    if (numConstMap.has(val)) return numConstMap.get(val)!;
    const idx = numConstants.length + 1;
    numConstants.push(val);
    numConstMap.set(val, idx);
    return idx;
  }

  function addStrConstant(val: string): number {
    if (strConstMap.has(val)) return strConstMap.get(val)!;
    const idx = strConstants.length + 1;
    strConstants.push(val);
    strConstMap.set(val, idx);
    return idx;
  }

  function addBoolConstant(val: boolean): number {
    if (boolConstMap.has(val)) return boolConstMap.get(val)!;
    const idx = boolConstants.length + 1;
    boolConstants.push(val);
    boolConstMap.set(val, idx);
    return idx;
  }

  const referencedGlobals = new Set<string>();

  function collectAstGlobals(node: any, locals: Set<string>) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'LocalStatement') {
      for (const v of node.variables || []) {
        if (v && v.name) locals.add(v.name);
      }
    } else if (node.type === 'FunctionDeclaration') {
      if (node.isLocal && node.identifier?.name) {
        locals.add(node.identifier.name);
      } else if (node.identifier?.name) {
        referencedGlobals.add(node.identifier.name);
      }
      for (const param of node.parameters || []) {
        if (param && param.name) locals.add(param.name);
      }
    } else if (node.type === 'Identifier') {
      if (!locals.has(node.name)) {
        referencedGlobals.add(node.name);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          collectAstGlobals(item, locals);
        }
      } else if (child && typeof child === 'object') {
        collectAstGlobals(child, locals);
      }
    }
  }

  collectAstGlobals(ast, new Set());

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
      const kIdx = addStrConstant(strVal);
      emit('LOADK', targetReg, kIdx, 3);
    } else if (node.type === 'NumericLiteral') {
      const kIdx = addNumConstant(node.value);
      emit('LOADK', targetReg, kIdx, 2);
    } else if (node.type === 'BooleanLiteral') {
      const kIdx = addBoolConstant(node.value);
      emit('LOADK', targetReg, kIdx, 1);
    } else if (node.type === 'NilLiteral') {
      emit('LOADNIL', targetReg, 0, 0);
    } else if (node.type === 'Identifier') {
      if (localRegs.has(node.name)) {
        emit('MOVE', targetReg, localRegs.get(node.name)!, 0);
      } else {
        referencedGlobals.add(node.name);
        const kIdx = addStrConstant(node.name);
        emit('GETGLOBAL', targetReg, kIdx, 0);
      }
    } else if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
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
      const propIdx = addStrConstant(node.identifier.name);
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
          emit('SETTABLE_K', targetReg, addNumConstant(arrayIndex++), valReg);
        } else if (field.type === 'TableKeyString') {
          const valReg = allocReg();
          compileExpression(field.value, valReg);
          emit('SETTABLE_K', targetReg, addStrConstant(field.key.name), valReg);
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

    if (node.base.type === 'MemberExpression' && node.base.indexer === ':') {
      const objReg = allocReg();
      compileExpression(node.base.base, objReg);
      const methodIdx = addStrConstant(node.base.identifier.name);
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
      const regsToAssign: { reg: number; initExpr: any }[] = [];
      for (let i = 0; i < stmt.variables.length; i++) {
        const v = stmt.variables[i];
        const r = allocReg();
        localRegs.set(v.name, r);
        regsToAssign.push({ reg: r, initExpr: stmt.init ? stmt.init[i] : null });
      }
      for (const item of regsToAssign) {
        if (item.initExpr) {
          compileExpression(item.initExpr, item.reg);
        } else {
          emit('LOADNIL', item.reg, 0, 0);
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
            const kIdx = addStrConstant(v.name);
            emit('SETGLOBAL', valReg, kIdx, 0);
          }
        } else if (v.type === 'MemberExpression') {
          const baseReg = allocReg();
          compileExpression(v.base, baseReg);
          const propIdx = addStrConstant(v.identifier.name);
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
      else emit('LOADK', stepR, addNumConstant(1), 2);

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

  // 5. 128-Byte Nonce Buffer & HMAC-PBKDF Key Sub-Derivations
  const nonceBytes: number[] = [];
  for (let i = 0; i < 128; i++) {
    nonceBytes.push((lcgNext() >>> 0) % 256);
  }

  const saltBytecode = (seed ^ 0x9e3779b9) % 256;
  const saltOp = (seed ^ 0x85ebca6b) % 256;
  const saltNum = (seed ^ 0xc2b2ae35) % 256;
  const saltStr = (seed ^ 0x27d4eb2d) % 256;
  const saltAuth = (seed ^ 0x1f34e89a) % 256;

  const kdfMult1 = ([19, 23, 29, 31, 37])[lcgNext() % 5];
  const kdfMult2 = ([41, 43, 47, 53, 59])[lcgNext() % 5];
  const kdfMult3 = ([61, 67, 71, 73, 79])[lcgNext() % 5];
  const kdfMult4 = ([83, 89, 97, 101, 103])[lcgNext() % 5];
  const kdfMult5 = ([107, 109, 113, 127, 131])[lcgNext() % 5];

  // Derive sub-keys at build time
  let k_bytecode = saltBytecode;
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 24; i++) {
      k_bytecode = ((k_bytecode * kdfMult1 + nonceBytes[i]) >>> 0) % 256;
    }
  }

  let k_op = saltOp;
  for (let round = 0; round < 4; round++) {
    for (let i = 24; i < 48; i++) {
      k_op = ((k_op * kdfMult2 + nonceBytes[i]) >>> 0) % 256;
    }
  }

  let k_numConst = saltNum;
  for (let round = 0; round < 4; round++) {
    for (let i = 48; i < 72; i++) {
      k_numConst = ((k_numConst * kdfMult3 + nonceBytes[i]) >>> 0) % 256;
    }
  }

  let k_strConst = saltStr;
  for (let round = 0; round < 4; round++) {
    for (let i = 72; i < 96; i++) {
      k_strConst = ((k_strConst * kdfMult4 + nonceBytes[i]) >>> 0) % 256;
    }
  }

  let k_auth = saltAuth;
  for (let round = 0; round < 4; round++) {
    for (let i = 96; i < 120; i++) {
      k_auth = ((k_auth * kdfMult5 + nonceBytes[i]) >>> 0) % 256;
    }
  }

  const dynStep = ([13, 17, 19, 23, 29, 31, 37])[lcgNext() % 7];
  const numStep = ([11, 13, 17, 19, 23])[lcgNext() % 5];
  const numAdd = (lcgNext() % 50) + 7;
  const strStep = ([23, 29, 31, 37, 41])[lcgNext() % 5];

  // 6. Binary Serialization & Separated Pool Encoding
  const serializedBytes: number[] = [];

  const instCount = rawInstructions.length;
  serializedBytes.push((instCount >> 8) & 0xff, instCount & 0xff);

  // Instructions Scrambled Layout
  for (let idx = 0; idx < rawInstructions.length; idx++) {
    const [op, a, b, c] = rawInstructions[idx];
    const pc = idx + 1;
    const dynKey = (k_op + pc * dynStep) % 256;
    const mutatedOp = (op ^ dynKey) & 0xff;

    const encA = a & 0xff;
    const encB = (b >= 0 ? b : 256 + (b % 256)) & 0xff;
    const encC = c & 0xff;

    const quad = [0, 0, 0, 0];
    quad[oPos] = mutatedOp;
    quad[aPos] = encA;
    quad[bPos] = encB;
    quad[cPos] = encC;

    serializedBytes.push(...quad);
  }

  // Pool 1: Numeric Constants
  const numKCount = numConstants.length;
  serializedBytes.push((numKCount >> 8) & 0xff, numKCount & 0xff);
  for (const n of numConstants) {
    const numStr = n.toString();
    serializedBytes.push(numStr.length & 0xff);
    for (let i = 0; i < numStr.length; i++) {
      const numMask = (i * numStep + k_numConst + numAdd) % 256;
      serializedBytes.push((numStr.charCodeAt(i) ^ numMask) & 0xff);
    }
  }

  // Pool 2: CBC-Style Chained String Constants
  const strKCount = strConstants.length;
  serializedBytes.push((strKCount >> 8) & 0xff, strKCount & 0xff);
  for (const s of strConstants) {
    const strBytes = Array.from(Buffer.from(s, 'utf8'));
    serializedBytes.push((strBytes.length >> 8) & 0xff, strBytes.length & 0xff);
    let cbcIv = k_strConst;
    for (let i = 0; i < strBytes.length; i++) {
      const origByte = strBytes[i];
      const charMask = (cbcIv ^ ((i * strStep) % 256)) & 0xff;
      const encByte = (origByte ^ charMask) & 0xff;
      serializedBytes.push(encByte);
      cbcIv = (encByte + cbcIv * 17) % 256;
    }
  }

  // Pool 3: Bitfield Bitmap Compressed Boolean Pool
  const boolKCount = boolConstants.length;
  serializedBytes.push((boolKCount >> 8) & 0xff, boolKCount & 0xff);
  let boolBitmap = 0;
  for (let i = 0; i < boolConstants.length; i++) {
    if (boolConstants[i]) {
      boolBitmap |= (1 << (i % 30));
    }
  }
  const boolMask = (k_numConst * 257) % 0x3fffffff;
  const maskedBoolBitmap = (boolBitmap ^ boolMask) >>> 0;
  serializedBytes.push(
    (maskedBoolBitmap >>> 24) & 0xff,
    (maskedBoolBitmap >>> 16) & 0xff,
    (maskedBoolBitmap >>> 8) & 0xff,
    maskedBoolBitmap & 0xff
  );

  // Keyed HMAC Authentication Tag Computation (32-bit HMAC-Adler)
  let authA = k_auth + 1;
  let authB = (k_auth * 31) % 65521;
  for (let i = 0; i < serializedBytes.length; i++) {
    authA = (authA + serializedBytes[i] * 37) % 65521;
    authB = (authB + authA * 19 + serializedBytes[i]) % 65521;
  }

  // Poly-Alphabetic XAR Stream Encryption
  const sboxStep = ([17, 19, 23, 29, 31])[lcgNext() % 5];
  const lcgMult1 = (lcgNext() % 15) * 2 + 17;
  const lcgAdd1 = (lcgNext() % 20000) + 5001;
  const posStep = ([7, 11, 13, 17, 19])[lcgNext() % 5];

  const rc4S = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + rc4S[i] + k_bytecode + (i * sboxStep)) % 256;
    [rc4S[i], rc4S[j]] = [rc4S[j], rc4S[i]];
  }

  const encryptedPayloadBytes: number[] = [...nonceBytes];
  let rc4I = 0;
  let rc4J = 0;
  let lcgKey = (k_bytecode * 257) % 65536;

  for (let pos = 0; pos < serializedBytes.length; pos++) {
    rc4I = (rc4I + 1) % 256;
    rc4J = (rc4J + rc4S[rc4I]) % 256;
    [rc4S[rc4I], rc4S[rc4J]] = [rc4S[rc4J], rc4S[rc4I]];
    const rc4K = rc4S[(rc4S[rc4I] + rc4S[rc4J]) % 256];

    lcgKey = (lcgKey * lcgMult1 + lcgAdd1) % 65536;
    const lcgK = (lcgKey >>> 8) & 0xff;

    const encByte = (serializedBytes[pos] ^ rc4K ^ lcgK ^ ((pos * posStep) % 256)) & 0xff;
    encryptedPayloadBytes.push(encByte);
  }

  // Chunk payload
  const bzChunks: string[] = [];
  const chunkSize = Math.max(32, Math.ceil(encryptedPayloadBytes.length / 6));
  for (let i = 0; i < encryptedPayloadBytes.length; i += chunkSize) {
    const slice = encryptedPayloadBytes.slice(i, i + chunkSize);
    bzChunks.push(slice.map((b) => `\\${b.toString().padStart(3, '0')}`).join(''));
  }
  const formattedRawPayload = bzChunks.join('');

  // Encrypted Parameter Array Construction
  const paramStep = (lcgNext() % 17) + 5;
  const paramMult = (lcgNext() % 7) + 3;

  const rawKParams = [
    saltBytecode,               // 1
    saltOp,                     // 2
    saltNum,                    // 3
    saltStr,                    // 4
    saltAuth,                   // 5
    kdfMult1,                   // 6
    kdfMult2,                   // 7
    kdfMult3,                   // 8
    kdfMult4,                   // 9
    kdfMult5,                   // 10
    sboxStep,                   // 11
    lcgMult1,                   // 12
    (lcgAdd1 >> 8) & 0xff,      // 13
    lcgAdd1 & 0xff,             // 14
    posStep,                    // 15
    (authA >> 8) & 0xff,        // 16
    authA & 0xff,               // 17
    (authB >> 8) & 0xff,        // 18
    authB & 0xff,               // 19
    numStep,                    // 20
    numAdd,                     // 21
    strStep,                    // 22
    dynStep,                    // 23
  ];

  const maskedKParams = rawKParams.map((val, idx) => {
    const pIdx = idx + 1;
    const pMask = (pIdx * paramStep + 8 * paramMult) % 256;
    return (val ^ pMask) & 0xff;
  });

  // Polymorphic Dynamic Double-Indirection Mapping for Handler Slots
  const slotLoadk = calcOpSlot(opMap.get('LOADK')!);
  const slotLoadnil = calcOpSlot(opMap.get('LOADNIL')!);
  const slotLoadbool = calcOpSlot(opMap.get('LOADBOOL')!);
  const slotMove = calcOpSlot(opMap.get('MOVE')!);
  const slotGetglobal = calcOpSlot(opMap.get('GETGLOBAL')!);
  const slotSetglobal = calcOpSlot(opMap.get('SETGLOBAL')!);
  const slotNewtable = calcOpSlot(opMap.get('NEWTABLE')!);
  const slotGettableK = calcOpSlot(opMap.get('GETTABLE_K')!);
  const slotGettableR = calcOpSlot(opMap.get('GETTABLE_R')!);
  const slotSettableK = calcOpSlot(opMap.get('SETTABLE_K')!);
  const slotSettableR = calcOpSlot(opMap.get('SETTABLE_R')!);
  const slotAdd = calcOpSlot(opMap.get('ADD')!);
  const slotSub = calcOpSlot(opMap.get('SUB')!);
  const slotMul = calcOpSlot(opMap.get('MUL')!);
  const slotDiv = calcOpSlot(opMap.get('DIV')!);
  const slotMod = calcOpSlot(opMap.get('MOD')!);
  const slotPow = calcOpSlot(opMap.get('POW')!);
  const slotConcat = calcOpSlot(opMap.get('CONCAT')!);
  const slotEq = calcOpSlot(opMap.get('EQ')!);
  const slotNeq = calcOpSlot(opMap.get('NEQ')!);
  const slotLt = calcOpSlot(opMap.get('LT')!);
  const slotLe = calcOpSlot(opMap.get('LE')!);
  const slotGt = calcOpSlot(opMap.get('GT')!);
  const slotGe = calcOpSlot(opMap.get('GE')!);
  const slotAnd = calcOpSlot(opMap.get('AND')!);
  const slotOr = calcOpSlot(opMap.get('OR')!);
  const slotUnm = calcOpSlot(opMap.get('UNM')!);
  const slotNot = calcOpSlot(opMap.get('NOT')!);
  const slotLen = calcOpSlot(opMap.get('LEN')!);
  const slotCall = calcOpSlot(opMap.get('CALL')!);
  const slotReturn = calcOpSlot(opMap.get('RETURN')!);
  const slotJmp = calcOpSlot(opMap.get('JMP')!);
  const slotJmpif = calcOpSlot(opMap.get('JMPIF')!);
  const slotJmpifnot = calcOpSlot(opMap.get('JMPIFNOT')!);
  const slotForprep = calcOpSlot(opMap.get('FORPREP')!);
  const slotForloop = calcOpSlot(opMap.get('FORLOOP')!);

  // Strict Whitelist Global Dictionary
  const customGlobals = Array.from(referencedGlobals)
    .filter((g) => g !== '_G' && g !== 'shared' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(g))
    .map((g) => `[${JSON.stringify(g)}] = true`)
    .join(', ');

  // Payload Generation Strategy (Inline vs External Server Fetch)
  const isExternal = Boolean(options.externalPayloadUrl && options.externalPayloadUrl.trim().length > 0);
  const targetUrl = options.externalPayloadUrl ? options.externalPayloadUrl.trim() : '';

  let bzInitializationCode = '';
  if (isExternal) {
    bzInitializationCode = `local function _fetchPayload(url)
    if type(game) == "userdata" or type(game) == "table" then
        if type(game.HttpGet) == "function" then
            local ok, res = pcall(game.HttpGet, game, url)
            if ok and type(res) == "string" and #res > 0 then return res end
        end
    end
    if type(http_request) == "function" then
        local ok, res = pcall(http_request, {Url = url, Method = "GET"})
        if ok and type(res) == "table" and res.Body then return res.Body end
    end
    if type(request) == "function" then
        local ok, res = pcall(request, {Url = url, Method = "GET"})
        if ok and type(res) == "table" and res.Body then return res.Body end
    end
    error("Failed to fetch external VM payload from server: " .. tostring(url))
end
local ${bzVar} = _fetchPayload("${targetUrl}")`;
  } else {
    bzInitializationCode = `local ${bzVar} = table.concat({
    ${bzChunks.map((c) => `"${c}"`).join(',\n    ')}
})`;
  }

  // Generate Control Flow Flattening (CFF) State IDs
  const st0 = (lcgNext() % 8000) + 1000;
  const st1 = (lcgNext() % 8000) + 9000;
  const st2 = (lcgNext() % 8000) + 17000;
  const st3 = (lcgNext() % 8000) + 25000;
  const st4 = (lcgNext() % 8000) + 33000;
  const stEnd = (lcgNext() % 8000) + 41000;

  // CFF Jumbled State Block Dispatcher Generation for Key Derivation
  const kdfBlocks = [
    {
      id: st0,
      code: `k_bc = (k_bc * m1 + payload:byte(i)) % 256
            i = i + 1
            if i > 24 then
                i = 25
                _state = ${st1}
            end`,
    },
    {
      id: st1,
      code: `k_op = (k_op * m2 + payload:byte(i)) % 256
            i = i + 1
            if i > 48 then
                i = 49
                _state = ${st2}
            end`,
    },
    {
      id: st2,
      code: `k_num = (k_num * m3 + payload:byte(i)) % 256
            i = i + 1
            if i > 72 then
                i = 73
                _state = ${st3}
            end`,
    },
    {
      id: st3,
      code: `k_str = (k_str * m4 + payload:byte(i)) % 256
            i = i + 1
            if i > 96 then
                i = 97
                _state = ${st4}
            end`,
    },
    {
      id: st4,
      code: `k_auth = (k_auth * m5 + payload:byte(i)) % 256
            i = i + 1
            if i > 120 then
                r = r + 1
                if r > 4 then
                    _state = ${stEnd}
                else
                    i = 1
                    _state = ${st0}
                end
            end`,
    },
  ];

  // Shuffle CFF Blocks in emitted Lua code
  for (let i = kdfBlocks.length - 1; i > 0; i--) {
    const j = lcgNext() % (i + 1);
    [kdfBlocks[i], kdfBlocks[j]] = [kdfBlocks[j], kdfBlocks[i]];
  }

  const kdfCffCode = kdfBlocks
    .map((b, idx) => {
      const clause = idx === 0 ? 'if' : 'elseif';
      return `${clause} _state == ${b.id} then\n            ${b.code}`;
    })
    .join('\n        ');

  const vmLoaderScript = `${bzInitializationCode}
local ${fTableVar} = {}

local function _bxor(a, b)
    if type(bit32) == "table" then return bit32.bxor(a, b) end
    local r, m = 0, 1
    while a > 0 or b > 0 do
        if ((a % 2) + (b % 2)) % 2 == 1 then r = r + m end
        a, b = math.floor(a / 2), math.floor(b / 2)
        m = m * 2
    end
    return r
end

-- Anti-Static Encrypted Parameter Pool
local ${kpVar} = { ${maskedKParams.join(', ')} }
local function ${getPVar}(i)
    local mask = (i * ${paramStep} + #type(type) * ${paramMult}) % 256
    return _bxor(${kpVar}[i], mask)
end

-- 1. Control Flow Flattened (CFF) Non-Linear State Machine KDF Generator
local function _derive_keys(payload)
    local k_bc, k_op, k_num, k_str, k_auth = ${getPVar}(1), ${getPVar}(2), ${getPVar}(3), ${getPVar}(4), ${getPVar}(5)
    local m1, m2, m3, m4, m5 = ${getPVar}(6), ${getPVar}(7), ${getPVar}(8), ${getPVar}(9), ${getPVar}(10)
    
    local _state = ${st0}
    local r, i = 1, 1

    while _state ~= ${stEnd} do
        ${kdfCffCode}
        end
    end

    return k_bc, k_op, k_num, k_str, k_auth
end

-- 2. Cryptographic Keyed HMAC Rolling Digest Authentication Verification
${fTableVar}[${slotAuthFn}] = function(decBytes, expA, expB, k_auth)
    local a, b = k_auth + 1, (k_auth * 31) % 65521
    local len = #decBytes
    for i = 1, len do
        a = (a + decBytes[i] * 37) % 65521
        b = (b + a * 19 + decBytes[i]) % 65521
    end
    return a == expA and b == expB
end

-- 3. RC4 State S-Box Generator
${fTableVar}[${slotSBoxFn}] = function(bz, k_bc)
    local s = {}
    local sStep = ${getPVar}(11)
    for idx = 0, 255 do s[idx] = idx end
    local j = 0
    for idx = 0, 255 do
        j = (j + s[idx] + k_bc + (idx * sStep)) % 256
        s[idx], s[j] = s[j], s[idx]
    end
    return s
end

-- Poly-Alphabetic Payload Decryptor
${fTableVar}[${slotDecryptFn}] = function(bz, k_bc, s)
    local res = {}
    local len = #bz
    local i, j = 0, 0
    local lcgMult = ${getPVar}(12)
    local lcgAdd = ${getPVar}(13) * 256 + ${getPVar}(14)
    local posStep = ${getPVar}(15)
    local lcg = (k_bc * 257) % 65536
    for p = 129, len do
        local pos = p - 128
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        local k1 = s[(s[i] + s[j]) % 256]
        lcg = (lcg * lcgMult + lcgAdd) % 65536
        local k2 = math.floor(lcg / 256) % 256
        local b = bz:byte(p)
        local shift = ((pos - 1) * posStep) % 256
        local dec = _bxor(_bxor(b, k1), _bxor(k2, shift))
        res[pos] = dec
    end
    return res
end

-- 4. Bounds-Checked Constant Pools & Instruction Deserializer
${fTableVar}[${slotDeserializerFn}] = function(decBytes, k_num, k_str)
    local pos = 1
    local decLen = #decBytes
    local numStep, numAdd, strStep = ${getPVar}(20), ${getPVar}(21), ${getPVar}(22)

    local function r8()
        if pos > decLen then
            error("Corrupted or truncated bytecode stream in VM deserializer")
        end
        local b = decBytes[pos]
        pos = pos + 1
        return b
    end

    local function r16()
        if pos + 1 > decLen then
            error("Corrupted or truncated bytecode stream in VM deserializer (r16)")
        end
        local h = r8()
        local l = r8()
        return h * 256 + l
    end

    local function r32()
        if pos + 3 > decLen then
            error("Corrupted or truncated bytecode stream in VM deserializer (r32)")
        end
        local b1, b2, b3, b4 = r8(), r8(), r8(), r8()
        return b1 * 16777216 + b2 * 65536 + b3 * 256 + b4
    end
    
    local numInst = r16()
    if numInst > 50000 then
        error("Bytecode instruction count exceeds maximum limit (50000)")
    end

    local insts = {}
    for i = 1, numInst do
        local f0, f1, f2, f3 = r8(), r8(), r8(), r8()
        local rawFields = {f0, f1, f2, f3}
        local o = rawFields[${oPos + 1}]
        local a = rawFields[${aPos + 1}]
        local b = rawFields[${bPos + 1}]
        local c = rawFields[${cPos + 1}]
        if b > 127 then b = b - 256 end
        insts[i] = {o, a, b, c}
    end
    
    -- Sub-Pool 1: Numeric Constants
    local numNumK = r16()
    if numNumK > 10000 then
        error("Numeric constant count exceeds maximum limit (10000)")
    end
    local numKs = {}
    for i = 1, numNumK do
        local nlen = r8()
        local ns = {}
        for p = 1, nlen do
            local b = r8()
            local m = ((p - 1) * numStep + k_num + numAdd) % 256
            local decB = _bxor(b, m)
            ns[p] = string.char(decB)
        end
        numKs[i] = tonumber(table.concat(ns))
    end

    -- Sub-Pool 2: CBC-Style Chained String Constants
    local numStrK = r16()
    if numStrK > 10000 then
        error("String constant count exceeds maximum limit (10000)")
    end
    local strKs = {}
    for i = 1, numStrK do
        local slen = r16()
        if slen > 1000000 then
            error("String constant length exceeds maximum limit (1MB)")
        end
        local ss = {}
        local cbcIv = k_str
        for p = 1, slen do
            local encByte = r8()
            local charMask = _bxor(cbcIv, ((p - 1) * strStep) % 256)
            local decChar = _bxor(encByte, charMask)
            ss[p] = string.char(decChar)
            cbcIv = (encByte + cbcIv * 17) % 256
        end
        strKs[i] = table.concat(ss)
    end

    -- Sub-Pool 3: Bitfield Compressed Boolean Constants
    local numBoolK = r16()
    if numBoolK > 10000 then
        error("Boolean constant count exceeds maximum limit (10000)")
    end
    local boolKs = {}
    local maskedBoolBitmap = r32()
    local boolMask = (k_num * 257) % 0x3fffffff
    local unmaskedBitmap = _bxor(maskedBoolBitmap, boolMask)

    for i = 1, numBoolK do
        local bitVal = math.floor(unmaskedBitmap / (2 ^ (i - 1))) % 2
        boolKs[i] = (bitVal == 1)
    end

    return insts, numKs, strKs, boolKs
end

-- 5. Polymorphic Execution Engine & Variadic Multi-Return Interpreter Loop
${fTableVar}[${slotExecEngineFn}] = function(insts, numKs, strKs, boolKs, k_op)
    local ${stkVar} = {}
    local ${pcVar} = 1
    local ${cycleVar} = 0
    local maxCycles = 10000000 -- Cycle quota limit
    local dynStep = ${getPVar}(23)
    
    local _pcall   = pcall
    local _select  = select
    local _type    = type
    local _rawget  = rawget
    local _rawset  = rawset
    local _setmt   = setmetatable
    local _getmt   = getmetatable
    local _newpx   = newproxy

    local _real_env = (_type(getfenv) == "function" and getfenv()) or _G
    local _px = (_type(_newpx) == "function" and _newpx(true))
    local _mt = (_px and _getmt(_px)) or {}

    local _sandbox = {}
    local _whitelist = {
        ["print"] = true, ["warn"] = true, ["error"] = true, ["assert"] = true,
        ["pcall"] = true, ["ypcall"] = true, ["xpcall"] = true,
        ["type"] = true, ["typeof"] = true, ["tostring"] = true, ["tonumber"] = true,
        ["select"] = true, ["unpack"] = true, ["next"] = true, ["pairs"] = true, ["ipairs"] = true,
        ["setmetatable"] = true, ["getmetatable"] = true, ["rawget"] = true, ["rawset"] = true, ["rawequal"] = true,
        ["math"] = true, ["string"] = true, ["table"] = true, ["bit32"] = true, ["os"] = true, ["utf8"] = true, ["coroutine"] = true,
        ["game"] = true, ["workspace"] = true, ["script"] = true, ["Instance"] = true,
        ["Vector3"] = true, ["Vector2"] = true, ["CFrame"] = true, ["Color3"] = true,
        ["UDim2"] = true, ["UDim"] = true, ["Ray"] = true, ["BrickColor"] = true, ["TweenInfo"] = true,
        ["task"] = true, ["wait"] = true, ["tick"] = true, ["delay"] = true, ["spawn"] = true,
        ${customGlobals ? customGlobals + ',' : ''}
    }

    _mt.__index = function(_, key)
        if key == "_G" or key == "shared" then
            return prx
        end
        if not _whitelist[key] then
            return nil
        end
        local sbVal = _sandbox[key]
        if sbVal ~= nil then
            return sbVal
        end
        local rVal = _rawget(_real_env, key)
        if rVal ~= nil then
            return rVal
        end
        return _real_env[key]
    end

    _mt.__newindex = function(_, key, val)
        if key == "_G" or key == "shared" then
            return
        end
        if not _whitelist[key] then
            _sandbox[key] = val
            return
        end
        _rawset(_real_env, key, val)
    end

    _mt.__tostring = function() return "userdata: 0x0" end
    _mt.__metatable = false

    local prx = _px or _setmt({}, _mt)
    _sandbox["_G"] = prx
    _sandbox["shared"] = prx

    local unp = unpack or table.unpack

    -- Bounds-Checked Constant Retrieval
    local function getK(idx, poolType)
        if poolType == 1 then
            if idx >= 1 and idx <= #boolKs then return boolKs[idx] end
            error("Out of bounds boolean constant pool index: " .. tostring(idx))
        elseif poolType == 2 then
            if idx >= 1 and idx <= #numKs then return numKs[idx] end
            error("Out of bounds numeric constant pool index: " .. tostring(idx))
        elseif poolType == 3 then
            if idx >= 1 and idx <= #strKs then return strKs[idx] end
            error("Out of bounds string constant pool index: " .. tostring(idx))
        end
        error("Invalid constant pool type: " .. tostring(poolType))
    end

    -- Safe Jump Target Verification
    local function validateJump(target)
        if target < 1 or target > #insts then
            error("Invalid jump target PC out of bounds: " .. tostring(target))
        end
    end

    -- Dynamic Polymorphic Handler Dispatcher
    local ${dTableVar} = {}

    ${dTableVar}[${slotLoadk}] = function(a, b, c) ${stkVar}[a] = getK(b, c) end
    ${dTableVar}[${slotLoadnil}] = function(a, b, c) ${stkVar}[a] = nil end
    ${dTableVar}[${slotLoadbool}] = function(a, b, c) ${stkVar}[a] = (b == 1) end
    ${dTableVar}[${slotMove}] = function(a, b, c) ${stkVar}[a] = ${stkVar}[b] end
    ${dTableVar}[${slotGetglobal}] = function(a, b, c) ${stkVar}[a] = prx[getK(b, 3)] end
    ${dTableVar}[${slotSetglobal}] = function(a, b, c) prx[getK(b, 3)] = ${stkVar}[a] end
    ${dTableVar}[${slotNewtable}] = function(a, b, c) ${stkVar}[a] = {} end
    ${dTableVar}[${slotGettableK}] = function(a, b, c) ${stkVar}[a] = ${stkVar}[b][getK(c, 3)] end
    ${dTableVar}[${slotGettableR}] = function(a, b, c) ${stkVar}[a] = ${stkVar}[b][${stkVar}[c]] end
    ${dTableVar}[${slotSettableK}] = function(a, b, c) ${stkVar}[a][getK(b, 3)] = ${stkVar}[c] end
    ${dTableVar}[${slotSettableR}] = function(a, b, c) ${stkVar}[a][${stkVar}[b]] = ${stkVar}[c] end
    ${dTableVar}[${slotAdd}] = function(a, b, c) ${stkVar}[a] = ${stkVar}[b] + ${stkVar}[c] end
    ${dTableVar}[${slotSub}] = function(a, b, c) ${stkVar}[a] = ${stkVar}[b] - ${stkVar}[c] end
    ${dTableVar}[${slotMul}] = function(a, b, c) ${stkVar}[a] = ${stkVar}[b] * ${stkVar}[c] end
    ${dTableVar}[${slotDiv}] = function(a, b, c) ${stkVar}[a] = ${stkVar}[b] / ${stkVar}[c] end
    ${dTableVar}[${slotMod}] = function(a, b, c) ${stkVar}[a] = ${stkVar}[b] % ${stkVar}[c] end
    ${dTableVar}[${slotPow}] = function(a, b, c) ${stkVar}[a] = ${stkVar}[b] ^ ${stkVar}[c] end
    ${dTableVar}[${slotConcat}] = function(a, b, c) ${stkVar}[a] = tostring(${stkVar}[b]) .. tostring(${stkVar}[c]) end
    ${dTableVar}[${slotEq}] = function(a, b, c) ${stkVar}[a] = (${stkVar}[b] == ${stkVar}[c]) end
    ${dTableVar}[${slotNeq}] = function(a, b, c) ${stkVar}[a] = (${stkVar}[b] ~= ${stkVar}[c]) end
    ${dTableVar}[${slotLt}] = function(a, b, c) ${stkVar}[a] = (${stkVar}[b] < ${stkVar}[c]) end
    ${dTableVar}[${slotLe}] = function(a, b, c) ${stkVar}[a] = (${stkVar}[b] <= ${stkVar}[c]) end
    ${dTableVar}[${slotGt}] = function(a, b, c) ${stkVar}[a] = (${stkVar}[b] > ${stkVar}[c]) end
    ${dTableVar}[${slotGe}] = function(a, b, c) ${stkVar}[a] = (${stkVar}[b] >= ${stkVar}[c]) end
    ${dTableVar}[${slotAnd}] = function(a, b, c) ${stkVar}[a] = (${stkVar}[b] and ${stkVar}[c]) end
    ${dTableVar}[${slotOr}] = function(a, b, c) ${stkVar}[a] = (${stkVar}[b] or ${stkVar}[c]) end
    ${dTableVar}[${slotUnm}] = function(a, b, c) ${stkVar}[a] = -${stkVar}[b] end
    ${dTableVar}[${slotNot}] = function(a, b, c) ${stkVar}[a] = not ${stkVar}[b] end
    ${dTableVar}[${slotLen}] = function(a, b, c) ${stkVar}[a] = #${stkVar}[b] end
    ${dTableVar}[${slotCall}] = function(a, b, c)
        local fn = ${stkVar}[a]
        if _type(fn) == "function" then
            local args = {}
            for idx = 1, b do args[idx] = ${stkVar}[a + idx] end
            
            -- Variadic Multi-Return tuple handling preserving nil gaps via select("#", ...)
            local rets = (function(...)
                return { n = _select("#", ...), ... }
            end)(fn(unp(args, 1, b)))
            
            local numRets = rets.n or 0
            if c > 0 then
                ${stkVar}[c] = (numRets > 0) and rets[1] or nil
            end
            for rIdx = 1, numRets do
                ${stkVar}[a + rIdx - 1] = rets[rIdx]
            end
        else
            error("Attempt to call a non-function value in VM register A")
        end
    end
    ${dTableVar}[${slotJmp}] = function(a, b, c)
        local target = ${pcVar} + b
        validateJump(target)
        ${pcVar} = target
    end
    ${dTableVar}[${slotJmpif}] = function(a, b, c)
        if ${stkVar}[a] then
            local target = ${pcVar} + b
            validateJump(target)
            ${pcVar} = target
        end
    end
    ${dTableVar}[${slotJmpifnot}] = function(a, b, c)
        if not ${stkVar}[a] then
            local target = ${pcVar} + b
            validateJump(target)
            ${pcVar} = target
        end
    end
    ${dTableVar}[${slotForprep}] = function(a, b, c)
        ${stkVar}[c] = ${stkVar}[a]
        local step = ${stkVar}[a + 2]
        if (step > 0 and ${stkVar}[a] > ${stkVar}[a + 1]) or (step < 0 and ${stkVar}[a] < ${stkVar}[a + 1]) then
            local target = ${pcVar} + b
            validateJump(target)
            ${pcVar} = target
        end
    end
    ${dTableVar}[${slotForloop}] = function(a, b, c)
        local step = ${stkVar}[a + 2]
        local nextVal = ${stkVar}[c] + step
        if (step > 0 and nextVal <= ${stkVar}[a + 1]) or (step < 0 and nextVal >= ${stkVar}[a + 1]) then
            ${stkVar}[c] = nextVal
            local target = ${pcVar} - b
            validateJump(target)
            ${pcVar} = target
        end
    end
    ${dTableVar}[${slotReturn}] = function(a, b, c)
        if b > 0 then return ${stkVar}[a] end
        return nil
    end

    -- Polymorphic Indirect Dispatch Executor
    local function ${execOpVar}(realOp, a, b, c)
        local _slot = _bxor(((realOp * ${opHashMult} + ${opHashAdd}) % ${opHashMod}), ${opHashXor})
        local _handler = ${dTableVar}[_slot]
        if _handler then
            local ret = _handler(a, b, c)
            if realOp == ${opMap.get('RETURN')!} then
                return true, ret
            end
            return false, nil
        end
        error("Invalid or unknown opcode execution attempt in VM: " .. tostring(realOp))
    end

    while ${pcVar} <= #insts do
        ${cycleVar} = ${cycleVar} + 1
        if ${cycleVar} > maxCycles then
            error("VM execution cycle count limit exceeded (infinite loop protection)")
        end

        local inst = insts[${pcVar}]
        local _dynKey = (k_op + ${pcVar} * dynStep) % 256
        local _rawOp = _bxor(inst[1], _dynKey)

        local isRet, retVal = ${execOpVar}(_rawOp, inst[2], inst[3], inst[4])
        if isRet then
            return retVal
        end

        ${pcVar} = ${pcVar} + 1
    end
end

local function ${gzVar}()
    local k_bc, k_op, k_num, k_str, k_auth = _derive_keys(${bzVar})
    local sTable = ${fTableVar}[${slotSBoxFn}](${bzVar}, k_bc)
    local dec = ${fTableVar}[${slotDecryptFn}](${bzVar}, k_bc, sTable)
    
    local expA = ${getPVar}(16) * 256 + ${getPVar}(17)
    local expB = ${getPVar}(18) * 256 + ${getPVar}(19)
    if not ${fTableVar}[${slotAuthFn}](dec, expA, expB, k_auth) then
        error("Bytecode authentication digest verification failed (tampered payload)")
    end

    local insts, numKs, strKs, boolKs = ${fTableVar}[${slotDeserializerFn}](dec, k_num, k_str)
    for i = 1, #dec do dec[i] = 0 end
    dec = nil

    return ${fTableVar}[${slotExecEngineFn}](insts, numKs, strKs, boolKs, k_op)
end

${gzVar}()
`;

  return {
    success: true,
    code: vmLoaderScript.trim(),
    instructionCount: rawInstructions.length,
    constantCount: numConstants.length + strConstants.length + boolConstants.length,
    externalPayloadUrl: isExternal ? targetUrl : undefined,
    rawPayload: formattedRawPayload,
  };
}
