/**
 * Jest with ESM and TypeScript.
 *
 * The moduleNameMapper entry is the crux: the source imports with ".js"
 * extensions (required by NodeNext), but the files on disk are ".ts". Without
 * stripping the extension every import fails to resolve under Jest.
 *
 * Requires --experimental-vm-modules; see the "test" script in package.json.
 */
export default {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    // isolatedModules belongs in tsconfig.json from ts-jest v30 onward.
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  testMatch: ["**/tests/**/*.test.ts"],
  // These are integration tests against a live MCP server, database and Groq.
  // A model call plus retries can take a while.
  testTimeout: 180_000,
};
