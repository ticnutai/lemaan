// @vitest-environment node
/** גבול ההגדלה של הדף: במחשב בדיוק כמו קודם (1.6), בטלפון עד 3. */
import { describe, it, expect } from "vitest";
import { maxScaleFor, effectiveScale, MIN_SCALE } from "../features/daf/dafStyle";

describe("הגדלת הדף", () => {
  it("במחשב ובטבלט (רוחב 626 ומעלה) הגבול נשאר 1.6", () => {
    for (const w of [626, 640, 700, 760]) expect(maxScaleFor(w)).toBe(1.6);
  });
  it("בטלפון הגבול עולה, עד 3", () => {
    expect(maxScaleFor(320)).toBe(3);
    expect(maxScaleFor(500)).toBe(2);
  });
  it("כל ערך שמור בטווח הישן (0.85–1.6) נשאר בדיוק כמו שהוא, בכל רוחב", () => {
    for (const w of [320, 400, 640, 760]) for (const v of [0.85, 1, 1.25, 1.6]) expect(effectiveScale(v, w)).toBe(v);
  });
  it("ערך גדול נחתך לפי הרוחב; ערך פגום — 1", () => {
    expect(effectiveScale(2.5, 640)).toBe(1.6);
    expect(effectiveScale(2.5, 320)).toBe(2.5);
    expect(effectiveScale(0.5, 640)).toBe(MIN_SCALE);
    expect(effectiveScale(Number.NaN, 640)).toBe(1);
  });
});
