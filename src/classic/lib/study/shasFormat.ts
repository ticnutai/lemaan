// Hebrew formatting helpers for Shas units
import type { ShasPlan } from "./types";
import { SHAS_BAVLI } from "./shasData";

export function toHebrewNum(n: number): string {
  if (n <= 0) return "";
  const map: [number, string][] = [
    [400, "ת"], [300, "ש"], [200, "ר"], [100, "ק"],
    [90, "צ"], [80, "פ"], [70, "ע"], [60, "ס"], [50, "נ"], [40, "מ"], [30, "ל"], [20, "כ"], [10, "י"],
    [9, "ט"], [8, "ח"], [7, "ז"], [6, "ו"], [5, "ה"], [4, "ד"], [3, "ג"], [2, "ב"], [1, "א"],
  ];
  let result = "";
  let remaining = n;
  for (const [val, ch] of map) {
    while (remaining >= val) {
      result += ch;
      remaining -= val;
    }
  }
  // 15→טו, 16→טז (גם בתוך מספרים גדולים יותר)
  return result.replace(/יה/g, "טו").replace(/יו/g, "טז");
}

export const amudLetter = (amud: 1 | 2) => (amud === 1 ? "א'" : "ב'");

const SHAS_PREFIX_RE = /^(?:ש["״']?ס\s*בבלי|תלמוד\s*בבלי)\s*[—-]\s*/;
const SHAS_LONG_RE = /^(?:מסכת\s+)?(.+?)\s+דף\s*([א-ת]+)['׳]?\s+עמ(?:וד)?\s*([אב])['׳]?/;
const SHAS_SHORT_RE = /^(?:מסכת\s+)?(.+?)\s+([א-ת]+)['׳]?\s+ע["״]?([אב])/;
const SHAS_SPLIT_RE = /[—–\-:|]/;

const normalizeMasechta = (name: string) =>
  name
    .replace(/^(?:מסכת\s+)/, "")
    .replace(/\s+/g, " ")
    .trim();

export function abbreviateMasechtaName(name: string, max = 4): string {
  const trimmed = normalizeMasechta(name);
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(2, max - 1))}'`;
}

function buildCompactShasLabel(masechtaRaw: string, dafRaw: string, amudRaw: string) {
  const masechta = abbreviateMasechtaName(masechtaRaw);
  const daf = dafRaw.replace(/["'׳]+$/g, "");
  const amud = amudRaw === "א" ? "א'" : "ב'";
  return `מס' ${masechta} דף ${daf}' עמ' ${amud}`;
}

function extractCompactShasLabel(candidate: string): string | null {
  const cleaned = candidate.trim();
  if (!cleaned) return null;

  const long = cleaned.match(SHAS_LONG_RE);
  if (long) {
    return buildCompactShasLabel(long[1], long[2], long[3]);
  }

  const short = cleaned.match(SHAS_SHORT_RE);
  if (short) {
    return buildCompactShasLabel(short[1], short[2], short[3]);
  }

  return null;
}

export function compactShasCalendarLabel(raw: string): string | null {
  const cleaned = raw.trim().replace(SHAS_PREFIX_RE, "").trim();
  const direct = extractCompactShasLabel(cleaned);
  if (direct) return direct;

  const parts = cleaned
    .split(SHAS_SPLIT_RE)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const parsed = extractCompactShasLabel(part);
    if (parsed) return parsed;
  }

  return null;
}

// תיאור מלא של היחידה הנוכחית: "יומא דף ב' עמוד א'" / "יומא דף ב' עמוד א' (חצי ראשון)"
export function formatShasPosition(
  masechta: string,
  daf: number,
  amud: 1 | 2,
  half: 1 | 2 | null,
): string {
  const base = `${masechta} דף ${toHebrewNum(daf)}' עמוד ${amudLetter(amud)}`;
  if (half == null) return base;
  return `${base} (${half === 1 ? "חצי ראשון" : "חצי שני"})`;
}

// תיאור היחידה כיחידת לימוד
export function unitLabel(unit: "daf" | "amud" | "half"): string {
  if (unit === "daf") return "דף שלם";
  if (unit === "amud") return "עמוד";
  return "חצי עמוד";
}

export function unitRhythmHint(unit: "daf" | "amud" | "half"): string {
  if (unit === "daf") return "דף יומי – דף שלם בכל יום";
  if (unit === "amud") return "עמוד ביום – דף שלם כל יומיים";
  return "חצי עמוד ביום – דף שלם כל ארבעה ימים";
}

// כמה "יחידות" יש בדף שלם (לפי בחירת המשתמש)
export const unitsPerDaf = (unit: "daf" | "amud" | "half") =>
  unit === "daf" ? 1 : unit === "amud" ? 2 : 4;

// סך-כל היחידות במסכת (דף מתחיל מ-2)
export function totalUnitsInMasechta(pages: number, unit: "daf" | "amud" | "half") {
  return (pages - 1) * unitsPerDaf(unit);
}

// ספירת היחידות שהושלמו ברשומות completed
export function countCompletedUnits(
  completed: { daf: number; amud?: 1 | 2; half?: 1 | 2 }[],
  unit: "daf" | "amud" | "half",
) {
  if (unit === "daf") return completed.length;
  // כל רשומה ב-completed היא יחידה אחת (עמוד או חצי-עמוד)
  return completed.length;
}

/**
 * מחשב היכן המשתמש אמור להיות היום לפי עוגן התאריך.
 * מחזיר { masechta, daf, amud } או null אם אין עוגן / מידע חסר.
 */
export function computeExpectedShasPosition(
  plan: ShasPlan,
  todayStr: string, // YYYY-MM-DD
): { masechta: string; daf: number; amud: 1 | 2 } | null {
  if (!plan.anchorDate || !plan.anchorPosition) return null;

  const anchor = plan.anchorPosition;
  const anchorMs = new Date(plan.anchorDate).getTime();
  const todayMs = new Date(todayStr).getTime();
  if (isNaN(anchorMs) || isNaN(todayMs)) return null;

  // ימים שחלפו (כולל יום העוגן)
  const daysPassed = Math.max(0, Math.floor((todayMs - anchorMs) / 86_400_000));

  // יחידות שעברו מאז העוגן
  const unitsElapsed = Math.floor(daysPassed * plan.pagesPerDay);

  // הפוך את העוגן לאינדקס כלל-תוכני
  const ordered = SHAS_BAVLI.filter((m) => plan.selectedMasechtos.includes(m.name));
  const upf = unitsPerDaf(plan.unit);

  // מצא את האינדקס של מסכת העוגן ברצף המסכתות
  let globalUnit = 0;
  let foundAnchor = false;
  for (const m of ordered) {
    if (m.name === anchor.masechta) {
      // daf מתחיל מ-2, כל דף = upf יחידות
      const dafIndex = anchor.daf - 2; // 0-based
      const amudIndex = anchor.amud - 1; // 0 or 1
      if (plan.unit === "daf") {
        globalUnit += dafIndex;
      } else if (plan.unit === "amud") {
        globalUnit += dafIndex * 2 + amudIndex;
      } else {
        // half: each amud = 2 halves
        globalUnit += dafIndex * 4 + amudIndex * 2;
        // we start at half 1 — don't add half offset here since anchor is amud-level
      }
      foundAnchor = true;
      break;
    }
    globalUnit += totalUnitsInMasechta(m.pages, plan.unit);
  }
  if (!foundAnchor) return null;

  // הוסף את היחידות שעברו
  const targetUnit = globalUnit + unitsElapsed;

  // המר חזרה למסכת + דף + עמוד
  let remaining = targetUnit;
  for (const m of ordered) {
    const total = totalUnitsInMasechta(m.pages, plan.unit);
    if (remaining < total) {
      // מצאנו את המסכת
      if (plan.unit === "daf") {
        const daf = 2 + remaining;
        return { masechta: m.name, daf: Math.min(daf, m.pages), amud: 1 };
      } else if (plan.unit === "amud") {
        const daf = 2 + Math.floor(remaining / 2);
        const amud = (remaining % 2) + 1 as 1 | 2;
        return { masechta: m.name, daf: Math.min(daf, m.pages), amud };
      } else {
        // half
        const daf = 2 + Math.floor(remaining / 4);
        const amud = (Math.floor(remaining / 2) % 2) + 1 as 1 | 2;
        return { masechta: m.name, daf: Math.min(daf, m.pages), amud };
      }
    }
    remaining -= total;
  }

  // עברנו את כל המסכתות — מחזירים את הסוף
  const lastM = ordered[ordered.length - 1];
  if (!lastM) return null;
  return { masechta: lastM.name, daf: lastM.pages, amud: 2 };
}

/**
 * מייצר רשימת יחידות שטוחה עבור ש"ס (לשימוש ב-GeneralStudyPlan).
 * למשל עבור unit="amud": ["יומא ב' ע\"א", "יומא ב' ע\"ב", ...]
 */
export function generateShasUnitsFlat(masechtos: string[], unit: "daf" | "amud" | "half"): string[] {
  const units: string[] = [];
  const ordered = SHAS_BAVLI.filter((m) => masechtos.includes(m.name));
  for (const masechta of ordered) {
    for (let daf = 2; daf <= masechta.pages; daf++) {
      const dafHeb = toHebrewNum(daf) + "'";
      if (unit === "daf") {
        units.push(`${masechta.name} ${dafHeb}`);
      } else if (unit === "amud") {
        units.push(`${masechta.name} ${dafHeb} ע"א`);
        units.push(`${masechta.name} ${dafHeb} ע"ב`);
      } else {
        // half
        units.push(`${masechta.name} ${dafHeb} ע"א א'`);
        units.push(`${masechta.name} ${dafHeb} ע"א ב'`);
        units.push(`${masechta.name} ${dafHeb} ע"ב א'`);
        units.push(`${masechta.name} ${dafHeb} ע"ב ב'`);
      }
    }
  }
  return units;
}
