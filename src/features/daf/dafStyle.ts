import { db } from "../../db";

/** עיצוב צורת הדף — נשמר בהגדרות, הצורה נשמרת בכל שינוי. */
export interface DafStyle {
  /** גופן הגמרא / המפרשים */
  mainFont: "Vilna" | "FrankRuhl" | "Heebo";
  sideFont: "Rashi" | "FrankRuhl" | "Heebo";
  /** 1 = ברירת מחדל; 0.85–1.6 */
  scale: number;
  /** הצגת ניקוד וטעמים (הווילנא המקורי ללא ניקוד) */
  nikud: boolean;
  /** "print" = שורות זהות לדפוס (כשיש נתוני שורות); "live" = פריסה מחושבת */
  mode: "print" | "live";
  colors: { main: string; inner: string; outer: string; headers: string; highlight: string };
}

export const DEFAULT_DAF_STYLE: DafStyle = {
  mainFont: "Vilna",
  sideFont: "Rashi",
  scale: 1,
  nikud: false,
  mode: "print",
  colors: { main: "#111111", inner: "#1c1c1c", outer: "#1c1c1c", headers: "#7a5c12", highlight: "#ffe08a" },
};

const KEY = "daf-style";

export async function loadDafStyle(): Promise<DafStyle> {
  const raw = (await db.settings.get(KEY))?.value;
  if (!raw) return DEFAULT_DAF_STYLE;
  try {
    const parsed = JSON.parse(raw) as Partial<DafStyle>;
    return { ...DEFAULT_DAF_STYLE, ...parsed, colors: { ...DEFAULT_DAF_STYLE.colors, ...(parsed.colors ?? {}) } };
  } catch {
    return DEFAULT_DAF_STYLE;
  }
}

export async function saveDafStyle(style: DafStyle): Promise<void> {
  await db.settings.put({ key: KEY, value: JSON.stringify(style) });
}

/** שם גופן CSS בפועל לכל בחירה. */
export const FONT_FAMILY: Record<DafStyle["mainFont"] | DafStyle["sideFont"], string> = {
  Vilna: "Vilna, 'Frank Ruhl Libre', serif",
  Rashi: "Rashi, 'Frank Ruhl Libre', serif",
  FrankRuhl: "'Frank Ruhl Libre', serif",
  Heebo: "Heebo, sans-serif",
};
