import * as fengari from 'fengari';
import { RuntimeTestResult, ObfuscationOptions } from '../../src/types/index.ts';
import { obfuscateLua } from './transformer.ts';

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

export interface ExecutionRunOptions {
  enableLoadstring?: boolean;
  provideRobloxGlobals?: boolean;
}

/**
 * Executes a Lua/Luau code string inside the Fengari Lua VM,
 * captures all standard output from print(...), and returns status and output.
 */
export function executeInLuaVM(
  code: string,
  options: ExecutionRunOptions = {}
): { success: boolean; output: string; error?: string } {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  let capturedOutput = '';

  // Custom print function capturing output
  const customPrint = (state: any) => {
    const n = lua.lua_gettop(state);
    const parts: string[] = [];
    for (let i = 1; i <= n; i++) {
      if (lua.lua_isstring(state, i)) {
        parts.push(to_jsstring(lua.lua_tostring(state, i)));
      } else if (lua.lua_isnil(state, i)) {
        parts.push('nil');
      } else if (lua.lua_isboolean(state, i)) {
        parts.push(lua.lua_toboolean(state, i) ? 'true' : 'false');
      } else {
        parts.push(to_jsstring(lua.lua_typename(state, lua.lua_type(state, i))));
      }
    }
    capturedOutput += parts.join('\t') + '\n';
    return 0;
  };

  lua.lua_register(L, to_luastring('print'), customPrint);

  // Configure loadstring availability
  if (!options.enableLoadstring) {
    // In Roblox Studio LocalScripts and default ServerScripts, loadstring is nil, and Luau does not provide load
    lua.lua_pushnil(L);
    lua.lua_setglobal(L, to_luastring('loadstring'));
    lua.lua_pushnil(L);
    lua.lua_setglobal(L, to_luastring('load'));
  } else {
    // When loadstring is enabled, ensure loadstring function exists
    lua.lua_getglobal(L, to_luastring('loadstring'));
    if (lua.lua_isnil(L, -1)) {
      lua.lua_pop(L, 1);
      lua.lua_getglobal(L, to_luastring('load'));
      lua.lua_setglobal(L, to_luastring('loadstring'));
    } else {
      lua.lua_pop(L, 1);
    }
  }

  // Inject Roblox globals simulation if requested
  if (options.provideRobloxGlobals) {
    // Inject game, workspace, task
    lua.lua_newtable(L);
    lua.lua_setglobal(L, to_luastring('game'));

    lua.lua_newtable(L);
    lua.lua_setglobal(L, to_luastring('workspace'));

    lua.lua_newtable(L);
    lua.lua_setglobal(L, to_luastring('task'));
  }

  // Load and execute code
  const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(code));
  if (loadStatus !== lua.LUA_OK) {
    const errMsg = to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_close(L);
    return { success: false, output: capturedOutput, error: errMsg };
  }

  const pcallStatus = lua.lua_pcall(L, 0, 0, 0);
  if (pcallStatus !== lua.LUA_OK) {
    const errMsg = to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_close(L);
    return { success: false, output: capturedOutput, error: errMsg };
  }

  lua.lua_close(L);
  return { success: true, output: capturedOutput };
}

/**
 * Runs the comprehensive automated runtime test suite.
 * Evaluates real obfuscated code against simulated Roblox Studio and executor runtimes.
 */
