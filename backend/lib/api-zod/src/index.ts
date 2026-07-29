// AUTO-MAINTAINED by lib/api-spec/scripts/fix-zod-barrel.mjs (run via codegen).
// The `.ts` extension on the runtime export keeps this package loadable by
// Node's native TypeScript stripping (used by `node --test` in api-server).
// The types barrel is type-only, so it is erased at runtime and its
// extensionless internal imports never get resolved by Node.
export * from "./generated/api.ts";
export type * from "./generated/types/index.ts";
