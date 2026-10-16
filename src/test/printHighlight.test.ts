// @vitest-environment node
/**
 * הדגשת חיפוש בדף הדפוס (printHighlight + sanitizeSegmentRanges), על כל שורות הדפוס בש"ס:
 *   · בלי חיפוש — הפלט זהה תו בתו לפלט של היום (sanitizeSegment);
 *   · הטקסט המנורמל של כל זרם זהה בדיוק למה שהחיפוש בכל הש"ס משווה אליו;
 *   · כל תוצאה של החיפוש בכל הש"ס נפתחת עם הדגשה (קודם: 6%–100% מהתוצאות בלי אף הדגשה, לפי השאילתה).
 */
import { describe, it, expect } from "vitest";
import { printIndex, layouts, searchFile } from "./tzurat/data";
import { sanitizeSegment, sanitizeSegmentRanges } from "../features/daf/buildHtml";
import { normalizeStream, streamHighlights } from "../features/daf/printHighlight";
import { fromSearchFile, searchSeqs, type Seq } from "../features/daf/printSearchCore";

const slugs = printIndex();
const rawLines = (slug: string, amud: string, s: string) =>
  layouts(slug)[amud].slabs.filter((sl) => sl.s === s).flatMap((sl) => (sl.lines ?? []).map((l) => l.t));

describe("הדגשה בדף הדפוס", () => {
  it("בלי חיפוש: כל שורה זהה תו בתו לפלט של היום", () => {
    let n = 0;
    for (const slug of slugs) for (const lay of Object.values(layouts(slug))) for (const sl of lay.slabs) for (const l of sl.lines ?? []) {
      expect(sanitizeSegmentRanges(l.t, [])).toBe(sanitizeSegment(l.t, ""));
      n++;
    }
    // 793,607 עד 14.10; פחות 417 — השורות של ארבעת עמודי זבחים שהוצאו מהדפוס המדויק
    expect(n).toBe(793190);
  }, 120_000);

  it("הטקסט המנורמל של כל זרם זהה לזה של החיפוש בכל הש\"ס", () => {
    const bad: string[] = [];
    for (const slug of slugs) {
      const seqs: Seq[] = [];
      fromSearchFile(slug, searchFile(slug), seqs);
      for (const sq of seqs) {
        const want = sq.norm.replace(/\s+/g, " ").trim();
        if (normalizeStream(rawLines(slug, sq.amud, sq.s)).norm !== want) bad.push(`${slug}:${sq.amud}:${sq.s}`);
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it("טווחים: הדגשה בתוך שורה, ביטוי שחוצה שורה, ניקוד וגרש", () => {
    expect(streamHighlights(["אמר רבא הכי"], "אמר רבא").ranges).toEqual([[[0, 7]]]);
    expect(streamHighlights(["והא אמר", "רבא הכי"], "אמר רבא")).toEqual({ ranges: [[[4, 7]], [[0, 3]]], count: 1 });
    expect(streamHighlights(["קורין את שמע"], "קוֹרִין").ranges).toEqual([[[0, 5]]]);
    expect(streamHighlights(["מתני' מאימתי"], "מתני׳").ranges).toEqual([[[0, 4]]]);
    expect(streamHighlights(["<b>אמר</b> רבא"], "אמר רבא").ranges).toEqual([[[0, 7]]]);
    expect(streamHighlights(["א"], "").count).toBe(0);
    expect(sanitizeSegmentRanges("<b>אמר</b> רבא", [[0, 7]])).toBe('<b><mark class="daf-hit">אמר</mark></b><mark class="daf-hit"> רבא</mark>');
  });

  it("כל תוצאה של החיפוש בכל הש\"ס נפתחת עם הדגשה", () => {
    const seqs: Seq[] = [];
    for (const slug of slugs) fromSearchFile(slug, searchFile(slug), seqs);
    const misses: Record<string, number> = {};
    for (const q of ["אמר רבא", "תנו רבנן", "מתני'", "מתני׳", "בְּרֵאשִׁית", 'ת"ר', "בשוליא דנגרי"]) {
      const total = searchSeqs(seqs, q, "all", new Map())!.total;
      let miss = 0, found = 0;
      for (const sq of seqs) {
        const expected = searchSeqs([sq], q, "all", new Map())!.total;
        if (!expected) continue;
        const got = streamHighlights(rawLines(sq.file, sq.amud, sq.s), q).count;
        found += Math.min(got, expected);
        if (got < expected) miss++;
      }
      expect(found, q).toBe(total);
      misses[q] = miss;
    }
    expect(misses).toEqual({ "אמר רבא": 0, "תנו רבנן": 0, "מתני'": 0, "מתני׳": 0, "בְּרֵאשִׁית": 0, 'ת"ר': 0, "בשוליא דנגרי": 0 });
  }, 180_000);
});
