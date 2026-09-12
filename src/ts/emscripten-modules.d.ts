// Type stubs for the Emscripten-generated ES modules that sit next to the
// compiled TypeScript in dist/.
declare module '*.mjs' {
  const factory: (opts?: Record<string, unknown>) => Promise<any>;
  export default factory;
}