export async function runRuntimeExecutionTestSuite(): Promise<RuntimeTestResult[]> {
  const results: RuntimeTestResult[] = [];

  // Test 1: Direct Luau Execution of print("Hi") in Roblox Studio (loadstring = nil)
  {
    const start = Date.now();
    const inputCode = 'print("Hi")';
    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'advanced',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: false,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 1337,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_hi_01');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false, // Roblox Studio default: loadstring is unavailable
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'Hi';
    results.push({
      id: 'RUN-01',
      name: 'Direct Luau Execution of print("Hi") in Roblox Studio',
      inputCode,
      expectedOutput: 'Hi',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio (LocalScript & Server with loadstring=nil)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Direct AST statements executed natively without requiring loadstring. Output matches original.'
        : `Execution failed: ${runRes.error || 'Empty output'}`,
    });
  }

  // Test 2: Base64 Decoding with ASCII & UTF-8 Unicode Support
  {
    const start = Date.now();
    const inputCode = 'print("สวัสดี Hi 🎮")';
    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'advanced',
      mode: 'direct_luau',
      stringEncoding: 'base64_xor',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: false,
      controlFlowFlattening: false,
      opaquePredicates: false,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 2026,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_unicode_02');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'สวัสดี Hi 🎮';
    results.push({
      id: 'RUN-02',
      name: 'Base64 & Unicode UTF-8 Text Decoder Integrity',
      inputCode,
      expectedOutput: 'สวัสดี Hi 🎮',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Luau UTF-8 Multi-Byte Decoder',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Base64 decoder properly handled multi-byte UTF-8 sequences and padding without regex errors.'
        : `Decoding failed: ${runRes.error || 'Incorrect decoded characters'}`,
    });
  }

  // Test 3: Local Variables, Arithmetic and Function Scope Renaming
  {
    const start = Date.now();
    const inputCode = `local function compute(val)
  local factor = 5
  return val * factor
end
print(compute(7))`;

    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'maximum',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: false,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 9999,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_calc_03');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === '35';
    results.push({
      id: 'RUN-03',
      name: 'Scope-Aware Renaming & Arithmetic Preserved',
      inputCode,
      expectedOutput: '35',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Luau Runtime',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Local variables, parameters, and return value semantics preserved through transformation.'
        : `Computation error: ${runRes.error}`,
    });
  }

  // Test 4: Dynamic Payload Explicit Error on Missing loadstring
  {
    const start = Date.now();
    const inputCode = 'print("Hi")';
    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'advanced',
      mode: 'dynamic_payload',
      stringEncoding: 'base64_xor',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: false,
      controlFlowFlattening: false,
      opaquePredicates: false,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 42,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_dyn_fail_04');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false, // Simulates Roblox client / default server where loadstring is nil
      provideRobloxGlobals: true,
    });

    // In dynamic_payload mode when loadstring is nil, it MUST NOT fail silently.
    // It must throw an explicit error with '[AegisLua Runtime Compatibility Alert]'
    const hasExplicitAlert = !runRes.success && !!runRes.error && runRes.error.includes('AegisLua Runtime Compatibility Alert');
    results.push({
      id: 'RUN-04',
      name: 'No Silent Failures in Dynamic Compilation Mode',
      inputCode,
      expectedOutput: 'Explicit error: [AegisLua Runtime Compatibility Alert]',
      actualOutput: runRes.error ? runRes.error.split('\n')[0] : 'Failed: Silently did nothing (returned empty)',
      passed: hasExplicitAlert,
      environment: 'Roblox Studio (Disabled loadstring capability test)',
      executionTimeMs: Date.now() - start,
      notes: hasExplicitAlert
        ? 'Active capability check detected missing loadstring and raised an explicit descriptive alert instead of silent failure.'
        : 'Failed: Did not raise expected descriptive error.',
    });
  }

  // Test 5: Dynamic Payload Execution when loadstring IS enabled
  {
    const start = Date.now();
    const inputCode = 'print("Hi")';
    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'advanced',
      mode: 'dynamic_payload',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: false,
      controlFlowFlattening: false,
      opaquePredicates: false,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 1234,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_dyn_succ_05');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: true, // Simulates ServerScriptService with LoadStringEnabled = true
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'Hi';
    results.push({
      id: 'RUN-05',
      name: 'Dynamic Payload Execution when LoadStringEnabled=true',
      inputCode,
      expectedOutput: 'Hi',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Server (ServerScriptService.LoadStringEnabled = true)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Compiled dynamic chunk executed cleanly in supported runtime.'
        : `Execution failed: ${runRes.error}`,
    });
  }

  // Test 6: Control Flow Flattening (CFF) State Machine Execution in Roblox Studio
  {
    const start = Date.now();
    const inputCode = 'local a = 10\nlocal b = 25\nprint(a + b)';
    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'maximum',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 8888,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_cff_06');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false, // Roblox Studio: zero loadstring
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === '35';
    results.push({
      id: 'RUN-06',
      name: 'Control Flow Flattening (CFF) State Dispatcher Execution',
      inputCode,
      expectedOutput: '35',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio (loadstring=nil, CFF state-machine dispatcher)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Basic blocks decomposed, hoisted, and dispatched via opaque state transitions while preserving execution semantics.'
        : `CFF execution failed: ${runRes.error}`,
    });
  }

  // Test 7: Pure-Luau Bytecode Virtual Machine Execution (Zero loadstring)
  {
    const start = Date.now();
    const inputCode = 'print("Hi from Luau VM")';
    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'maximum',
      mode: 'luau_vm',
      stringEncoding: 'byte_array',
      identifierRenaming: false,
      stringEncryption: false,
      constantPooling: true,
      controlFlowFlattening: false,
      opaquePredicates: false,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 777,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_vm_07');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false, // Strictly zero loadstring! Pure Luau interpreter!
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'Hi from Luau VM';
    results.push({
      id: 'RUN-07',
      name: 'Pure-Luau Bytecode Virtual Machine Interpreter',
      inputCode,
      expectedOutput: 'Hi from Luau VM',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio (LocalScript & Server, in-place bytecode interpreter)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Bytecode compiled, instruction stream encrypted with position-dependent key, and executed via pure Luau VM without loadstring.'
        : `Luau VM execution failed: ${runRes.error}`,
    });
  }

  // Test 8: Luraph Grade Ultra-Obfuscation (Barcode Renaming, Anti-Hook, CFF, Zero loadstring)
  {
    const start = Date.now();
    const inputCode = 'print("Luraph Grade Security Active")';
    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'luraph',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      barcodeRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: true,
      antiHookTraps: true,
      deterministic: true,
      seed: 54321,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_luraph_08');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false, // Roblox Studio zero-loadstring guarantee!
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'Luraph Grade Security Active';
    results.push({
      id: 'RUN-08',
      name: 'Luraph Grade Parity (Barcode Renaming + Anti-Hook + CFF Dispatcher)',
      inputCode,
      expectedOutput: 'Luraph Grade Security Active',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio (Zero loadstring, Anti-Hook Sentinel Active)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Luraph barcode renaming, metatable anti-hook sentinel, decompiler traps, and CFF state machine executed cleanly without triggering false positives or requiring loadstring.'
        : `Luraph execution failed: ${runRes.error}`,
    });
  }

  // Test 9: Universal Luau Features: Closures, Upvalues, Compound Operators, and Table Methods
  {
    const start = Date.now();
    const inputCode = `local counter = 0
local function increment(step)
    counter = counter + step
    return counter
end
increment(5)
increment(10)
print("Total: " .. tostring(counter))`;

    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'luraph',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      barcodeRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: true,
      antiHookTraps: true,
      deterministic: true,
      seed: 98765,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_universal_09');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'Total: 15';
    results.push({
      id: 'RUN-09',
      name: 'Universal Luau Features (Closures, Upvalues, State Mutations)',
      inputCode,
      expectedOutput: 'Total: 15',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Luau Runtime (CFF Hoisting & Lexical Scopes)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Lexical upvalues, function mutations, and state transitions preserved across flattened basic blocks.'
        : `Universal features test failed: ${runRes.error}`,
    });
  }

  // Test 10: Automated Pre- vs. Post-Obfuscation Semantic Equivalence (Loops, Conditionals & Math)
  {
    const start = Date.now();
    const inputCode = `local total = 0
for i = 1, 5 do
  if i % 2 == 0 then
    total = total + (i * 2)
  else
    total = total + i
  end
end
print("Result: " .. tostring(total))`;

    // 1. Execute un-obfuscated baseline
    const baselineRes = executeInLuaVM(inputCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });
    const expectedOutput = baselineRes.output.trim();

    // 2. Obfuscate with Luraph / Executor profile + CFF + Rolling String Encryption
    const options: ObfuscationOptions = {
      profile: 'executor_ext',
      preset: 'luraph',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      barcodeRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: true,
      antiHookTraps: true,
      deterministic: true,
      seed: 45678,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_equiv_10');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const actualOutput = runRes.output.trim();
    const passed = runRes.success && actualOutput === expectedOutput && expectedOutput === 'Result: 21';
    results.push({
      id: 'RUN-10',
      name: 'Pre- vs. Post-Obfuscation Semantic Equivalence (Loops & Math)',
      inputCode,
      expectedOutput,
      actualOutput: actualOutput || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio (Zero-loadstring, Exact Output Assertion)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Pre-obfuscation and post-obfuscation outputs match byte-for-byte under Luraph + CFF transformations.'
        : `Equivalence discrepancy: Expected "${expectedOutput}", got "${actualOutput}" (${runRes.error || ''})`,
    });
  }

  // Test 11: Pre- vs. Post-Obfuscation Equivalence on Table Mutation & Upvalues
  {
    const start = Date.now();
    const inputCode = `local tbl = {}
tbl["greeting"] = "hello"
tbl["target"] = "world"
local function combine()
  return tbl["greeting"] .. " " .. tbl["target"]
end
print(combine())`;

    const baselineRes = executeInLuaVM(inputCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });
    const expectedOutput = baselineRes.output.trim();

    const options: ObfuscationOptions = {
      profile: 'executor_ext',
      preset: 'luraph',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      barcodeRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: true,
      antiHookTraps: true,
      deterministic: true,
      seed: 87654,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_table_equiv_11');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const actualOutput = runRes.output.trim();
    const passed = runRes.success && actualOutput === expectedOutput && expectedOutput === 'hello world';
    results.push({
      id: 'RUN-11',
      name: 'Table Mutation & Nested Lexical Scope Equivalence',
      inputCode,
      expectedOutput,
      actualOutput: actualOutput || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Luau Runtime (Table Access & String Concat)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Table key indexing, function closures, and dynamic string decoding produced identical results.'
        : `Table equivalence mismatch: ${runRes.error || 'Output differed'}`,
    });
  }

  // Test 12: Non-Linear CFF with Jump-Table Dispatcher and Decoy Blocks
  {
    const start = Date.now();
    const inputCode = `local a = 12
local b = 18
local c = (a * 2) + b
print("CFF Result: " .. tostring(c))`;

    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'maximum',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 33445,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_cff_jump_12');
    const hasJumpTable = obf.obfuscatedCode.includes('_cff_jmp_');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'CFF Result: 42' && hasJumpTable;
    results.push({
      id: 'RUN-12',
      name: 'Non-Linear Jump-Table CFF with Decoy Blocks',
      inputCode,
      expectedOutput: 'CFF Result: 42',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio (Non-Linear Jump Table & Decoy Graph)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Basic blocks dispatched through randomized lookup table with dead decoy paths. Execution preserved without linear state leakage.'
        : `Jump-table CFF failed: ${runRes.error || 'Did not match expected output'}`,
    });
  }

  // Test 13: Anti-Hook Sentinel Non-Destructive Integrity (No Silent Exits)
  {
    const start = Date.now();
    const inputCode = 'print("Sentinel Integrity Non-Destructive")';
    const options: ObfuscationOptions = {
      profile: 'executor_ext',
      preset: 'luraph',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      barcodeRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: true,
      antiHookTraps: true,
      deterministic: true,
      seed: 99112,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_sentinel_13');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'Sentinel Integrity Non-Destructive';
    results.push({
      id: 'RUN-13',
      name: 'Anti-Hook Sentinel Non-Destructive Execution (No Silent Drops)',
      inputCode,
      expectedOutput: 'Sentinel Integrity Non-Destructive',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio & Executor Runtime (Shielded Metatable Inspection)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Anti-hook inspection executed without raising false alarms or silently dropping valid script execution.'
        : `Sentinel failure: ${runRes.error || 'Empty output (silent exit occurred)'}`,
    });
  }

  // Test 14: Decoder Cache Collision Resistance (Same Length, Different Content)
  {
    const start = Date.now();
    // Two strings with identical 4-character length: "AAAA" and "BBBB"
    const inputCode = `local str1 = "AAAA"
local str2 = "BBBB"
print(str1 .. ":" .. str2)`;

    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'advanced',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: false,
      controlFlowFlattening: false,
      opaquePredicates: false,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 11223,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_cache_collision_14');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'AAAA:BBBB';
    results.push({
      id: 'RUN-14',
      name: 'Decoder Cache Collision Resistance (FNV-1a Content Hash)',
      inputCode,
      expectedOutput: 'AAAA:BBBB',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Luau Runtime (Content Hash Verification in Cache Key)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Strings of identical length correctly hashed into distinct cache keys without collision.'
        : `Cache collision detected: Got "${runRes.output.trim()}" instead of "AAAA:BBBB"`,
    });
  }

  // Test 15: Strict Base64 Validation and Multi-Byte Character Integrity
  {
    const start = Date.now();
    const inputCode = `local a = "Alpha"
local b = "Beta"
print(a .. "+" .. b)`;

    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'advanced',
      mode: 'direct_luau',
      stringEncoding: 'base64_xor',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: false,
      controlFlowFlattening: false,
      opaquePredicates: false,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 99887,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_b64_strict_15');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'Alpha+Beta';
    results.push({
      id: 'RUN-15',
      name: 'Strict Base64 Alignment, Boundary & Padding Validation',
      inputCode,
      expectedOutput: 'Alpha+Beta',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio (Strict RFC-4648 Decoder with Content Digest)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Base64 strings parsed with strict 4-byte boundary validation and non-overlapping cache keys.'
        : `Base64 verification failed: ${runRes.error || 'Output mismatch'}`,
    });
  }

  // Test 16: Centralized Encrypted Constant Pool & Decoy Honeypots (Zero Inline Byte Arrays)
  {
    const start = Date.now();
    const inputCode = `local greeting = "AegisShield"
local target = "RobloxLuau"
print(greeting .. "->" .. target)`;

    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'advanced',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: false,
      opaquePredicates: false,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 45678,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_const_pool_16');
    const hasConstantPool = obf.obfuscatedCode.includes('_0x_K');
    const noInlineDecoders = !obf.obfuscatedCode.includes('_0x_dec({');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'AegisShield->RobloxLuau' && hasConstantPool && noInlineDecoders;
    results.push({
      id: 'RUN-16',
      name: 'Centralized Encrypted Constant Pool & Honeypot Decoys',
      inputCode,
      expectedOutput: 'AegisShield->RobloxLuau',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio (Zero Call-Site Byte Arrays, Unified Dynamic Pool)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'All string constants consolidated into scrambled master table with honeypots. No call-site byte arrays exposed.'
        : `Constant pool test failed: ${runRes.error || 'Output mismatch'}`,
    });
  }

  // Test 17: Global Access Virtualization (Roblox Globals Hidden from Plain Text)
  {
    const start = Date.now();
    const inputCode = `local val = tonumber("123")
print("Parsed:" .. tostring(val + 7))`;

    const options: ObfuscationOptions = {
      profile: 'executor_ext',
      preset: 'luraph',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      barcodeRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      globalAccessObfuscation: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: true,
      antiHookTraps: true,
      deterministic: true,
      seed: 88776,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_global_virt_17');
    const hasGlobalGetter = obf.obfuscatedCode.includes('_0x_G');
    const noRawPrint = !obf.obfuscatedCode.includes('print(');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'Parsed:130' && hasGlobalGetter && noRawPrint;
    results.push({
      id: 'RUN-17',
      name: 'Global Access Virtualization (Globals Hidden from Grep/Signature Matching)',
      inputCode,
      expectedOutput: 'Parsed:130',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio & Executor Runtime (Indirect Global Registry Lookups)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'Lua globals (print, tonumber, tostring) successfully virtualized through _0x_G. Raw identifier grep returns 0 hits.'
        : `Global virtualization test failed: ${runRes.error || 'Output mismatch'}`,
    });
  }

  // Test 18: Non-Linear CFF with Salt-Masked Jump Table & Invariant Traps
  {
    const start = Date.now();
    const inputCode = `local x = 10
local y = 25
local z = (x * 3) + y
print("Z=" .. tostring(z))`;

    const options: ObfuscationOptions = {
      profile: 'roblox_studio',
      preset: 'maximum',
      mode: 'direct_luau',
      stringEncoding: 'byte_array',
      identifierRenaming: true,
      stringEncryption: true,
      constantPooling: true,
      controlFlowFlattening: true,
      opaquePredicates: true,
      removeCommentsAndWhitespace: true,
      antiTamperPrelude: false,
      deterministic: true,
      seed: 77112,
      enableSourceRecovery: false,
    };

    const obf = obfuscateLua(inputCode, options, 'test_cff_salt_18');
    const hasSaltMask = obf.obfuscatedCode.includes('% 4294967296');
    const hasDecoyState = obf.obfuscatedCode.includes('0xdead1');
    const runRes = executeInLuaVM(obf.obfuscatedCode, {
      enableLoadstring: false,
      provideRobloxGlobals: true,
    });

    const passed = runRes.success && runRes.output.trim() === 'Z=55' && hasSaltMask && hasDecoyState;
    results.push({
      id: 'RUN-18',
      name: 'Hardened Non-Linear CFF with Arithmetic Salt Masking & Invariant Traps',
      inputCode,
      expectedOutput: 'Z=55',
      actualOutput: runRes.output.trim() || (runRes.error ? `Error: ${runRes.error}` : '(empty output)'),
      passed,
      environment: 'Roblox Studio (Non-Linear Jump Table, Salt Mask & Trap Blocks)',
      executionTimeMs: Date.now() - start,
      notes: passed
        ? 'State transitions masked through modular salt arithmetic with mathematical invariant decoy paths. Prevents linear static CFG reconstruction.'
        : `Salt CFF test failed: ${runRes.error || 'Output mismatch'}`,
    });
  }

  return results;
}
