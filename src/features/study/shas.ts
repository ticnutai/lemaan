/** Standard Shas seder → masechtot mapping, used by the practice hub. */
export const SEDARIM: { name: string; masechtot: string[] }[] = [
  { name: "זרעים", masechtot: ["ברכות"] },
  {
    name: "מועד",
    masechtot: ["שבת", "עירובין", "פסחים", "שקלים", "יומא", "סוכה", "ביצה", "ראש השנה", "תענית", "מגילה", "מועד קטן", "חגיגה"],
  },
  { name: "נשים", masechtot: ["יבמות", "כתובות", "נדרים", "נזיר", "סוטה", "גיטין", "קידושין"] },
  {
    name: "נזיקין",
    masechtot: ["בבא קמא", "בבא מציעא", "בבא בתרא", "סנהדרין", "מכות", "שבועות", "עבודה זרה", "הוריות", "עדיות", "אבות"],
  },
  {
    name: "קדשים",
    masechtot: ["זבחים", "מנחות", "חולין", "בכורות", "ערכין", "תמורה", "כריתות", "מעילה", "תמיד", "מידות", "קינים"],
  },
  { name: "טהרות", masechtot: ["נדה"] },
];

export function sederOf(masechta: string): string | null {
  for (const s of SEDARIM) if (s.masechtot.includes(masechta)) return s.name;
  return null;
}

/** "2" → "ב", "17" → "יז" — ספרור דפים עברי. */
export function hebrewDaf(n: number): string {
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  const hundreds = ["", "ק", "קכ"]; // דפים עד קע"ו
  if (n >= 100) {
    const rest = hebrewDaf(n - 100);
    return "ק" + (rest === "" ? "" : rest);
  }
  const t = Math.floor(n / 10), o = n % 10;
  if (t === 1 && o === 5) return "טו";
  if (t === 1 && o === 6) return "טז";
  void hundreds;
  return tens[t] + ones[o];
}

export const AMUD_LABELS: Record<string, string> = { "1": "עמוד א'", "2": "עמוד ב'" };
export const AMUD_SHORT: Record<string, string> = { "1": "ע\"א", "2": "ע\"ב" };
