// מסכתות הש"ס בבלי + מספר דפים (מתחילים מדף ב')
// מקור: רשימת מסכתות הבבלי הסטנדרטית
export interface Masechta {
  name: string;
  pages: number; // total daf count (excluding daf alef which doesn't exist)
  seder: string;
}

export const SHAS_BAVLI: Masechta[] = [
  // זרעים
  { name: "ברכות", pages: 63, seder: "זרעים" },
  // מועד
  { name: "שבת", pages: 156, seder: "מועד" },
  { name: "עירובין", pages: 104, seder: "מועד" },
  { name: "פסחים", pages: 120, seder: "מועד" },
  { name: "שקלים", pages: 21, seder: "מועד" },
  { name: "יומא", pages: 87, seder: "מועד" },
  { name: "סוכה", pages: 55, seder: "מועד" },
  { name: "ביצה", pages: 39, seder: "מועד" },
  { name: "ראש השנה", pages: 34, seder: "מועד" },
  { name: "תענית", pages: 30, seder: "מועד" },
  { name: "מגילה", pages: 31, seder: "מועד" },
  { name: "מועד קטן", pages: 28, seder: "מועד" },
  { name: "חגיגה", pages: 26, seder: "מועד" },
  // נשים
  { name: "יבמות", pages: 121, seder: "נשים" },
  { name: "כתובות", pages: 111, seder: "נשים" },
  { name: "נדרים", pages: 90, seder: "נשים" },
  { name: "נזיר", pages: 65, seder: "נשים" },
  { name: "סוטה", pages: 48, seder: "נשים" },
  { name: "גיטין", pages: 89, seder: "נשים" },
  { name: "קידושין", pages: 81, seder: "נשים" },
  // נזיקין
  { name: "בבא קמא", pages: 118, seder: "נזיקין" },
  { name: "בבא מציעא", pages: 118, seder: "נזיקין" },
  { name: "בבא בתרא", pages: 175, seder: "נזיקין" },
  { name: "סנהדרין", pages: 112, seder: "נזיקין" },
  { name: "מכות", pages: 23, seder: "נזיקין" },
  { name: "שבועות", pages: 48, seder: "נזיקין" },
  { name: "עבודה זרה", pages: 75, seder: "נזיקין" },
  { name: "הוריות", pages: 13, seder: "נזיקין" },
  // קדשים
  { name: "זבחים", pages: 119, seder: "קדשים" },
  { name: "מנחות", pages: 109, seder: "קדשים" },
  { name: "חולין", pages: 141, seder: "קדשים" },
  { name: "בכורות", pages: 60, seder: "קדשים" },
  { name: "ערכין", pages: 33, seder: "קדשים" },
  { name: "תמורה", pages: 33, seder: "קדשים" },
  { name: "כריתות", pages: 27, seder: "קדשים" },
  { name: "מעילה", pages: 21, seder: "קדשים" },
  { name: "תמיד", pages: 9, seder: "קדשים" },
  // טהרות
  { name: "נדה", pages: 72, seder: "טהרות" },
];

export const SEDARIM = ["זרעים", "מועד", "נשים", "נזיקין", "קדשים", "טהרות"];
