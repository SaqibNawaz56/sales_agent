const base = require("./jest.config.base");

/**
 * The default suite: unit tests, no network.
 *
 * `npm test` must be free to run. Groq's free tier allows 100,000 tokens a day
 * and the integration suite spends a real share of that in one pass, so the
 * tests you run on every save cannot be the ones that call it. Everything here
 * mocks src/mcp and src/llm at the module boundary, which means no Docker, no
 * PostgreSQL, no API key, and a suite that finishes in seconds.
 *
 * What that buys is not just speed. These tests pin the decisions the model is
 * deliberately kept out of — the checklist, the question templates, the confirm
 * gate, the tool allowlist — and those are exactly the things that must behave
 * identically every run. A suite that needed a live model to check them would
 * be testing the model.
 *
 * The live end-to-end paths still exist; see jest.integration.config.js.
 */
module.exports = {
  ...base,
  testMatch: ["**/tests/unit/**/*.test.ts"],
  // Nothing here waits on I/O. A unit test that takes five seconds is a bug.
  testTimeout: 10_000,
  // Every suite mocks callServerTool; a leaked implementation between files
  // would make failures depend on file order.
  clearMocks: true,
  resetMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/scripts/**",
    "!src/cli/**",
    "!src/**/*.types.ts",
    "!src/**/index.ts",
  ],
};
