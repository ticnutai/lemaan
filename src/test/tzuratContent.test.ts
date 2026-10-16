// @vitest-environment node
/**
 * בדיקת תוכן לכל עמוד בצורת הדף. החריגים של היום (נמדדו ב-14.10) רשומים כאן במדויק:
 *   · חריג חדש — המבחן נכשל (נסיגה);
 *   · חריג שתוקן — המבחן נכשל גם הוא, כדי שמוציאים אותו מהרשימה (והרשימה רק קטנה).
 */
import { describe, it, expect } from "vitest";
import { printIndex, layouts, lineText } from "./tzurat/data";

// עמודים עם פריסת דפוס בלי אף שורת גמרא — אין (ארבעת עמודי זבחים שהיו כאלה הוצאו מהדפוס המדויק ב-14.10,
// ומוצגים בצורת דף מהטקסט עם כל הגמרא; daf-work/overrides.json _retire)
const NO_GEMARA: string[] = [];

// עמודים בלי שורת כותרת
const NO_HEADER = [
  "bava_batra:11a", "bava_batra:41a", "bava_batra:148b", "bava_metzia:3a", "bava_metzia:80b", "eruvin:32b",
  "sanhedrin:20b", "temurah:3a", "temurah:9a", "yevamot:16b", "yevamot:36b", "yevamot:43a", "yevamot:70b", "yevamot:72b",
];

// שורות עם תווים זרים: אות לטינית, #, |, מחבר בלתי נראה, מקף ארוך, אותיות בצורת הצגה (מסכת:עמוד:זרם:התווים)
const ODD = /[A-Za-z#|\u2013\u2014\uFB1D-\uFB4F]|\u200D/g;
const ODD_LINES = [
  // שאר החריגים אחרי תיקוני הטקסט של 14.10 (daf-work/text_fixes.json): אותיות בצורת הצגה בעירובין,
  // מחבר בלתי נראה ב'ירושל‍ם', ומקף ארוך במנחות — לבדיקה נפרדת
  // (האותיות בצורת הצגה בעירובין כז: כח. נח. היו בתוך הוספות עורך ברש"י — ירדו איתן ב-16.10, daf-work/complete/notefix.py)
  "ketubot:111a:gemara:\u200D", "megillah:15a:gemara:\u200D", "menachot:100a:gemara:\u2013",
];

const noGem: string[] = [], noHeader: string[] = [], odd = new Set<string>();
for (const slug of printIndex()) {
  for (const [amud, lay] of Object.entries(layouts(slug))) {
    const key = `${slug}:${amud}`;
    const gem = lay.slabs.filter((s) => s.s === "gemara").flatMap((s) => (s.lines ?? []).map((l) => lineText(l.t))).filter(Boolean);
    if (!gem.length) noGem.push(key);
    if (!lay.header?.length) noHeader.push(key);
    for (const sl of lay.slabs) {
      const texts = [...(sl.lines ?? []).map((l) => l.t), sl.text ?? ""];
      for (const t of texts) {
        const m = (t ?? "").replace(/<[^>]+>/g, " ").match(ODD);
        if (m) odd.add(`${key}:${sl.s}:${[...new Set(m)].sort().join("")}`);
      }
    }
  }
}

describe("תוכן כל עמוד", () => {
  it("אין עמוד דפוס בלי גמרא", () => {
    expect(noGem.sort()).toEqual([...NO_GEMARA].sort());
  });

  it("עמודים בלי כותרת — רק ה-14 הידועים", () => {
    expect(noHeader.sort()).toEqual([...NO_HEADER].sort());
  });

  it("שורות עם תווים זרים — רק הידועות", () => {
    expect([...odd].sort()).toEqual([...ODD_LINES].sort());
  });

  it('כותרות "הדרן" — נוסח "הדרן עלך" מלא (בלי שגיאות זיהוי כמו "הדק עלך", "הדרן לך")', () => {
    // כותרת שנראית כמו הדרן: המילה השנייה היא עלך או קריאה משובשת שלה, או שהראשונה מתחילה ב"הד"
    const LIKE = /^(\S+) (עלך|לך|עלן|קלך|כלך|ערך|עליך|מלך|הלך|על|ןלך) \S/;
    const bad: string[] = [];
    for (const slug of printIndex()) {
      for (const [amud, lay] of Object.entries(layouts(slug))) {
        for (const h of (lay.header ?? []).slice(2)) {
          const m = h.text.match(LIKE);
          if (m && /^ה[דר]/.test(m[1]) && !h.text.startsWith("הדרן עלך ")) bad.push(`${slug}:${amud}:${h.text}`);
        }
      }
    }
    // 14.10, daf-work/complete/hadranfix.py: 140 כותרות תוקנו; נשארה אחת שהקריאה שלה משובשת מדי לתיקון אוטומטי.
    // 16.10, daf-work/complete/hadranfix2.py: גם היא תוקנה ("הדרן עלך חטאת העוף", נבדק בצילום), ועוד 64 שורות הדרן
    // שאותיותיהן היו משובשות ("הבל חייבין", "רני אליעזר") — כל אחת נקראה בעין (complete/close/hadran_decisions.json)
    expect(bad.sort()).toEqual([]);
  });
});
