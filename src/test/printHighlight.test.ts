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
    // 793,607 עד 14.10; פחות 417 — השורות של ארבעת עמודי זבחים שהוצאו מהדפוס המדויק;
    // פחות 4 — מכות יד. וכד.: תיבות של שורה אחת שהמנוע פיצל אוחדו בחזרה לשורות שלהן (תיקון צורה);
    // פחות 111 (15.10) — שורות שהכילו רק כותרת פרק שאינה מודפסת ("פרק שני ... מתני'"), daf-work/complete/headfix.py
    // פחות 598 (15.10) — מילים של הגמרא שהוצבו כשורה נפרדת בעמודת רש"י/תוספות חזרו לשורות שלהן לפי הצילום
    // (daf-work/complete/orphanfix.py; אותן מילים באותו סדר — רק המיקום)
    // פחות 33 — סיבוב שני (זיהוי עמודת הגמרא גם משורות בודדות רחבות, יומא סז. "חציו בסלע וחציו")
    // פחות 3 — מכות ה. ("רבי"), ז: ("למתכוין"), כג.→כב: ("במים:") חזרו לשורות שלהן (layout_fixes.json)
    // פחות 4 — מועד קטן י. (שורה אחת שפוצלה לשלוש תיבות), יז:, יח: (מילים חזרו לשורות שלהן)
    // פחות 1 — מכות ד.: השורה האחרונה של הגמרא אוחדה לשורה אחת ברוחב העמודה (layout_fixes.json)
    // ועוד 10 — 12 עמודים שנבנו מחדש במנוע המשופר (16.10, daf-work/complete/rollout.py): זוהו בהם יותר שורות
    // פחות 7 (16.10) — תיבות רש"י שהכילו רק הוספת עורך (תרגום לעז) והתרוקנו, daf-work/complete/notefix.py
    // פחות 17 (16.10, סגירת הגל השני — daf-work/complete/close): תיבות דחוסות/חתוכות של שורה אחת אוחדו לשורה
    // כבדפוס (−20: הוריות ב: ד. ז: יב:, גיטין עה. עה:, ראש השנה כו:, שבועות כ.); מילים חזרו לעמוד שלהן (−4: ראש השנה
    // כט, סוטה יא:/יב., תענית ט:/י., שבועות מג); "ספר" חזר לשורה בגיטין כא: (−1); שורת גמרא ראשונה שנשמרה ככותרת
    // חזרה לגמרא (+7: ביצה לט:, נזיר לה., שבת מט., שבועות ג., סוטה יז:, יומא מה: ו-סח.)
    // פחות 1 — גיטין סה:: השורה האחרונה ("אבינא מחמרא דנהר פניא אמר רבי זירא") בתיבה אחת
    // פחות 2 — כתובות נב.: שתי השורות האחרונות (רוחב מלא) היו מפוצלות לארבע תיבות, שלוש מהן ריקות; אוחדו לשתי שורות
    // והטקסט שלהן חזר מראש נב: (daf-work/complete/close/rowfill_wave3.json)
    expect(n).toBe(792419);
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
