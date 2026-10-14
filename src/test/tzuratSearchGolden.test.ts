// @vitest-environment node
/**
 * ערכי זהב לחיפוש בכל הש"ס בצורת הדף: מספר התוצאות לשאילתות קבועות, על כל 36 קובצי החיפוש.
 * המספרים נמדדו ב-13.10 בשלוש דרכים בלתי תלויות (מימוש עצמאי בפייתון, הרכיב עצמו בדפדפן מדומה, והלב כאן).
 * שינוי בנתונים (עמודים שתוקנו) יכול לשנות אותם — אז מעדכנים כאן, בשמירה שמסבירה למה.
 * שינוי בקוד החיפוש לא אמור לשנות אותם בכלל.
 */
import { describe, it, expect } from "vitest";
import { printIndex, searchFile, shasIndex } from "./tzurat/data";
import { fromSearchFile, searchSeqs, MAX_SHOWN, type Seq, type Meta } from "../features/daf/printSearchCore";

const seqs: Seq[] = [];
for (const slug of printIndex()) fromSearchFile(slug, searchFile(slug), seqs);
// כמו באתר: מסך הש"ס מעביר את רשימת המסכתות (שם במאגר ← שם עברי)
const metaOf = new Map<string, Meta>(shasIndex().masechtot.map((m) => [m.slug.toLowerCase(), { slug: m.slug, he: m.he }]));
const count = (q: string, only: "all" | "gemara" | "rashi" | "tosafot" = "all") => searchSeqs(seqs, q, only, metaOf)?.total;

describe("חיפוש בכל הש\"ס — ערכי זהב", () => {
  it("גודל המאגר", () => {
    expect(seqs.length).toBe(15503);
  });

  it("'אמר רבא' — בכל הזרמים ובכל זרם לחוד", () => {
    expect(count("אמר רבא")).toBe(3162);
    expect(count("אמר רבא", "gemara")).toBe(2347);
    expect(count("אמר רבא", "rashi")).toBe(327);
    expect(count("אמר רבא", "tosafot")).toBe(488);
  });

  it("התוצאה הראשונה, והגבלת התוצאות המוצגות", () => {
    const r = searchSeqs(seqs, "אמר רבא", "all", metaOf)!;
    expect(r.hits.length).toBe(MAX_SHOWN);
    expect([r.hits[0].slug, r.hits[0].amud, r.hits[0].s, r.hits[0].he]).toEqual(["Arakhin", "4a", "gemara", "ערכין"]);
  });

  it("שאילתות נוספות", () => {
    expect(count("תנו רבנן")).toBe(750);
    expect(count("בראשית")).toBe(739);
    expect(count("הדרן עלך", "gemara")).toBe(54);
  });

  it("הנרמול: ניקוד, גרש עברי וגרש רגיל נותנים אותה תוצאה", () => {
    expect(count("בְּרֵאשִׁית")).toBe(count("בראשית"));
    expect(count("מתני'", "gemara")).toBe(3572);
    expect(count("מתני׳", "gemara")).toBe(3572);
  });

  it("ביטוי שעובר משורה לשורה נמצא", () => {
    // 'בשוליא דנגרי' בפסחים קח. ובמכות ח: — כולל מופע שחוצה שורה
    expect(count("בשוליא דנגרי")).toBe(5);
  });

  it("שאילתה של תו אחד לא מחפשת", () => {
    expect(searchSeqs(seqs, "א", "all", metaOf)).toBeNull();
    expect(searchSeqs(seqs, " ' ", "all", metaOf)).toBeNull();
  });
});
