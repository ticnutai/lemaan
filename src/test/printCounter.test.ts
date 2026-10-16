// @vitest-environment node
/**
 * מונה המופעים בדף הדפוס שווה למספר ההדגשות שעל המסך: מרנדרים את PrintDaf עם השאילתה, וסופרים את
 * <mark class="daf-hit"> בפלט. שאילתות של מילה אחת בלבד — מופע שעובר משורה לשורה מוצג בשתי הדגשות ונספר פעם אחת.
 * (קודם מילת הפתיחה שבמסגרת המעוטרת ומילות הקישור הודגשו ולא נספרו — ברכות ב. "מאימתי": 5 מול 4; נמצא באתר למען)
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PrintDaf from "../features/daf/PrintDaf";
import { DEFAULT_DAF_STYLE } from "../features/daf/dafStyle";
import { countHits } from "../features/daf/buildHtml";
import { printHitCount } from "../features/daf/printHighlight";
import { layouts } from "./tzurat/data";

const marks = (slug: string, amud: string, q: string) => {
  const html = renderToStaticMarkup(createElement(PrintDaf, { layout: layouts(slug)[amud], width: 900, style: DEFAULT_DAF_STYLE, query: q }));
  return (html.match(/<mark class="daf-hit">/g) ?? []).length;
};
const counter = (slug: string, amud: string, q: string) => {
  const lay = layouts(slug)[amud];
  const texts = lay.slabs.filter((sl) => !sl.lines?.length && sl.s !== "gemara" && sl.text).map((sl) => sl.text!);
  return printHitCount(lay, q) + countHits(q, texts);
};

describe("מונה המופעים בדף הדפוס", () => {
  it("ברכות ב. \"מאימתי\" — כולל מילת הפתיחה שבמסגרת", () => {
    expect(marks("berakhot", "2a", "מאימתי")).toBe(5);
    expect(counter("berakhot", "2a", "מאימתי")).toBe(5);
  });

  it("המונה שווה למספר ההדגשות — עמודים ומילים לדוגמה, כולל מילות קישור", () => {
    const cases: [string, string, string][] = [
      ["berakhot", "2a", "קורין"], ["berakhot", "2b", "אמר"], ["shabbat", "2a", "יציאות"], ["megillah", "2a", "מגילה"],
      ["bava_metzia", "2a", "שנים"], ["sanhedrin", "2a", "ממונות"], ["chullin", "2a", "הכל"], ["yoma", "62b", "שעירי"],
    ];
    for (const [s, k, q] of cases) {
      if (!layouts(s)[k]) continue;
      expect(`${s} ${k} ${q}: ${counter(s, k, q)}`).toBe(`${s} ${k} ${q}: ${marks(s, k, q)}`);
    }
  });
});
