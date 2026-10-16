// Sefaria API client לטקסטי גמרא בבלי
// docs: https://www.sefaria.org.il/api/texts
// ברירת מחדל: מאגר מקומי (public/shas) — Sefaria אונליין משמש רק כגיבוי.

import { fetchLocalAmud, stripTags } from "./localShas";

const SEFARIA_BASE = "https://www.sefaria.org/api/v3/texts";

// מיפוי שמות מסכתות עברית → טרנסליטרציה אנגלית של Sefaria
const MASECHTA_EN: Record<string, string> = {
  "ברכות": "Berakhot",
  "שבת": "Shabbat",
  "עירובין": "Eruvin",
  "פסחים": "Pesachim",
  "שקלים": "Shekalim",
  "יומא": "Yoma",
  "סוכה": "Sukkah",
  "ביצה": "Beitzah",
  "ראש השנה": "Rosh Hashanah",
  "תענית": "Taanit",
  "מגילה": "Megillah",
  "מועד קטן": "Moed Katan",
  "חגיגה": "Chagigah",
  "יבמות": "Yevamot",
  "כתובות": "Ketubot",
  "נדרים": "Nedarim",
  "נזיר": "Nazir",
  "סוטה": "Sotah",
  "גיטין": "Gittin",
  "קידושין": "Kiddushin",
  "בבא קמא": "Bava Kamma",
  "בבא מציעא": "Bava Metzia",
  "בבא בתרא": "Bava Batra",
  "סנהדרין": "Sanhedrin",
  "מכות": "Makkot",
  "שבועות": "Shevuot",
  "עבודה זרה": "Avodah Zarah",
  "הוריות": "Horayot",
  "זבחים": "Zevachim",
  "מנחות": "Menachot",
  "חולין": "Chullin",
  "בכורות": "Bekhorot",
  "ערכין": "Arakhin",
  "תמורה": "Temurah",
  "כריתות": "Keritot",
  "מעילה": "Meilah",
  "תמיד": "Tamid",
  "נדה": "Niddah",
};

const cache = new Map<string, string[]>();

/** מחזיר מערך פסקאות עברית עבור עמוד ספציפי — מקומי קודם, אונליין כגיבוי. */
export async function fetchSefariaDaf(
  masechta: string,
  daf: number,
  amud: 1 | 2,
): Promise<string[]> {
  const en = MASECHTA_EN[masechta];
  if (!en) throw new Error(`מסכת לא מוכרת ב-Sefaria: ${masechta}`);
  const ref = `${en}.${daf}${amud === 1 ? "a" : "b"}`;
  const key = ref;
  if (cache.has(key)) return cache.get(key)!;

  // 1) מאגר מקומי (offline-first)
  const local = await fetchLocalAmud(en.replace(/\s+/g, "_"), daf, amud === 1 ? "a" : "b");
  if (local && local.gemara.length > 0) {
    const cleaned = local.gemara.map(stripTags).filter(Boolean);
    cache.set(key, cleaned);
    return cleaned;
  }

  // 2) גיבוי: Sefaria אונליין
  const url = `${SEFARIA_BASE}/${encodeURIComponent(ref)}?version=hebrew&return_format=text_only`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sefaria fetch failed: ${res.status}`);
  const data = await res.json();
  const versions = (data?.versions ?? []) as Array<{ text: unknown }>;
  const raw: unknown = versions[0]?.text ?? data?.text ?? [];
  // השטחה — ייתכן מערך מקונן
  const flat: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") flat.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
  };
  walk(raw);
  const cleaned = flat.map((s) => s.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  cache.set(key, cleaned);
  return cleaned;
}

export function sefariaUrl(masechta: string, daf: number, amud: 1 | 2): string {
  const en = MASECHTA_EN[masechta];
  if (!en) return "https://www.sefaria.org.il/texts/Talmud";
  return `https://www.sefaria.org.il/${en}.${daf}${amud === 1 ? "a" : "b"}?lang=he`;
}

export function isSefariaSupported(masechta: string): boolean {
  return masechta in MASECHTA_EN;
}

/** מחזיר slug אנגלי בטוח לשימוש בנתיבי אחסון (ללא רווחים). */
export function masechtaSlug(masechta: string): string {
  const en = MASECHTA_EN[masechta];
  if (!en) return masechta;
  return en.replace(/\s+/g, "_");
}