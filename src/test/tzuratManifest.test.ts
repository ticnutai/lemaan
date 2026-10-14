// @vitest-environment node
/**
 * תמונת מצב של כל עמודי צורת הדף — המבחן שהיה עוצר את הנסיגה של 5.10 (שורות מודפסות שנמחקו).
 *
 * לכל עמוד נשמרים: מספר המילים בכל זרם (גמרא / רש"י / תוספות, ובגושי טקסט בלי שורות), וטביעת אצבע של העמוד כולו.
 * המבחן נכשל אם:
 *   · עמוד נעלם או נוסף;
 *   · זרם כלשהו איבד 3 מילים או יותר (מחיקת שורות);
 *   · עמוד השתנה בכל דרך שהיא — גם בלי לאבד מילים (סדר שורות, מיקום, כותרת).
 * שינוי מכוון (אחרי שעבר את שער האיכות, gate.py) מאשרים כך:
 *   UPDATE_TZURAT_MANIFEST=1 npx vitest run src/test/tzuratManifest.test.ts
 * ובהודעת השמירה כותבים אילו עמודים השתנו ולמה.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { printIndex, layouts, shasSlug, shasAmudim, streamLines, words, lineText, STREAMS } from "./tzurat/data";

interface PageEntry { g: number; r: number; t: number; x: number; h: string }
interface Manifest { pages: Record<string, Record<string, PageEntry>>; noLayout: string[]; totalPages: number }

const FILE = path.resolve(__dirname, "golden/tzurat-manifest.json");
const KEY = { gemara: "g", rashi: "r", tosafot: "t" } as const;

function build(): Manifest {
  const pages: Manifest["pages"] = {};
  const noLayout: string[] = [];
  let total = 0;
  for (const slug of printIndex()) {
    const lays = layouts(slug);
    pages[slug] = {};
    for (const [amud, lay] of Object.entries(lays)) {
      const e = { g: 0, r: 0, t: 0, x: 0, h: "" } as PageEntry;
      for (const s of STREAMS) e[KEY[s]] = words(streamLines(lay, s));
      e.x = words(lay.slabs.filter((sl) => !sl.lines?.length && sl.text).map((sl) => lineText(sl.text)));
      e.h = crypto.createHash("sha1").update(JSON.stringify(lay)).digest("hex").slice(0, 16);
      pages[slug][amud] = e;
      total++;
    }
    // עמודים שיש להם טקסט גמרא במאגר אבל אין להם פריסת דפוס — מוצגים בפריסה החיה (מכוון: המכונה עצרה אותם)
    for (const [amud, a] of Object.entries(shasAmudim(shasSlug(slug)))) {
      if (a.gemara?.length && !lays[amud]) noLayout.push(`${slug}:${amud}`);
    }
  }
  return { pages, noLayout, totalPages: total };
}

const current = build();
if (process.env.UPDATE_TZURAT_MANIFEST) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(current, null, 0) + "\n");
}
const golden: Manifest = JSON.parse(fs.readFileSync(FILE, "utf8"));

describe("תמונת מצב של צורת הדף", () => {
  it("אותן מסכתות", () => {
    expect(Object.keys(current.pages).sort()).toEqual(Object.keys(golden.pages).sort());
  });

  it("אף עמוד לא נעלם ולא נוסף", () => {
    const lost: string[] = [], added: string[] = [];
    for (const slug of Object.keys(golden.pages)) {
      const a = golden.pages[slug] ?? {}, b = current.pages[slug] ?? {};
      for (const k of Object.keys(a)) if (!b[k]) lost.push(`${slug}:${k}`);
      for (const k of Object.keys(b)) if (!a[k]) added.push(`${slug}:${k}`);
    }
    expect({ lost, added }).toEqual({ lost: [], added: [] });
    expect(current.totalPages).toBe(golden.totalPages);
  });

  it("אף זרם לא איבד 3 מילים או יותר (מחיקת שורות מודפסות)", () => {
    const losses: string[] = [];
    for (const [slug, pages] of Object.entries(golden.pages)) {
      for (const [amud, e] of Object.entries(pages)) {
        const c = current.pages[slug]?.[amud];
        if (!c) continue;
        for (const k of ["g", "r", "t", "x"] as const) {
          if (c[k] <= e[k] - 3) losses.push(`${slug}:${amud}:${k} ${e[k]}→${c[k]}`);
        }
      }
    }
    expect(losses).toEqual([]);
  });

  it("אף עמוד לא השתנה בלי אישור (טביעת אצבע)", () => {
    const changed: string[] = [];
    for (const [slug, pages] of Object.entries(golden.pages)) {
      for (const [amud, e] of Object.entries(pages)) {
        const c = current.pages[slug]?.[amud];
        if (c && c.h !== e.h) changed.push(`${slug}:${amud} (גמרא ${e.g}→${c.g}, רש"י ${e.r}→${c.r}, תוספות ${e.t}→${c.t})`);
      }
    }
    expect(changed, "שינוי מכוון? הרץ עם UPDATE_TZURAT_MANIFEST=1 אחרי שעבר את gate.py").toEqual([]);
  });

  it("רשימת העמודים בלי פריסת דפוס לא גדלה", () => {
    const grown = current.noLayout.filter((k) => !golden.noLayout.includes(k));
    expect(grown).toEqual([]);
    expect(current.noLayout.length).toBeLessThanOrEqual(golden.noLayout.length);
  });
});
