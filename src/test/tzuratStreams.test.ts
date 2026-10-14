// @vitest-environment node
/** העמודה הפנימית בצורת הדף החיה: רש"י, ובעמודים בלי רש"י — רשב"ם (בבא בתרא). */
import { describe, it, expect } from "vitest";
import { innerSegments, outerSegments, type Commentary } from "../features/daf/streams";
import { readJson, shasIndex } from "./tzurat/data";

describe("העמודה הפנימית", () => {
  it("רש\"י כשקיים", () => {
    expect(innerSegments([{ key: "rashi", segments: ["א"] }, { key: "rashbam", segments: ["ב"] }])).toEqual(["א"]);
  });
  it("רשב\"ם כשאין רש\"י, או כשרש\"י ריק", () => {
    expect(innerSegments([{ key: "rashbam", segments: ["ב"] }])).toEqual(["ב"]);
    expect(innerSegments([{ key: "rashi", segments: [] }, { key: "rashbam", segments: ["ב"] }])).toEqual(["ב"]);
  });
  it("בלי פירושים — ריק", () => {
    expect(innerSegments(undefined)).toEqual([]);
    expect(innerSegments([{ key: "ran", segments: ["ג"] }])).toEqual([]);
    expect(outerSegments(undefined)).toEqual([]);
  });

  it("בכל הש\"ס: רק העמודים שאין בהם רש\"י משתנים — 295 בבבא בתרא ופסחים קכא:", () => {
    const changed: string[] = [];
    let withRashi = 0;
    for (const m of shasIndex().masechtot) {
      const { amudim } = readJson<{ amudim: Record<string, { commentaries?: Commentary[] }> }>(`shas/${m.slug}.json.gz`);
      for (const [amud, a] of Object.entries(amudim)) {
        const rashi = a.commentaries?.find((c) => c.key === "rashi")?.segments ?? [];
        const inner = innerSegments(a.commentaries);
        if (rashi.length) { withRashi++; expect(inner).toBe(rashi); }
        else if (inner.length) changed.push(`${m.slug}:${amud}`);
      }
    }
    expect(changed.filter((k) => k.startsWith("Bava_Batra:")).length).toBe(295);
    expect(changed.filter((k) => !k.startsWith("Bava_Batra:"))).toEqual(["Pesachim:121b"]);
    expect(withRashi).toBeGreaterThan(5000);
  }, 120_000);
});
