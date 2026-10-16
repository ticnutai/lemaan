import { useEffect, useState } from "react";

export type MobileLayoutMode = "auto" | "default" | "premium-stack" | "focused" | "carousel" | "magazine";

const STORAGE_KEY = "pashash.mobileLayoutMode";
const EVENT_NAME = "pashash:mobile-layout-mode-changed";

export const MOBILE_LAYOUT_MODE_OPTIONS: { value: MobileLayoutMode; label: string; desc: string }[] = [
  { value: "auto", label: "אוטומטי", desc: "פוקוס דשבורד במובייל, רגילה בדסקטופ" },
  { value: "default", label: "ברירת מחדל", desc: "אותה פריסה כמו בדסקטופ" },
  { value: "focused", label: "פוקוס דשבורד", desc: "רצועת מצב יומי + כרטיסים גדולים, מסודר ומקצועי" },
  { value: "premium-stack", label: "פרימיום ערוכים", desc: "כרטיסים גדולים בעמודה אחת, נקי ומפואר" },
  { value: "carousel", label: "קרוסלה", desc: "ויד׳גט אחד במסך, החלקה ימינה/שמאלה" },
  { value: "magazine", label: "מגזין", desc: "ויד׳גט ראשי גדול ושאר בשורות של שניים" },
];

export function getMobileLayoutMode(): MobileLayoutMode {
  if (typeof window === "undefined") return "auto";
  const v = (localStorage.getItem(STORAGE_KEY) ?? "auto") as MobileLayoutMode;
  return MOBILE_LAYOUT_MODE_OPTIONS.some((o) => o.value === v) ? v : "auto";
}

export function setMobileLayoutMode(mode: MobileLayoutMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function useMobileLayoutMode(): MobileLayoutMode {
  const [mode, setMode] = useState<MobileLayoutMode>(() => getMobileLayoutMode());
  useEffect(() => {
    const handler = () => setMode(getMobileLayoutMode());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return mode;
}

/** Resolve "auto" to a concrete mode for mobile rendering. */
export function resolveMobileMode(mode: MobileLayoutMode, isMobile: boolean): MobileLayoutMode {
  if (!isMobile) return "default";
  if (mode === "auto") return "focused";
  return mode;
}
