/**
 * מערכת ערכות נושא חיה — מקור אמת יחיד.
 * הטוקנים של הערכות המובנות חיים ב-index.css בלבד (אין כפילות ב-JS);
 * עריכות חיות וערכות אישיות נשמרות ב-localStorage ומוחלות כ-inline style.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface ThemeDef {
  id: string;
  label: string;
  description: string;
  swatch: string[];
  /** לערכה אישית: הערכה המובנית שעליה היא מבוססת */
  base?: string;
}

export type ThemeTokens = Record<string, string>;

export const BUILTIN_THEMES: ThemeDef[] = [
  { id: "royal-navy", label: "Royal Navy", description: "לבן · זהב · נייבי", swatch: ["hsl(40 33% 98%)", "hsl(42 70% 50%)", "hsl(220 65% 14%)"] },
  { id: "midnight-gold", label: "Midnight Gold", description: "נייבי כהה · זהב", swatch: ["hsl(220 50% 8%)", "hsl(42 75% 58%)", "hsl(40 40% 95%)"] },
  { id: "mobile-focus", label: "פוקוס מובייל", description: "קרם · מנטה · זהב · נייבי", swatch: ["hsl(42 45% 98%)", "hsl(158 66% 43%)", "hsl(42 78% 50%)", "hsl(220 62% 17%)"] },
  { id: "emerald-ivory", label: "Emerald Ivory", description: "שנהב · ירוק · זהב", swatch: ["hsl(45 40% 97%)", "hsl(160 55% 18%)", "hsl(42 70% 50%)"] },
  { id: "burgundy-rose", label: "Burgundy Rose", description: "קרם · בורדו · רוז גולד", swatch: ["hsl(30 30% 97%)", "hsl(350 55% 25%)", "hsl(25 60% 55%)"] },
  { id: "mint-gold-gradients", label: "מנטה וזהב — גרדיאנטים", description: "מעברים רכים של שמנת, מנטה וזהב", swatch: ["#fbf4df", "#dcefe5", "#ecd393", "#142542"] },
];

/** טוקני צבע (HSL "h s% l%") הניתנים לעריכה חיה */
export const COLOR_TOKEN_GROUPS: { title: string; tokens: { key: string; label: string }[] }[] = [
  {
    title: "רקעים ומשטחים",
    tokens: [
      { key: "background", label: "רקע כללי" },
      { key: "card", label: "כרטיסים" },
      { key: "secondary", label: "משני" },
      { key: "muted", label: "מעומעם" },
      { key: "popover", label: "חלוניות" },
    ],
  },
  {
    title: "טקסט",
    tokens: [
      { key: "foreground", label: "טקסט ראשי" },
      { key: "card-foreground", label: "טקסט בכרטיס" },
      { key: "muted-foreground", label: "טקסט משני" },
      { key: "primary-foreground", label: "טקסט על ראשי" },
    ],
  },
  {
    title: "צבעי מותג",
    tokens: [
      { key: "primary", label: "ראשי" },
      { key: "gold", label: "זהב" },
      { key: "gold-soft", label: "זהב רך" },
      { key: "navy", label: "נייבי" },
      { key: "navy-soft", label: "נייבי רך" },
      { key: "accent", label: "מבטא" },
    ],
  },
  {
    title: "מסגרות ושדות",
    tokens: [
      { key: "border", label: "מסגרות" },
      { key: "input", label: "שדות קלט" },
      { key: "ring", label: "טבעת פוקוס" },
      { key: "destructive", label: "מחיקה/שגיאה" },
    ],
  },
  {
    title: "מדדי מסך הבית",
    tokens: [
      { key: "focus-streak-from", label: "רצף — התחלה" },
      { key: "focus-streak-to", label: "רצף — סוף" },
      { key: "focus-due-from", label: "ממתינות — התחלה" },
      { key: "focus-due-to", label: "ממתינות — סוף" },
      { key: "focus-learned-from", label: "נלמדו — התחלה" },
      { key: "focus-learned-to", label: "נלמדו — סוף" },
    ],
  },
  {
    title: "ניווט הש\"ס — צבעי הסדרים",
    tokens: [
      { key: "seder-1", label: "סדר זרעים" },
      { key: "seder-2", label: "סדר מועד" },
      { key: "seder-3", label: "סדר נשים" },
      { key: "seder-4", label: "סדר נזיקין" },
      { key: "seder-5", label: "סדר קדשים" },
      { key: "seder-6", label: "סדר טהרות" },
    ],
  },
];

/** טוקנים מתקדמים (טקסט חופשי): גרדיאנטים וצללים */
export const RAW_TOKENS: { key: string; label: string }[] = [
  { key: "gradient-gold", label: "גרדיאנט זהב" },
  { key: "gradient-navy", label: "גרדיאנט נייבי" },
  { key: "shadow-elegant", label: "צל עדין" },
  { key: "shadow-gold", label: "צל זהב" },
];

export const ALL_TOKEN_KEYS = [
  ...COLOR_TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => t.key)),
  ...RAW_TOKENS.map((t) => t.key),
];

