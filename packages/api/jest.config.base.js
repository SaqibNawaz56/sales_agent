/**
 * What both suites share.
 *
 * Jest with TypeScript, CommonJS. The ESM scaffolding this file used to carry —
 * extensionsToTreatAsEsm, the moduleNameMapper that stripped ".js" off every
 * relative import, and the --experimental-vm-modules flag on the test script —
 * is all gone. Nest's decorator metadata pushed the package to CommonJS, and
 * under CommonJS ts-jest resolves extensionless relative imports on its own.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  transform: {
    // isolatedModules belongs in tsconfig.json from ts-jest v30 onward.
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tests/tsconfig.json" }],
  },
};
