// טעינת נתוני הגמרא מהקבצים המקומיים (עובד גם בלי רשת): רשימת המסכתות, הטקסט והמפרשים של מסכת,
// והדפוס המדויק (צורת הדף). כל קובץ נטען פעם אחת ונשמר בזיכרון — מעבר בין עמודים באותה מסכת מיידי.
// משותף למסך הש"ס ולתצוגת הגמרא מתחת לשאלות (בשתי הפריסות).
import { fetchGzJson } from "../../lib/gzJson";
import type { PrintLayout } from "./PrintDaf";

export interface ShasCommentary {
  key: string;
  he: string;
  en: string;
  segments: string[];
}
export interface ShasAmud {
  id: string;
  masechet: string;
  daf: string;
  amud: string;
  gemara: string[];
  commentaries: ShasCommentary[];
}
export interface MasechetMeta {
  he: string;
  en: string;
  slug: string;
  seder_he: string;
  daf_count: number;
}
export interface ShasIndex {
  masechtot: MasechetMeta[];
}

const base = () => import.meta.env.BASE_URL;

let indexPromise: Promise<ShasIndex> | null = null;
export function loadShasIndex(): Promise<ShasIndex> {
  indexPromise ??= fetch(`${base()}shas/index.json`)
    .then((r) => r.json() as Promise<ShasIndex>)
    .catch((e) => {
      indexPromise = null;
      throw e;
    });
  return indexPromise;
}

const masechetCache = new Map<string, Promise<Record<string, ShasAmud>>>();
export function loadMasechet(slug: string): Promise<Record<string, ShasAmud>> {
  let p = masechetCache.get(slug);
  if (!p) {
    p = fetchGzJson<{ amudim: Record<string, ShasAmud> }>(`${base()}shas/${slug}.json.gz`)
      .then((d) => d.amudim)
      .catch(() => {
        masechetCache.delete(slug);
        throw new Error(`טעינת ${slug} נכשלה`);
      });
    masechetCache.set(slug, p);
  }
  return p;
}

let printIndex: Promise<Set<string>> | null = null;
/** מסכתות שיש להן דפוס מדויק (הרשימה נכתבת ע"י scripts/daf-pipeline/hb_pdf.py). */
export function loadPrintIndex(): Promise<Set<string>> {
  printIndex ??= fetch(`${base()}tzurat/print/index.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((l: string[]) => new Set(l))
    .catch(() => new Set<string>());
  return printIndex;
}

const printCache = new Map<string, Promise<Record<string, PrintLayout> | null>>();
/** הדפוס המדויק של מסכת (או null אם אין לה). */
export function loadPrintLayouts(slug: string): Promise<Record<string, PrintLayout> | null> {
  const file = slug.toLowerCase();
  let p = printCache.get(file);
  if (!p) {
    p = loadPrintIndex()
      .then((have) => (have.has(file) ? fetchGzJson<Record<string, PrintLayout>>(`${base()}tzurat/print/${file}.json.gz`) : null))
      .catch(() => {
        printCache.delete(file);
        return null;
      });
    printCache.set(file, p);
  }
  return p;
}

/**
 * ציון מקור לדפוס המדויק — נוסח זהה לאתר הגמרא. בנידה מיקום השורות נמדד ממהדורה שהזכויות
 * עליה שמורות; השורה מוצגת מתחת לעמוד עד שתיבנה מסריקת וילנא חופשית.
 */
export const PRINT_CREDIT: Record<string, string> = {
  Niddah: "מיקום השורות בצורת הדף של מסכת נידה נמדד ממהדורת נהרדעא החדשה של הוצאת ח. וגשל. כל הזכויות על המהדורה שמורות להוצאה.",
};

const ALIASES: Record<string, string> = { "נדה": "נידה", "נידה": "נדה" };
/** מזהה המסכת בקבצים לפי שמה בעברית ("ברכות" ← "Berakhot"). */
export async function slugForHebrew(he: string): Promise<string | null> {
  const clean = he.replace(/^מסכת\s+/, "").trim();
  const idx = await loadShasIndex();
  const m = idx.masechtot.find((x) => x.he === clean || x.he === ALIASES[clean]);
  return m?.slug ?? null;
}
