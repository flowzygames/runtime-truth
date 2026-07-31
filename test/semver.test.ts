import { describe, expect, it } from "vitest";

import {
  parseRange,
  relateRanges,
  satisfies,
} from "../src/semver.js";

describe("semver range analysis", () => {
  it("supports exact, partial, comparator, caret, tilde, wildcard, union, and hyphen ranges", () => {
    expect(satisfies("20.11.1", "20.11.1")).toBe(true);
    expect(satisfies("20.9.0", "20")).toBe(true);
    expect(satisfies("21.0.0", "20")).toBe(false);
    expect(satisfies("22.1.0", ">=20 <23")).toBe(true);
    expect(satisfies("21.0.0", "^20.1.0")).toBe(false);
    expect(satisfies("20.12.0", "~20.11.0")).toBe(false);
    expect(satisfies("22.3.0", "20.x || 22.x")).toBe(true);
    expect(satisfies("21.0.0", "20 - 22")).toBe(true);
  });

  it("classifies subset, overlap, disjoint, and unknown ranges", () => {
    expect(relateRanges("20", ">=20 <23")).toBe("subset");
    expect(relateRanges(">=18", ">=20")).toBe("overlap");
    expect(relateRanges("18", ">=20")).toBe("disjoint");
    expect(relateRanges("lts/*", ">=20")).toBe("unknown");
    expect(parseRange("not-a-version")).toBeNull();
  });
});
