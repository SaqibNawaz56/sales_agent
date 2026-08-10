const base = require("./jest.config.base");

/**
 * The live suite. Opt-in, via `npm run test:integration`.
 *
 * These run against the real stack — real MCP server, real PostgreSQL, real
 * Groq. They are slow and they cost tokens, which is the point: a mocked
 * version of these would prove that the mocks agree with each other.
 *
 * Deliberately NOT part of `npm test`. Running the full suite plus the unit
 * tests plus a demo rehearsal will exhaust Groq's 100k-tokens-per-day free tier
 * in one sitting, and the daily bucket does not clear until it resets. Run this
 * the day before a demo, not the morning of one.
 *
 *   docker compose exec -w /app/packages/api api npm run test:integration
 */
module.exports = {
  ...base,
  testMatch: ["**/tests/integration/**/*.test.ts"],
  // A model call plus retries can take a while.
  testTimeout: 180_000,
  // The paths share a catalogue and a customer list; running them concurrently
  // makes the before/after sale counts race.
  maxWorkers: 1,
};
