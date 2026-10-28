declare module 'cookie-parser' {
  import { RequestHandler } from 'express';
  function cookieParser(secret?: string | string[], options?: any): RequestHandler;
  export default cookieParser;
}

declare module 'luaparse' {
  export interface ParseOptions {
    wait?: boolean;
    comments?: boolean;
    scope?: boolean;
    locations?: boolean;
    ranges?: boolean;
    luaVersion?: '5.1' | '5.2' | '5.3' | 'LuaJIT';
    onCreateNode?: (node: any) => void;
    onCreateScope?: () => void;
    onDestroyScope?: () => void;
  }

  export function parse(code: string, options?: ParseOptions): any;
}

declare module 'fengari' {
  export const lua: any;
  export const lauxlib: any;
  export const lualib: any;
  export const to_luastring: (str: string) => Uint8Array;
  export const to_jsstring: (str: any) => string;
}
