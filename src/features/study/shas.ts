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
