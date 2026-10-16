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
// כמו באתר: SedarimNavigator מעביר את טבלת המסכתות (שם ספריא ← שם עברי)
const metaOf = new Map<string, Meta>(shasIndex().masechtot.map((m) => [m.slug.toLowerCase(), { slug: m.slug, he: m.he }]));
const count = (q: string, only: "all" | "gemara" | "rashi" | "tosafot" = "all") => searchSeqs(seqs, q, only, metaOf)?.total;

describe("חיפוש בכל הש\"ס — ערכי זהב", () => {
  it("גודל המאגר", () => {
    // 15,503 עד 14.10; פחות 8 (רש"י ותוספות של ארבעת עמודי זבחים שהוצאו מהדפוס המדויק) — כל הספירות למטה לא השתנו
    // פחות 1 (16.10) — פסחים קיב:: אין בו תוספות (במקור: "אין פירוש לקטע זה"); 94 מילים של תוספות מעמוד אחר
    // שהוצגו בו בטעות ירדו בבנייה המחודשת, ועמודת רשב"ם שלמה כמו בדפוס
    expect(seqs.length).toBe(15494);
  });

  // 14.10: הוסרו כפילויות בגבולות בין עמודים (26 עמודים, order/dedupe.py) — כל מופע שירד היה בתוך טקסט כפול,
  // והוא עדיין קיים בראש העמוד הבא, במקומו: 'אמר רבא' 3162→3161 (תמורה כח:), 'בראשית' 739→738 (יבמות קג.),
  // "מתני'" בגמרא 3572→3571 (סנהדרין מג.); ואחריו 'אמר רבא' 3161→3160 (נדרים כד: תוספות)
  it("'אמר רבא' — בכל הזרמים ובכל זרם לחוד", () => {
    expect(count("אמר רבא")).toBe(3160);
    expect(count("אמר רבא", "gemara")).toBe(2346);
    expect(count("אמר רבא", "rashi")).toBe(327);
    expect(count("אמר רבא", "tosafot")).toBe(487);
  });

  it("התוצאה הראשונה, והגבלת התוצאות המוצגות", () => {
    const r = searchSeqs(seqs, "אמר רבא", "all", metaOf)!;
    expect(r.hits.length).toBe(MAX_SHOWN);
    expect([r.hits[0].slug, r.hits[0].amud, r.hits[0].s, r.hits[0].he]).toEqual(["Arakhin", "4a", "gemara", "ערכין"]);
  });

  it("שאילתות נוספות", () => {
    // 750 עד 16.10; פחות 6 — מקומות שבהם הדפוס כותב "ת"ר" ואצלנו היה מפוענח (daf-work/complete/abbrfix.py);
    // פחות 1 — ברכות ג: (השוואה לפרויקט אוצריא + צילום, daf-work/complete/otherfix.py)
    expect(count("תנו רבנן")).toBe(743);
    // 738 עד 16.10; פחות 4 — מראי מקום של ויקיטקסט ("{בראשית יג ...") שאינם מודפסים בגוף הגמרא (daf-work/complete/versefix.py)
    expect(count("בראשית")).toBe(734);
    expect(count("הדרן עלך", "gemara")).toBe(54);
  });

  // 15.10: הוסרו 190 כותרות פרק ("פרק שני אלו הן הגולין מתני'" — מהמקור, לא מודפסות בוילנא;
  // daf-work/complete/headfix.py) — "מתני'" בגמרא 3571→3381: בדיוק מופע אחד לכל כותרת, רק בעמודי הכותרות;
  // ועוד 5 (3381→3376) — שאריות כותרת שהמנוע קיצץ ("ממונות מתני' אחד", daf-work/complete/fragment_fixes.json)
  it("הנרמול: ניקוד, גרש עברי וגרש רגיל נותנים אותה תוצאה", () => {
    expect(count("בְּרֵאשִׁית")).toBe(count("בראשית"));
    // ועוד 1 (3376→3377) — מועד קטן כח: "מתני' נשים במועד מענות", שהמנוע השמיט (במקור ובדפוס)
    // ועוד 8 (3377→3385) — "מתני'" בתחילת משנה שהמנוע השמיט, רק כשהצילום מאשר אותו לפני אותן מילים
    // (daf-work/complete/mtnfix.py: מגילה ח., יומא נח:, נזיר נט: ו-סג., נדרים נו., שבת קד:, שבועות ל., בבא בתרא קו.)
    // ופחות 1 (16.10, 3385→3384) — קידושין נח:: "הדרן עלך האיש מקדש מתני׳" — שארית כותרת; בדפוס הפרק החדש
    // נפתח במילה הגדולה "האומר" בלי "מתני'" (נבדק בצילום, daf-work/complete/close/wave2_edits.json)
    // ופחות 1 (3384→3383) — סנהדרין מב:: "הדין מתני' נגמר הדין" — שארית הכותרת "פרק שישי נגמר הדין"; בדפוס הפרק
    // נפתח במילה הגדולה "נגמר" בלי "מתני'" (נבדק בצילום ובשני העדים, daf-work/complete/close/wave3_edits.json)
    expect(count("מתני'", "gemara")).toBe(3383);
    expect(count("מתני׳", "gemara")).toBe(3383);
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