// ---------- hsl <-> hex ----------
export function hslStringToHex(hsl: string): string {
  const m = hsl.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return "#888888";
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to255 = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to255(hue(h + 1 / 3))}${to255(hue(h))}${to255(hue(h - 1 / 3))}`;
}

export function hexToHslString(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ---------- persistence ----------
const LS_THEME = "app-theme";
const LS_OVERRIDES = "app-theme-overrides";
const LS_CUSTOM = "app-theme-custom";

const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

interface Ctx {
  themeId: string;
  setTheme: (id: string) => void;
  allThemes: ThemeDef[];
  /** ערכי הטוקנים בפועל של הערכה הפעילה (בסיס CSS + דריסות) */
  readToken: (key: string) => string;
  /** עריכה חיה של טוקן בערכה הפעילה */
  setToken: (key: string, value: string) => void;
  /** יש דריסות על הערכה הפעילה? */
  isDirty: boolean;
  resetTheme: () => void;
  duplicateAs: (name: string) => void;
  deleteCustom: (id: string) => void;
}

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<string>(() => {
    // הגירה חד-פעמית מהמפתח הישן "theme"
    return localStorage.getItem(LS_THEME) ?? localStorage.getItem("theme") ?? "royal-navy";
  });
  const [overrides, setOverrides] = useState<Record<string, ThemeTokens>>(() => readJSON(LS_OVERRIDES, {}));
  const [custom, setCustom] = useState<ThemeDef[]>(() => readJSON(LS_CUSTOM, []));
  const [customTokens, setCustomTokens] = useState<Record<string, ThemeTokens>>(() => readJSON(LS_CUSTOM + "-tokens", {}));

  const allThemes = useMemo(() => [...BUILTIN_THEMES, ...custom], [custom]);
  const isBuiltin = BUILTIN_THEMES.some((t) => t.id === themeId);
  const baseId = isBuiltin ? themeId : custom.find((t) => t.id === themeId)?.base ?? "royal-navy";

  // החלה על ה-DOM: data-theme לערכת הבסיס + inline vars לדריסות/ערכה אישית
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = baseId;
    el.classList.toggle("dark", baseId === "midnight-gold");
    for (const key of ALL_TOKEN_KEYS) el.style.removeProperty(`--${key}`);
    const applied: ThemeTokens = {
      ...(isBuiltin ? {} : customTokens[themeId] ?? {}),
      ...(overrides[themeId] ?? {}),
    };
    for (const [key, value] of Object.entries(applied)) el.style.setProperty(`--${key}`, value);
    localStorage.setItem(LS_THEME, themeId);
  }, [themeId, baseId, isBuiltin, overrides, customTokens]);

  useEffect(() => localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides)), [overrides]);
  useEffect(() => {
    localStorage.setItem(LS_CUSTOM, JSON.stringify(custom));
    localStorage.setItem(LS_CUSTOM + "-tokens", JSON.stringify(customTokens));
  }, [custom, customTokens]);

  const readToken = useCallback(
    (key: string) => {
      const o = overrides[themeId]?.[key] ?? (!isBuiltin ? customTokens[themeId]?.[key] : undefined);
      if (o) return o;
      return getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim();
    },
    [themeId, isBuiltin, overrides, customTokens]
  );

  const setToken = useCallback(
    (key: string, value: string) => {
      setOverrides((prev) => ({ ...prev, [themeId]: { ...prev[themeId], [key]: value } }));
    },
    [themeId]
  );

  const resetTheme = useCallback(() => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[themeId];
      return next;
    });
  }, [themeId]);

  const duplicateAs = useCallback(
    (name: string) => {
      const id = `custom-${Date.now().toString(36)}`;
      const tokens: ThemeTokens = {};
      for (const key of ALL_TOKEN_KEYS) {
        const v =
          overrides[themeId]?.[key] ??
          (!isBuiltin ? customTokens[themeId]?.[key] : undefined) ??
          getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim();
        if (v) tokens[key] = v;
      }
      const swatch = [tokens.background, tokens.gold, tokens.primary].filter(Boolean).map((v) => `hsl(${v})`);
      setCustom((prev) => [...prev, { id, label: name, description: "ערכה אישית", swatch, base: baseId }]);
      setCustomTokens((prev) => ({ ...prev, [id]: tokens }));
      setThemeId(id);
    },
    [themeId, baseId, isBuiltin, overrides, customTokens]
  );

  const deleteCustom = useCallback(
    (id: string) => {
      setCustom((prev) => prev.filter((t) => t.id !== id));
      setCustomTokens((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (themeId === id) setThemeId("royal-navy");
    },
    [themeId]
  );

  const value: Ctx = {
    themeId,
    setTheme: setThemeId,
    allThemes,
    readToken,
    setToken,
    isDirty: Boolean(overrides[themeId] && Object.keys(overrides[themeId]).length),
    resetTheme,
    duplicateAs,
    deleteCustom,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
