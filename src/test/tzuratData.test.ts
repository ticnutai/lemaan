// @vitest-environment node
/**
 * תקינות הנתונים של צורת הדף (בלי רשת, בלי דפדפן):
 *   · רשימות המסכתות (index.json, sources.json) תואמות לקבצים שבתיקייה ולטבלת המסכתות של האתר;
 *   · כל קובץ חיפוש זהה בדיוק למה שנגזר מקובץ הפריסה שלו (קובץ חיפוש שלא נבנה מחדש אחרי שינוי — נתפס);
 *   · הנרמול בדפדפן (normHe) נותן בדיוק את מה שהצינור כתב בקובץ החיפוש;
 *   · כל עמוד בפריסה הוא עמוד אמיתי במאגר, ונפתח במסך הש"ס (/shas?m=<מסכת>&a=<עמוד>);
 *   · עין משפט: הסכומים לכל מסכת תואמים לרשימה.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { PUBLIC, readJson, printIndex, layouts, searchFile, shasSlug, shasAmudim, shasIndex, lineText, STREAMS } from "./tzurat/data";
import { normHe, fromSearchFile, fromLayouts, type Seq } from "../features/daf/printSearchCore";

const slugs = printIndex();

describe("רשימות המסכתות", () => {
  it("index.json ממוין, בלי כפילויות, ותואם בדיוק לקובצי הפריסה ולקובצי החיפוש", () => {
    const dir = (rel: string) => fs.readdirSync(path.join(PUBLIC, rel)).filter((f) => f.endsWith(".json.gz")).map((f) => f.slice(0, -8)).sort();
    expect(slugs).toEqual([...new Set(slugs)].sort());
    expect(dir("tzurat/print")).toEqual(slugs);
    expect(dir("tzurat/print/search")).toEqual(slugs);
    expect(slugs.length).toBe(36);
  });

  it("sources.json כולל כל מסכת ברשימה (ושקלים, שאין לה פריסה)", () => {
    const sources = Object.keys(readJson<Record<string, unknown>>("tzurat/print/sources.json")).sort();
    expect(slugs.filter((s) => !sources.includes(s))).toEqual([]);
    expect(sources.filter((s) => !slugs.includes(s))).toEqual(["shekalim"]);
  });

  it("כל מסכת מופיעה ברשימת הש\"ס של האתר", () => {
    const known = new Set(shasIndex().masechtot.map((m) => m.slug.toLowerCase()));
    expect(slugs.filter((s) => !known.has(s))).toEqual([]);
  });
});

describe("כל עמוד בפריסה הוא עמוד אמיתי, ונפתח במסך הש\"ס", () => {
  it.each(slugs)("%s", (slug) => {
    // מסך הש"ס פותח עמוד לפי ?m=<שם המסכת במאגר>&a=<עמוד>, והפריסה נמצאת לפי אותו עמוד
    const amudim = shasAmudim(shasSlug(slug));
    const bad: string[] = [];
    for (const amud of Object.keys(layouts(slug))) {
      if (!amudim[amud]) bad.push(`${amud}: not in shas`);
      if (!/^\d+[ab]$/.test(amud)) bad.push(`${amud}: bad amud key`);
    }
    expect(bad).toEqual([]);
  });
});

describe("קובצי החיפוש תואמים בדיוק לקובצי הפריסה", () => {
  it.each(slugs)("%s", (slug) => {
    const lays = layouts(slug), sf = searchFile(slug);
    expect(Object.keys(sf)).toEqual(Object.keys(lays));
    const diff: string[] = [];
    for (const [amud, lay] of Object.entries(lays)) {
      for (const s of STREAMS) {
        // בדיוק כמו hb_pdf.write_search: שורות של כל הגושים של הזרם; זרם בלי שורות — בלי רשומה
        const lines = lay.slabs.filter((sl) => sl.s === s).flatMap((sl) => (sl.lines ?? []).map((l) => lineText(l.t)));
        const want = lines.length ? [lines.join("\n"), lines.map(normHe).join("\n")] : undefined;
        if (JSON.stringify(sf[amud]?.[s]) !== JSON.stringify(want)) diff.push(`${amud}:${s}`);
      }
    }
    expect(diff).toEqual([]);
  });

  it("הרכיב בונה מקובץ החיפוש בדיוק את מה שהיה בונה מקובץ הפריסה", () => {
    for (const slug of slugs) {
      const a: Seq[] = [], b: Seq[] = [];
      fromSearchFile(slug, searchFile(slug), a);
      fromLayouts(slug, layouts(slug), b);
      expect(a.length).toBe(b.length);
      a.forEach((x, i) => expect(x, `${slug}:${x.amud}:${x.s}`).toEqual(b[i]));
    }
  }, 60_000);
});

describe("normHe — חוזה הנרמול (זהה ל-norm_search ב-hb_pdf.py)", () => {
  it.each([
    ["בְּרֵאשִׁית", "בראשית"],
    ["מתני'", "מתני"],
    ["מתני׳", "מתני"],
    ['ת"ר', "תר"],
    ["ת״ר", "תר"],
    ["(דף כב:) השוה", "דף כב השוה"],
    ["  אמר   רבא. ", "אמר רבא"],
    ["בית־הלל", "ביתהלל"],
    ["[הוספה]", "הוספה"],
  ])("%s ← %s", (input, want) => {
    expect(normHe(input)).toBe(want);
  });
});

describe("עין משפט", () => {
  it("הסכום בכל קובץ תואם לרשימה, וכל עמוד הוא עמוד אמיתי", () => {
    const idx = readJson<{ rows: number; tractates: Record<string, number> }>("ein-mishpat/index.json");
    const files = fs.readdirSync(path.join(PUBLIC, "ein-mishpat")).filter((f) => f.endsWith(".json.gz")).map((f) => f.slice(0, -8)).sort();
    expect(files).toEqual(Object.keys(idx.tractates).sort());
    let total = 0;
    const bad: string[] = [];
    for (const slug of files) {
      const d = readJson<Record<string, Record<string, string[]>>>(`ein-mishpat/${slug}.json.gz`);
      const amudim = shasAmudim(slug);
      let n = 0;
      for (const [amud, books] of Object.entries(d)) {
        if (!amudim[amud]) bad.push(`${slug}:${amud}`);
        for (const refs of Object.values(books)) {
          n += refs.length;
          if (new Set(refs).size !== refs.length) bad.push(`${slug}:${amud} duplicate`);
        }
      }
      expect(n, slug).toBe(idx.tractates[slug]);
      total += n;
    }
    expect(bad).toEqual([]);
    expect(total).toBe(53190);
    expect(idx.rows).toBe(53190);
  }, 30_000);
});
