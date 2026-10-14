// עזר משותף למבחני הנתונים של צורת הדף: קריאת קבצי public ישירות מהדיסק (בלי רשת, בלי דפדפן).
// כל הקבצים נטענים פעם אחת לכל תהליך מבחן ונשמרים בזיכרון.
import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { PrintLayout } from "../../features/daf/PrintDaf";

export const PUBLIC = path.resolve(__dirname, "../../../public");
export const STREAMS = ["gemara", "rashi", "tosafot"] as const;
export type Stream = (typeof STREAMS)[number];

export function readJson<T = unknown>(rel: string): T {
  const buf = fs.readFileSync(path.join(PUBLIC, rel));
  const text = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  return JSON.parse(text) as T;
}

/** רשימת המסכתות עם דפוס מדויק (שמות קבצים באותיות קטנות) */
export const printIndex = (): string[] => readJson<string[]>("tzurat/print/index.json");

const layoutCache = new Map<string, Record<string, PrintLayout>>();
export function layouts(slug: string): Record<string, PrintLayout> {
  if (!layoutCache.has(slug)) layoutCache.set(slug, readJson(`tzurat/print/${slug}.json.gz`));
  return layoutCache.get(slug)!;
}

export type SearchFile = Record<string, Partial<Record<Stream, [string, string]>>>;
export const searchFile = (slug: string): SearchFile => readJson(`tzurat/print/search/${slug}.json.gz`);

interface ShasIndex { masechtot: { slug: string; he: string }[] }
export const shasIndex = (): ShasIndex => readJson("shas/index.json");

/** שם הקובץ במאגר הטקסט (Bava_Batra) לפי שם קובץ הפריסה (bava_batra) */
export function shasSlug(printSlug: string): string {
  const m = shasIndex().masechtot.find((x) => x.slug.toLowerCase() === printSlug);
  if (!m) throw new Error(`no shas entry for ${printSlug}`);
  return m.slug;
}

interface ShasAmud { gemara?: string[] }
const shasCache = new Map<string, Record<string, ShasAmud>>();
export function shasAmudim(slug: string): Record<string, ShasAmud> {
  if (!shasCache.has(slug)) {
    const d = readJson<{ amudim: Record<string, ShasAmud> }>(`shas/${slug}.json.gz`);
    shasCache.set(slug, d.amudim);
  }
  return shasCache.get(slug)!;
}

const TAGS = /<[^>]+>/g;
/** טקסט שורה כפי שהוא מוצג: בלי תגיות, רווחים מאוחדים (כמו strip ב-PrintSearch ו-TAGS ב-hb_pdf.write_search) */
export const lineText = (t: string | undefined): string => (t ?? "").replace(TAGS, " ").replace(/\s+/g, " ").trim();

/** השורות של זרם בעמוד, לפי סדר הגושים */
export function streamLines(lay: PrintLayout, s: Stream): string[] {
  return lay.slabs.filter((sl) => sl.s === s).flatMap((sl) => (sl.lines ?? []).map((l) => lineText(l.t)));
}

export const words = (lines: string[]): number => lines.reduce((n, l) => n + (l ? l.split(" ").length : 0), 0);
