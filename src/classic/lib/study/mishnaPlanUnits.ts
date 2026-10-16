import { MISHNAYOT_DATA } from "./mishnayotData";
import type { MishnaUnit } from "./types";

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];

export function toGematriaSimple(n: number): string {
  if (n <= 0) return "";
  let s = "";
  if (n >= 100) { s += "ק"; n -= 100; }
  if (n === 15) return s + "טו";
  if (n === 16) return s + "טז";
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (t > 0) s += TENS[t];
  if (o > 0) s += ONES[o];
  return s;
}

export interface MishnaOption {
  seder: string;
  masechet: string;
  chapters: number[]; // per-perek count of mishnayot
  totalMishnayot: number;
}

export const MISHNA_OPTIONS: MishnaOption[] = MISHNAYOT_DATA.flatMap((s) =>
  s.masechtot.map((m) => ({
    seder: s.name,
    masechet: m.name,
    chapters: m.chapters,
    totalMishnayot: m.chapters.reduce((a, b) => a + b, 0),
  })),
);

export function countUnitsForMasechet(masechet: string, unit: MishnaUnit): number {
  const o = MISHNA_OPTIONS.find((x) => x.masechet === masechet);
  if (!o) return 0;
  return unit === "perek" ? o.chapters.length : o.totalMishnayot;
}

/**
 * Generates a flat ordered list of unit strings for the selected masechtot.
 * - perek: "מסכת · פרק א"
 * - mishna: "מסכת · פרק א · משנה א"
 *
 * Uses " · " as the separator (matches PATH_SEP from shasGen).
 */
export function generateMishnayotUnitsFlat(masechtot: string[], unit: MishnaUnit): string[] {
  const SEP = " · ";
  const result: string[] = [];
  // keep canonical order according to MISHNAYOT_DATA
  const ordered = MISHNA_OPTIONS.filter((o) => masechtot.includes(o.masechet));
  for (const o of ordered) {
    for (let p = 0; p < o.chapters.length; p += 1) {
      const perekLabel = `פרק ${toGematriaSimple(p + 1)}`;
      if (unit === "perek") {
        result.push(`${o.masechet}${SEP}${perekLabel}`);
      } else {
        const count = o.chapters[p];
        for (let m = 1; m <= count; m += 1) {
          result.push(`${o.masechet}${SEP}${perekLabel}${SEP}משנה ${toGematriaSimple(m)}`);
        }
      }
    }
  }
  return result;
}
