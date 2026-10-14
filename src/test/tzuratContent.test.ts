// @vitest-environment node
/**
 * בדיקת תוכן לכל עמוד בצורת הדף. החריגים של היום (נמדדו ב-14.10) רשומים כאן במדויק:
 *   · חריג חדש — המבחן נכשל (נסיגה);
 *   · חריג שתוקן — המבחן נכשל גם הוא, כדי שמוציאים אותו מהרשימה (והרשימה רק קטנה).
 */
import { describe, it, expect } from "vitest";
import { printIndex, layouts, lineText } from "./tzurat/data";

// עמודים עם פריסת דפוס בלי אף שורת גמרא (במאגר הטקסט יש להם גמרא — פגם ותיק, לתיקון בצינור)
const NO_GEMARA = ["zevachim:67b", "zevachim:72a", "zevachim:76b", "zevachim:78a"];

// עמודים בלי שורת כותרת
const NO_HEADER = [
  "bava_batra:11a", "bava_batra:41a", "bava_batra:148b", "bava_metzia:3a", "bava_metzia:80b", "eruvin:32b",
  "sanhedrin:20b", "temurah:3a", "temurah:9a", "yevamot:16b", "yevamot:36b", "yevamot:43a", "yevamot:70b", "yevamot:72b",
];

// שורות עם תווים זרים: אות לטינית, #, |, מחבר בלתי נראה, מקף ארוך, אותיות בצורת הצגה (מסכת:עמוד:זרם:התווים)
const ODD = /[A-Za-z#|\u2013\u2014\uFB1D-\uFB4F]|\u200D/g;
const ODD_LINES = [
  "bava_batra:15b:tosafot:#", "bava_batra:163a:rashi:#", "bava_batra:169a:rashi:#", "bava_metzia:28a:rashi:#",
  "eruvin:27b:rashi:\uFB35", "eruvin:28a:rashi:\uFB2A\uFB35\uFB3B", "eruvin:58a:rashi:\uFB35", "gittin:20b:tosafot:#", "gittin:2a:tosafot:u",
  "ketubot:111a:gemara:\u200D", "ketubot:25b:tosafot:#", "megillah:15a:gemara:\u200D", "megillah:31a:rashi:#",
  "menachot:100a:gemara:\u2013", "shabbat:14a:tosafot:#", "shabbat:79b:tosafot:#", "sukkah:8a:gemara:bhmtu|", "taanit:2a:tosafot:n",
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
  it("עמודים בלי גמרא — רק הארבעה הידועים בזבחים", () => {
    expect(noGem.sort()).toEqual([...NO_GEMARA].sort());
  });

  it("עמודים בלי כותרת — רק ה-14 הידועים", () => {
    expect(noHeader.sort()).toEqual([...NO_HEADER].sort());
  });

  it("שורות עם תווים זרים — רק הידועות", () => {
    expect([...odd].sort()).toEqual([...ODD_LINES].sort());
  });
});
