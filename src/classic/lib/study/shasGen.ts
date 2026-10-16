// עזרי יצירה אוטומטית של דפים ועמודים ש"ס.
// שמות הקטגוריות נשמרים עם נתיב מלא ("ברכות · ב." / "ברכות · ב. · ע\"א")
// כדי לשמור על ייחודיות של תגיות `cat:<name>` בין מסכתות שונות.
// בתצוגה ב-UI משתמשים ב-`displayCategoryName` שמחזיר רק את החלק האחרון.

import { SHAS_BAVLI, type Masechta } from "./shasData";

export const PATH_SEP = " · ";

/** מחזיר את החלק האחרון של שם נתיב ("ברכות · ב. · ע\"א" → "ע\"א") */
export function displayCategoryName(fullName: string): string {
  if (!fullName) return fullName;
  const idx = fullName.lastIndexOf(PATH_SEP);
  return idx === -1 ? fullName : fullName.slice(idx + PATH_SEP.length);
}

/** המרה למספר עברי בסגנון גמרא: 2→"ב", 15→"טו", 16→"טז", 115→"קטו". */
export function toGematria(n: number): string {
  if (n <= 0) return String(n);
  const units = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const tens  = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  const hund  = ["", "ק", "ר", "ש", "ת"];
  let out = "";
  let remain = n;
  // מאות מעל 400 — לחזור על ת ק / תת וכו'
  while (remain >= 500) { out += "תק"; remain -= 500; }
  if (remain >= 400)    { out += "ת";  remain -= 400; }
  if (remain >= 100)    { out += hund[Math.floor(remain / 100)]; remain %= 100; }
  // עיוותי ט"ו ט"ז
  if (remain === 15) { out += "טו"; remain = 0; }
  else if (remain === 16) { out += "טז"; remain = 0; }
  else {
    out += tens[Math.floor(remain / 10)];
    out += units[remain % 10];
  }
  return out;
}

/** תווית דף בסגנון גמרא ("ב.", "טו.", "קטז."). */
export function dafLabel(daf: number): string {
  return `${toGematria(daf)}.`;
}

export const AMUD_LABELS = ['ע"א', 'ע"ב'] as const;

/** מציאת מסכת לפי שם (השם החשוף — בלי prefix). */
export function findMasechetByName(name: string): Masechta | undefined {
  return SHAS_BAVLI.find((m) => m.name === name);
}

/** האם השם הזה (אפילו אם הוא מורכב מנתיב) הוא מסכת מהש"ס. בודק רק את החלק האחרון. */
export function isMasechetName(fullName: string): boolean {
  return !!findMasechetByName(displayCategoryName(fullName));
}

/** האם השם הזה הוא דף (תווית כמו "ב." / "קטז."). בודק רק את החלק האחרון. */
export function isDafName(fullName: string): boolean {
  const leaf = displayCategoryName(fullName);
  // דף תמיד מסתיים בנקודה ולפניה אותיות עבריות
  return /^[\u05D0-\u05EA]+\.$/.test(leaf);
}

/** מחזיר רשימת תוויות דפים למסכת — דף ב' עד דף N (כולל). */
export function dafLabelsForMasechet(masechetName: string): string[] {
  const m = findMasechetByName(masechetName);
  if (!m) return [];
  const out: string[] = [];
  // הדף הראשון בכל מסכת הוא ב'
  for (let d = 2; d <= m.pages + 1; d++) out.push(dafLabel(d));
  return out;
}

/**
 * בונה שמות מלאים ייחודיים עבור הדפים של מסכת,
 * כך שכל דף יישמר תחת השם המלא: `<masechet> · <daf>`.
 * הקלט הוא שם הקטגוריה של המסכת (כפי שהיא מאוחסנת — יכול להיות עם prefix).
 */
export function fullDafNamesForMasechet(masechetCategoryName: string): string[] {
  const masechet = displayCategoryName(masechetCategoryName);
  return dafLabelsForMasechet(masechet).map((d) => `${masechetCategoryName}${PATH_SEP}${d}`);
}

/** בונה שמות מלאים לעמודים של דף נתון (`<daf-full> · ע"א` ו-`<daf-full> · ע"ב`). */
export function fullAmudNamesForDaf(dafCategoryName: string): string[] {
  return AMUD_LABELS.map((a) => `${dafCategoryName}${PATH_SEP}${a}`);
}
