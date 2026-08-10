/**
 * Jest for the React client.
 *
 * `.cjs`, not `.js`: this package is `"type": "module"`, so a plain jest.config.js
 * would be loaded as ESM and `module.exports` would be undefined.
 *
 * jsdom rather than node, because most of what is worth testing here is what the
 * owner can actually press. The three components that gate a write — the
 * confirmation card, the pinned gate, and the answer buttons — are only
 * meaningfully covered by rendering them and clicking.
 *
 * Nothing here touches the network. `fetch` is stubbed per test, so the suite
 * runs with no API, no Docker and no Groq key, exactly like the API's unit
 * suite.
 */
module.exports = {
  testEnvironment: "jsdom",
  rootDir: ".",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tests/tsconfig.json" }],
  },
  testMatch: ["**/tests/**/*.test.ts?(x)"],
  testTimeout: 10_000,
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/main.tsx",
    "!src/**/index.ts",
    "!src/**/*.types.ts",
  ],
};
