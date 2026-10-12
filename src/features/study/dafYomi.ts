// הדף היומי לפי תאריך — מחזור קבוע של 2,711 ימים (מאז המחזור השמיני, 1975).
// המחזור ה-14 התחיל ב-5 בינואר 2020 בברכות ב. השיטה זהה לזו של hebcal (DafYomi):
// כל מסכת תופסת (מספר הדפים − 1) ימים; מעילה כוללת את קינים, תמיד ומידות.

interface DafYomiMasechet {
  slug: string | null; // שם המסכת בקובצי הש"ס (null — אין גמרא בקבצים: קינים, תמיד, מידות)
  he: string;
  blatt: number; // הדף האחרון
  offset?: number; // לקינים/תמיד/מידות: מספור הדפים בתוך מעילה
}

const CYCLE: DafYomiMasechet[] = [
  { slug: "Berakhot", he: "ברכות", blatt: 64 },
  { slug: "Shabbat", he: "שבת", blatt: 157 },
  { slug: "Eruvin", he: "עירובין", blatt: 105 },
  { slug: "Pesachim", he: "פסחים", blatt: 121 },
  { slug: "Shekalim", he: "שקלים", blatt: 22 },
  { slug: "Yoma", he: "יומא", blatt: 88 },
  { slug: "Sukkah", he: "סוכה", blatt: 56 },
  { slug: "Beitzah", he: "ביצה", blatt: 40 },
  { slug: "Rosh_Hashanah", he: "ראש השנה", blatt: 35 },
  { slug: "Taanit", he: "תענית", blatt: 31 },
  { slug: "Megillah", he: "מגילה", blatt: 32 },
  { slug: "Moed_Katan", he: "מועד קטן", blatt: 29 },
  { slug: "Chagigah", he: "חגיגה", blatt: 27 },
  { slug: "Yevamot", he: "יבמות", blatt: 122 },
  { slug: "Ketubot", he: "כתובות", blatt: 112 },
  { slug: "Nedarim", he: "נדרים", blatt: 91 },
  { slug: "Nazir", he: "נזיר", blatt: 66 },
  { slug: "Sotah", he: "סוטה", blatt: 49 },
  { slug: "Gittin", he: "גיטין", blatt: 90 },
  { slug: "Kiddushin", he: "קידושין", blatt: 82 },
  { slug: "Bava_Kamma", he: "בבא קמא", blatt: 119 },
  { slug: "Bava_Metzia", he: "בבא מציעא", blatt: 119 },
  { slug: "Bava_Batra", he: "בבא בתרא", blatt: 176 },
  { slug: "Sanhedrin", he: "סנהדרין", blatt: 113 },
  { slug: "Makkot", he: "מכות", blatt: 24 },
  { slug: "Shevuot", he: "שבועות", blatt: 49 },
  { slug: "Avodah_Zarah", he: "עבודה זרה", blatt: 76 },
  { slug: "Horayot", he: "הוריות", blatt: 14 },
  { slug: "Zevachim", he: "זבחים", blatt: 120 },
  { slug: "Menachot", he: "מנחות", blatt: 110 },
  { slug: "Chullin", he: "חולין", blatt: 142 },
  { slug: "Bekhorot", he: "בכורות", blatt: 61 },
  { slug: "Arakhin", he: "ערכין", blatt: 34 },
  { slug: "Temurah", he: "תמורה", blatt: 34 },
  { slug: "Keritot", he: "כריתות", blatt: 28 },
  { slug: "Meilah", he: "מעילה", blatt: 22 },
  { slug: null, he: "קינים", blatt: 4, offset: 21 },
  { slug: null, he: "תמיד", blatt: 10, offset: 24 }, // אין עדיין גמרא של תמיד בקובצי הש"ס
  { slug: null, he: "מידות", blatt: 4, offset: 32 },
  { slug: "Niddah", he: "נדה", blatt: 73 },
];

const DAY = 86_400_000;
const CYCLE_DAYS = 2711;
const CYCLE14_START = Date.UTC(2020, 0, 5); // ברכות ב

export interface DafYomi {
  slug: string | null;
  he: string;
  daf: number; // מספר הדף כפי שהוא מודפס
}

/** הדף היומי לתאריך (לפי התאריך המקומי של המכשיר). */
export function dafYomiFor(date: Date = new Date()): DafYomi {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.floor((today - CYCLE14_START) / DAY);
  let dno = ((days % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS; // יום בתוך המחזור
  for (const m of CYCLE) {
    const len = m.blatt - 1;
    if (dno < len) return { slug: m.slug, he: m.he, daf: dno + 2 + (m.offset ?? 0) };
    dno -= len;
  }
  return { slug: "Niddah", he: "נדה", daf: 73 }; // לא אמור לקרות — סכום הימים הוא בדיוק המחזור
}
