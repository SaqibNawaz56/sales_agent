import { compact } from "../src/lib/format-count";
import { formatDuration } from "../src/lib/format-duration";
import { usageLevel } from "../src/lib/usage-level";

describe("compact", () => {
  it.each([
    [998, "998"],
    [999, "999"],
    [1000, "1.0k"],
    [4800, "4.8k"],
    [9999, "10.0k"],
    [10_000, "10k"],
    [11_213, "11k"],
  ])("renders %p as %p", (input, expected) => {
    expect(compact(input)).toBe(expected);
  });

  it("renders zero plainly", () => {
    expect(compact(0)).toBe("0");
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "now"],
    [999, "now"],
    [1000, "1s"],
    [8000, "8s"],
    [59_000, "59s"],
    [60_000, "1m"],
    [172_800, "2m 53s"],
    [3_600_000, "1h"],
    [4_320_000, "1h 12m"],
  ])("renders %pms as %p", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  it("rounds up, so a budget is never reported free early", () => {
    expect(formatDuration(1500)).toBe("2s");
  });

  it("drops a zero seconds remainder rather than saying '2m 0s'", () => {
    expect(formatDuration(120_000)).toBe("2m");
  });
});

describe("usageLevel", () => {
  it.each([
    [0, "ok"],
    [0.59, "ok"],
    [0.6, "warn"],
    [0.84, "warn"],
    [0.85, "critical"],
    [1, "critical"],
  ])("calls %p %p", (fraction, expected) => {
    expect(usageLevel(fraction)).toBe(expected);
  });
});
