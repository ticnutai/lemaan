// הרחבת Sefaria — משניות וחומשים (לבדיקה בטאב "לימוד דף")

// מסכתות משניות → שמות אנגלית של Sefaria (כולל מסכתות שלא בש"ס)
export const MISHNA_MASECHTA_EN: Record<string, string> = {
  // זרעים
  "ברכות": "Berakhot", "פאה": "Peah", "דמאי": "Demai", "כלאים": "Kilayim",
  "שביעית": "Sheviit", "תרומות": "Terumot", "מעשרות": "Maasrot",
  "מעשר שני": "Maaser Sheni", "חלה": "Challah", "ערלה": "Orlah", "ביכורים": "Bikkurim",
  // מועד
  "שבת": "Shabbat", "עירובין": "Eruvin", "פסחים": "Pesachim", "שקלים": "Shekalim",
  "יומא": "Yoma", "סוכה": "Sukkah", "ביצה": "Beitzah", "ראש השנה": "Rosh Hashanah",
  "תענית": "Taanit", "מגילה": "Megillah", "מועד קטן": "Moed Katan", "חגיגה": "Chagigah",
  // נשים
  "יבמות": "Yevamot", "כתובות": "Ketubot", "נדרים": "Nedarim", "נזיר": "Nazir",
  "סוטה": "Sotah", "גיטין": "Gittin", "קידושין": "Kiddushin",
  // נזיקין
  "בבא קמא": "Bava Kamma", "בבא מציעא": "Bava Metzia", "בבא בתרא": "Bava Batra",
  "סנהדרין": "Sanhedrin", "מכות": "Makkot", "שבועות": "Shevuot",
  "עדיות": "Eduyot", "עבודה זרה": "Avodah Zarah", "אבות": "Avot", "הוריות": "Horayot",
  // קדשים
  "זבחים": "Zevachim", "מנחות": "Menachot", "חולין": "Chullin", "בכורות": "Bekhorot",
  "ערכין": "Arakhin", "תמורה": "Temurah", "כריתות": "Keritot", "מעילה": "Meilah",
  "תמיד": "Tamid", "מדות": "Middot", "קינים": "Kinnim",
  // טהרות
  "כלים": "Kelim", "אהלות": "Oholot", "נגעים": "Negaim", "פרה": "Parah",
  "טהרות": "Tahorot", "מקואות": "Mikvaot", "נדה": "Niddah", "מכשירין": "Makhshirin",
  "זבים": "Zavim", "טבול יום": "Tevul Yom", "ידים": "Yadayim", "עוקצים": "Oktzin",
};

export function mishnaSefariaUrl(masechta: string, perek: number, mishna?: number): string {
  const en = MISHNA_MASECHTA_EN[masechta];
  if (!en) return "https://www.sefaria.org.il/texts/Mishnah";
  const slug = `Mishnah_${en.replace(/\s+/g, "_")}`;
  const ref = mishna ? `${slug}.${perek}.${mishna}` : `${slug}.${perek}`;
  return `https://www.sefaria.org.il/${ref}?lang=he`;
}

// חומשים → שם אנגלית
export const CHUMASH_EN: Record<string, string> = {
  "בראשית": "Genesis",
  "שמות": "Exodus",
  "ויקרא": "Leviticus",
  "במדבר": "Numbers",
  "דברים": "Deuteronomy",
};

// מספר פרקים בכל ספר
export const CHUMASH_CHAPTERS: Record<string, number> = {
  "בראשית": 50,
  "שמות": 40,
  "ויקרא": 27,
  "במדבר": 36,
  "דברים": 34,
};

export function chumashSefariaUrl(sefer: string, perek: number): string {
  const en = CHUMASH_EN[sefer];
  if (!en) return "https://www.sefaria.org.il/texts/Tanakh";
  return `https://www.sefaria.org.il/${en}.${perek}?lang=he`;
}
