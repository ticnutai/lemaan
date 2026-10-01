import { hebrewDaf } from "./shas";

/**
 * נתוני דפוס וילנא ללוח לימוד הש"ס — 38 מסכתות, 2,705 דפים, 5,410 עמודים.
 * אומת מול הלוח במערכת המקורית: זרעים 126, מועד 1,462, נשים 1,210,
 * נזיקין 1,364, קדשים 1,104, טהרות 144 — סה"כ 5,410 עמודים בדיוק.
 */
export interface MasechetInfo {
  name: string;
  seder: string;
  /** הדף הראשון (רוב המסכתות מתחילות בדף ב; תמיד מתחילה בדף כה) */
  startDaf: number;
  /** הדף האחרון בדפוס וילנא */
  endDaf: number;
}

export const SHAS_BOARD: MasechetInfo[] = [
  { name: "ברכות", seder: "זרעים", startDaf: 2, endDaf: 64 },
  { name: "שבת", seder: "מועד", startDaf: 2, endDaf: 157 },
  { name: "עירובין", seder: "מועד", startDaf: 2, endDaf: 105 },
  { name: "פסחים", seder: "מועד", startDaf: 2, endDaf: 121 },
  { name: "שקלים", seder: "מועד", startDaf: 2, endDaf: 22 },
  { name: "יומא", seder: "מועד", startDaf: 2, endDaf: 88 },
  { name: "סוכה", seder: "מועד", startDaf: 2, endDaf: 56 },
  { name: "ביצה", seder: "מועד", startDaf: 2, endDaf: 40 },
  { name: "ראש השנה", seder: "מועד", startDaf: 2, endDaf: 35 },
  { name: "תענית", seder: "מועד", startDaf: 2, endDaf: 31 },
  { name: "מגילה", seder: "מועד", startDaf: 2, endDaf: 32 },
  { name: "מועד קטן", seder: "מועד", startDaf: 2, endDaf: 29 },
  { name: "חגיגה", seder: "מועד", startDaf: 2, endDaf: 27 },
  { name: "יבמות", seder: "נשים", startDaf: 2, endDaf: 122 },
  { name: "כתובות", seder: "נשים", startDaf: 2, endDaf: 112 },
  { name: "נדרים", seder: "נשים", startDaf: 2, endDaf: 91 },
  { name: "נזיר", seder: "נשים", startDaf: 2, endDaf: 66 },
  { name: "סוטה", seder: "נשים", startDaf: 2, endDaf: 49 },
  { name: "גיטין", seder: "נשים", startDaf: 2, endDaf: 90 },
  { name: "קידושין", seder: "נשים", startDaf: 2, endDaf: 82 },
  { name: "בבא קמא", seder: "נזיקין", startDaf: 2, endDaf: 119 },
  { name: "בבא מציעא", seder: "נזיקין", startDaf: 2, endDaf: 119 },
  { name: "בבא בתרא", seder: "נזיקין", startDaf: 2, endDaf: 176 },
  { name: "סנהדרין", seder: "נזיקין", startDaf: 2, endDaf: 113 },
  { name: "מכות", seder: "נזיקין", startDaf: 2, endDaf: 24 },
  { name: "שבועות", seder: "נזיקין", startDaf: 2, endDaf: 49 },
  { name: "עבודה זרה", seder: "נזיקין", startDaf: 2, endDaf: 76 },
  { name: "הוריות", seder: "נזיקין", startDaf: 2, endDaf: 14 },
  { name: "זבחים", seder: "קדשים", startDaf: 2, endDaf: 120 },
  { name: "מנחות", seder: "קדשים", startDaf: 2, endDaf: 110 },
  { name: "חולין", seder: "קדשים", startDaf: 2, endDaf: 142 },
  { name: "בכורות", seder: "קדשים", startDaf: 2, endDaf: 61 },
  { name: "ערכין", seder: "קדשים", startDaf: 2, endDaf: 34 },
  { name: "תמורה", seder: "קדשים", startDaf: 2, endDaf: 34 },
  { name: "כריתות", seder: "קדשים", startDaf: 2, endDaf: 28 },
  { name: "מעילה", seder: "קדשים", startDaf: 2, endDaf: 22 },
  { name: "תמיד", seder: "קדשים", startDaf: 25, endDaf: 33 },
  { name: "נדה", seder: "טהרות", startDaf: 2, endDaf: 73 },
];

export const BOARD_SEDARIM = ["זרעים", "מועד", "נשים", "נזיקין", "קדשים", "טהרות"];

export const dapimOf = (m: MasechetInfo) => m.endDaf - m.startDaf + 1;
export const amudimOf = (m: MasechetInfo) => dapimOf(m) * 2;

/** סה"כ עמודים בש"ס — חייב להיות 5,410 כמו במקור. */
export const TOTAL_AMUDIM = SHAS_BOARD.reduce((s, m) => s + amudimOf(m), 0);

export const amudKey = (masechta: string, daf: number, amud: "1" | "2") => `${masechta}|${daf}|${amud}`;

/** "ב." לעמוד א, "ב:" לעמוד ב. */
export const amudChipLabel = (daf: number, amud: "1" | "2") => `${hebrewDaf(daf)}${amud === "1" ? "." : ":"}`;

export interface ShasAmud {
  key: string; // masechta|daf|amud
  masechta: string;
  daf: number;
  amud: "1" | "2";
  reps: number;
  firstAt: number;
  lastAt: number;
}

export interface ShasLogRow {
  id?: number;
  at: number;
  delta: number; // עמודים שסומנו (חיובי) או בוטלו (שלילי)
}
