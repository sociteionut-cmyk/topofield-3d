declare module 'dxf' {
  export function parseString(s: string): { entities: Array<{ type: string; [k: string]: unknown }> };
}
