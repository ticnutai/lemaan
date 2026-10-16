// עיצוב הטקסט של השאלות והתשובות בתרגול — כמו חלון "עיצוב טיפוגרפיה" במקור:
// גופן, גודל, עובי, גובה שורה, רווח בין אותיות, יישור, צבע טקסט, רקע, עיגול פינות והצללה.
// נשמר בטבלת ההגדרות (בין כניסות ובגיבוי לענן), כמו שאר העדפות התרגול.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting } from "../../db";

export type Align = "right" | "center" | "left" | "justify";

export interface Typography {
  fontFamily: string; //  "" = ברירת המחדל של האתר
  fontSize: number; //    פיקסלים, 0 = ברירת מחדל
  fontWeight: string; //  "400" | "600" | "700" | "800", "" = ברירת מחדל
  lineHeight: number; //  0 = ברירת מחדל
  letterSpacing: number; // פיקסלים, NO_SPACING = ברירת מחדל
  align: Align;
  textColor: string; //   "" = ברירת מחדל
  bgColor: string; //     "" = ברירת מחדל
  borderRadius: number; // פיקסלים, -1 = ברירת מחדל
  textShadow: boolean;
}

/** סימן ל"רווח בין אותיות לא נקבע" (0 הוא ערך חוקי). */
export const NO_SPACING = 999;

export const DEFAULT_TYPOGRAPHY: Typography = {
  fontFamily: "",
  fontSize: 0,
  fontWeight: "",
  lineHeight: 0,
  letterSpacing: NO_SPACING,
  align: "right",
  textColor: "",
  bgColor: "",
  borderRadius: -1,
  textShadow: false,
};

/** גדלי ברירת המחדל שמוצגים בסרגל כשהגודל לא נקבע (שאלה 18, תשובה 14 — כמו בכרטיס). */
export const BASE_SIZE = { question: 18, answer: 14 } as const;

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "הגופן של האתר", value: "Heebo, sans-serif" },
  { label: "אסיסטנט", value: "Assistant, sans-serif" },
  { label: "אריאל", value: "Arial, sans-serif" },
  { label: "דוד", value: "David, 'David CLM', serif" },
  { label: "פרנק רוהל (ספרי)", value: "'Frank Ruhl Libre', serif" },
  { label: "נרקיס (ספרי)", value: "'Narkisim', 'Frank Ruhl Libre', serif" },
  { label: "מרים (מכונת כתיבה)", value: "'Miriam Fixed', monospace" },
  { label: "טיימס", value: "'Times New Roman', serif" },
];

export function isCustom(t: Typography): boolean {
  return (Object.keys(DEFAULT_TYPOGRAPHY) as (keyof Typography)[]).some((k) => t[k] !== DEFAULT_TYPOGRAPHY[k]);
}

/** עיצוב הטקסט עצמו. `fallbackScale` — ההגדלה הישנה (כפתור ×1.2) כשלא נקבע גודל. */
export function typographyToStyle(t: Typography, baseSize: number, fallbackScale = 1): CSSProperties {
  const s: CSSProperties = { fontSize: `${t.fontSize > 0 ? t.fontSize : baseSize * fallbackScale}px`, textAlign: t.align };
  if (t.fontFamily) s.fontFamily = t.fontFamily;
  if (t.fontWeight) s.fontWeight = t.fontWeight;
  if (t.lineHeight > 0) s.lineHeight = t.lineHeight;
  if (t.letterSpacing !== NO_SPACING) s.letterSpacing = `${t.letterSpacing}px`;
  if (t.textColor) s.color = t.textColor;
  if (t.textShadow) s.textShadow = "0 1px 3px rgba(0,0,0,0.25)";
  return s;
}

/** עיצוב המסגרת: רקע ועיגול פינות. */
export function typographyToBoxStyle(t: Typography): CSSProperties {
  const s: CSSProperties = {};
  if (t.bgColor) s.backgroundColor = t.bgColor;
  if (t.borderRadius >= 0) s.borderRadius = `${t.borderRadius}px`;
  return s;
}

// ---------- שמירה ----------
const KEYS = { question: "study-typo-question", answer: "study-typo-answer" } as const;
const FAVORITES = "study-color-favorites";
export type TypoTarget = keyof typeof KEYS;

function parse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * העיצוב של השאלות והתשובות. השינוי מוצג מיד, והשמירה נדחית מעט —
 * כדי שגרירת סרגל לא תכתוב למסד הנתונים עשרות פעמים בשנייה.
 */
export function useTypography() {
  const stored = useLiveQuery(async () => {
    const [q, a] = await Promise.all([db.settings.get(KEYS.question), db.settings.get(KEYS.answer)]);
    return {
      question: { ...DEFAULT_TYPOGRAPHY, ...parse<Partial<Typography>>(q?.value, {}) },
      answer: { ...DEFAULT_TYPOGRAPHY, ...parse<Partial<Typography>>(a?.value, {}) },
    };
  }, []);
  const [local, setLocal] = useState<Record<TypoTarget, Typography> | null>(null);
  const timers = useRef<Partial<Record<TypoTarget, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => () => Object.values(timers.current).forEach((t) => t && clearTimeout(t)), []);

  const value = local ?? stored ?? { question: DEFAULT_TYPOGRAPHY, answer: DEFAULT_TYPOGRAPHY };

  const update = useCallback(
    (target: TypoTarget, next: Typography) => {
      setLocal((cur) => ({ ...(cur ?? value), [target]: next }));
      const old = timers.current[target];
      if (old) clearTimeout(old);
      timers.current[target] = setTimeout(() => void setSetting(KEYS[target], JSON.stringify(next)), 250);
    },
    [value]
  );

  return { question: value.question, answer: value.answer, update };
}

// ---------- צבעים מועדפים ----------
export function useColorFavorites() {
  const favorites = useLiveQuery(async () => parse<string[]>((await db.settings.get(FAVORITES))?.value, []), []) ?? [];
  const save = (list: string[]) => void setSetting(FAVORITES, JSON.stringify(list));
  return {
    favorites,
    addFavorite: (c: string) => {
      const color = c.toLowerCase();
      if (!favorites.includes(color)) save([...favorites, color].slice(-16));
    },
    removeFavorite: (c: string) => save(favorites.filter((x) => x !== c)),
  };
}
