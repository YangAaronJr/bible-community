import { describe, expect, it } from "vitest";
import {
  clampTextScale,
  DEFAULT_TEXT_SCALE,
  getTouchDistance,
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
} from "./usePinchFontSize";

describe("usePinchFontSize helpers", () => {
  it("clamps text scale within bounds and rounds to 2 decimals", () => {
    expect(clampTextScale(0.2)).toBe(MIN_TEXT_SCALE);
    expect(clampTextScale(3.5)).toBe(MAX_TEXT_SCALE);
    expect(clampTextScale(1.234)).toBe(1.23);
    expect(clampTextScale(Number.NaN)).toBe(DEFAULT_TEXT_SCALE);
  });

  it("computes Euclidean distance between two touch points", () => {
    expect(
      getTouchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })
    ).toBe(5);
  });
});
