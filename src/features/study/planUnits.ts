import { hebrewDaf } from "./shas";
import type { Card, StudyPlan } from "./types";

/**
 * יחידות לימוד של תוכנית ש"ס — עמודים או דפים אמיתיים של המסכת, לפי אינדקס הש"ס המקומי.
 * כך התוכנית יודעת "הבאה לסימון: יומא ל"ג ע"ב", פותחת את הדף בדפוס המדויק ומתרגלת את שאלותיו.
 */

export interface ShasMeta {
  he: string;
  slug: string;
  seder_he: string;
  daf_count: number;
  dafim: { n: number; amudim: ("a" | "b")[] }[];
}

export interface PlanUnit {
  daf: number;
  amud: "1" | "2" | null; // null = דף שלם
  key: string; // "33b" — מפתח העמוד באתר (בדף שלם: עמוד א')
  label: string; // "יומא ל"ג ע"ב"
}

let indexPromise: Promise<ShasMeta[]> | null = null;
export function loadShasIndex(): Promise<ShasMeta[]> {
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}shas/index.json`)
    .then((r) => r.json())
    .then((d: { masechtot: ShasMeta[] }) => d.masechtot)
    .catch(() => { indexPromise = null; return []; });
  return indexPromise;
}

const dafLabel = (n: number) => `${hebrewDaf(n)}'`;

export function unitsOf(meta: ShasMeta, unit: "amud" | "daf"): PlanUnit[] {
  const out: PlanUnit[] = [];
  for (const d of meta.dafim) {
    if (unit === "daf") {
      out.push({ daf: d.n, amud: null, key: `${d.n}a`, label: `${meta.he} ${dafLabel(d.n)}` });
    } else {
      for (const a of d.amudim) {
        out.push({ daf: d.n, amud: a === "a" ? "1" : "2", key: `${d.n}${a}`, label: `${meta.he} ${dafLabel(d.n)} ${a === "a" ? 'ע"א' : 'ע"ב'}` });
      }
    }
  }
  return out;
}

/** היחידות של התוכנית עצמה (מנקודת ההתחלה שנבחרה). */
export function planUnits(plan: StudyPlan, index: ShasMeta[]): PlanUnit[] | null {
  if (!plan.shas) return null;
  const meta = index.find((m) => m.he === plan.shas!.masechta);
  if (!meta) return null;
  return unitsOf(meta, plan.shas.unit).slice(plan.shas.startIndex ?? 0);
}

/** קישורים: הדף בדפוס המדויק, ותרגול השאלות של היחידה. */
export const dafLink = (plan: StudyPlan, u: PlanUnit) => `/shas?m=${plan.shas!.slug}&a=${u.key}&v=daf`;
export const practiceLink = (masechta: string, u: PlanUnit) =>
  `/study?m=${encodeURIComponent(masechta)}&daf=${u.daf}${u.amud ? `&amud=${u.amud}` : ""}`;

export type Retention = "none" | "new" | "due" | "ok";

/**
 * "שמירת חומר": מצב השאלות של כל יחידה שנלמדה — אין שאלות / לא תורגלו / יש שאלות שהגיע זמנן / שמור.
 * שאלה בלי תיוג עמוד שייכת לשני העמודים.
 */
export function retentionOf(units: PlanUnit[], cards: Card[], now = Date.now()): Retention[] {
  const by = new Map<string, Card[]>();
  for (const c of cards) {
    const n = parseInt(c.daf ?? "", 10);
    if (!Number.isFinite(n)) continue;
    for (const a of c.amud ? [c.amud] : ["1", "2"]) {
      const k = `${n}|${a}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(c);
    }
  }
  return units.map((u) => {
    const list = u.amud ? by.get(`${u.daf}|${u.amud}`) ?? [] : [...new Set([...(by.get(`${u.daf}|1`) ?? []), ...(by.get(`${u.daf}|2`) ?? [])])];
    if (!list.length) return "none";
    const reviewed = list.filter((c) => c.srs.lastReviewedAt != null);
    if (!reviewed.length) return "new";
    return reviewed.some((c) => c.srs.dueAt <= now) ? "due" : "ok";
  });
}
