import type { PrintLayout } from "./PrintDaf";

/**
 * הלב של החיפוש בכל הש"ס בצורת הדף — בלי React ובלי רשת, כדי שאפשר יהיה לבדוק אותו במבחנים
 * מול כל קובצי הנתונים (src/test/tzuratSearch*.test.ts). הרכיב PrintSearch.tsx רק טוען ומציג.
 *
 * normHe חייב להיות זהה ל-norm_search ב-hb_pdf.py (צינור הבנייה), שמנרמל מראש את קובצי החיפוש.
 */

export type Stream = "gemara" | "rashi" | "tosafot";
export const STREAMS: Stream[] = ["gemara", "rashi", "tosafot"];

export interface Seq { file: string; amud: string; s: Stream; norm: string; starts: number[]; lines: string[] }
export interface PrintHit { slug: string; he: string; amud: string; s: Stream; line: string; n: number }
export interface Meta { slug: string; he: string }

export const normHe = (t: string) =>
  t.replace(/[֑-ׇ]/g, "").replace(/["'״׳.,:;!?()[\]{}־-]/g, "").replace(/\s+/g, " ").trim();
export const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// קובץ החיפוש (tzurat/print/search/<מסכת>.json.gz, נוצר בצינור): לכל עמוד וזרם — [השורות, השורות
// מנורמלות כמו normHe], כך שהדפדפן לא טוען גאומטריה ולא מנרמל מאות אלפי שורות
export type SearchFile = Record<string, Partial<Record<Stream, [string, string]>>>;

export function fromSearchFile(f: string, d: SearchFile, out: Seq[]) {
  for (const [amud, per] of Object.entries(d)) {
    for (const s of STREAMS) {
      const pair = per[s];
      if (!pair) continue;
      const lines = pair[0].split("\n");
      const norm = pair[1].replace(/\n/g, " ") + " ";
      const starts = [0];
      for (let i = pair[1].indexOf("\n"); i >= 0; i = pair[1].indexOf("\n", i + 1)) starts.push(i + 1);
      out.push({ file: f, amud, s, norm, starts, lines });
    }
  }
}

export function fromLayouts(f: string, d: Record<string, PrintLayout>, out: Seq[]) {
  for (const [amud, lay] of Object.entries(d)) {
    for (const s of STREAMS) {
      const lines = lay.slabs.filter((sl) => sl.s === s).flatMap((sl) => (sl.lines ?? []).map((l) => strip(l.t)));
      if (!lines.length) continue;
      const starts: number[] = [];
      let norm = "";
      for (const l of lines) { starts.push(norm.length); norm += normHe(l) + " "; }
      out.push({ file: f, amud, s, norm, starts, lines });
    }
  }
}

export const MAX_SHOWN = 200;

/**
 * חיפוש מחרוזת מנורמלת בכל הרצפים. מחזיר עד MAX_SHOWN תוצאות (לפי סדר המסכתות והעמודים) ואת הספירה המלאה.
 * null כשהשאילתה קצרה מדי (פחות משני תווים אחרי נרמול).
 */
export function searchSeqs(seqs: Seq[], q: string, only: Stream | "all", metaOf: Map<string, Meta>):
  { hits: PrintHit[]; total: number } | null {
  const nq = normHe(q);
  if (nq.length < 2) return null;
  const hits: PrintHit[] = [];
  let n = 0;
  for (const sq of seqs) {
    if (only !== "all" && sq.s !== only) continue;
    let i = sq.norm.indexOf(nq);
    while (i >= 0) {
      n++;
      if (hits.length < MAX_SHOWN) {
        let li = 0;
        while (li + 1 < sq.starts.length && sq.starts[li + 1] <= i) li++;
        const m = metaOf.get(sq.file);
        hits.push({ slug: m?.slug ?? sq.file, he: m?.he ?? sq.file, amud: sq.amud, s: sq.s, line: sq.lines[li], n });
      }
      i = sq.norm.indexOf(nq, i + nq.length);
    }
  }
  return { hits, total: n };
}
