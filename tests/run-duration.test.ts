// formatDurationRange (phase C8, audit P1.5): numbers shown to users come
// from measured medians, rounded to whole minutes, and degrade to null so
// callers keep non-numeric copy when stats are absent or nonsensical.

import { describe, expect, it } from "vitest";
import { formatDurationRange } from "../src/lib/run-duration";

describe("formatDurationRange", () => {
  it("renders a median–p75 range in whole minutes", () => {
    // L7 samples: research ~6m, proposal ~15-17m.
    expect(formatDurationRange(6 * 60_000, 7 * 60_000)).toBe("usually 6\u20137 minutes");
    expect(formatDurationRange(15 * 60_000, 17 * 60_000)).toBe("usually 15\u201317 minutes");
  });

  it("collapses to a single value when median and p75 round together", () => {
    expect(formatDurationRange(6 * 60_000, 6.2 * 60_000)).toBe("usually about 6 minutes");
    expect(formatDurationRange(70_000, 80_000)).toBe("usually about 1 minute");
  });

  it("says 'under a minute' for genuinely fast kinds", () => {
    expect(formatDurationRange(20_000, 40_000)).toBe("usually under a minute");
  });

  it("never renders from broken stats", () => {
    expect(formatDurationRange(0, 0)).toBeNull();
    expect(formatDurationRange(-5, 100)).toBeNull();
    expect(formatDurationRange(Number.NaN, 100)).toBeNull();
  });

  it("keeps the range ordered even if p75 < median", () => {
    expect(formatDurationRange(8 * 60_000, 5 * 60_000)).toBe("usually about 8 minutes");
  });
});
