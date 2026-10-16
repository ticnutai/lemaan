import type { SidebarConfig } from "@/lib/study/types";

// Shared list of all available shell sidebar section IDs and labels.
// Used by AppSidebar (rendering) and RoleDefaultsTab (admin blocklist editor).
export interface SidebarItemMeta {
  id: string;
  label: string;
}

export const ALL_SIDEBAR_ITEMS: SidebarItemMeta[] = [
  { id: "home", label: "בית" },
  { id: "overview", label: "סקירה כללית" },
  { id: "summary", label: "סיכום" },
  { id: "study", label: "חזרות" },
  { id: "daf", label: "תרגול" },
  { id: "shas-board", label: 'לוח ש"ס' },
  { id: "categories", label: "קטגוריות" },
  { id: "decks", label: "בניית מבחנים" },
  { id: "questions", label: "בניית שאלות" },
  { id: "blocker", label: "בודק רצפים" },
  { id: "morning", label: "קימה בבוקר" },
  { id: "today", label: "היום שלי" },
  { id: "tasks", label: "לוח משימות" },
  { id: "system-rubric", label: "מפת מערכת" },
  { id: "search", label: "חיפוש" },
  { id: "habits", label: "הרגלים" },
  { id: "journal", label: "יומן" },
  { id: "timer", label: "טיימר" },
  { id: "monitor", label: "בקרת מעקב" },
  { id: "goals", label: "יעדים יומיים" },
  { id: "book", label: "הספר שלי" },
  { id: "studio", label: "סטודיו מסמכים" },
  { id: "pdf", label: "צפיין PDF" },
  { id: "ai", label: "מאמן AI" },
  { id: "ai-generator", label: "יצירת שאלות AI" },
  { id: "question-lab", label: "מעבדת שאלות" },
  { id: "achievements", label: "הישגים" },
  { id: "archive", label: "ארכיון" },
  { id: "backup", label: "גיבוי וייצוא" },
  { id: "backup-restore", label: "גיבוי ושחזור" },
  { id: "db-inspector", label: "מסד נתונים" },
  { id: "perf", label: "בדיקת מהירות" },
  { id: "admin", label: "ניהול משתמשים" },
  { id: "settings", label: "הגדרות" },
];

/**
 * `cards` was the historic id of the combined categories/questions screen.
 * Existing cloud profiles and local caches can still contain it, so every
 * read path expands it into the three independent pages introduced later.
 */
export const LEGACY_COMBINED_WORKSPACE_ID = "cards";
export const SPLIT_WORKSPACE_IDS = ["categories", "decks", "questions"] as const;

export function normalizeSplitWorkspaceSections(sections: string[]): string[] {
  const normalized = new Set(sections.filter((id): id is string => typeof id === "string" && id.length > 0));
  if (normalized.delete(LEGACY_COMBINED_WORKSPACE_ID)) {
    SPLIT_WORKSPACE_IDS.forEach((id) => normalized.add(id));
  }
  return Array.from(normalized);
}

export function normalizeSplitWorkspaceSidebarConfig(config: SidebarConfig[]): SidebarConfig[] {
  if (!Array.isArray(config) || config.length === 0) return [];

  const sorted = config
    .filter((item): item is SidebarConfig => !!item && typeof item.id === "string")
    .slice()
    .sort((a, b) => a.order - b.order);
  const explicitlyConfigured = new Set(
    sorted
      .filter((item) => item.id !== LEGACY_COMBINED_WORKSPACE_ID)
      .map((item) => item.id),
  );
  const seen = new Set<string>();
  const result: SidebarConfig[] = [];

  for (const item of sorted) {
    if (item.id === LEGACY_COMBINED_WORKSPACE_ID) {
      for (const id of SPLIT_WORKSPACE_IDS) {
        if (explicitlyConfigured.has(id) || seen.has(id)) continue;
        result.push({ id, visible: item.visible !== false, order: result.length });
        seen.add(id);
      }
      continue;
    }
    if (seen.has(item.id)) continue;
    result.push({ id: item.id, visible: item.visible !== false, order: result.length });
    seen.add(item.id);
  }

  return result.map((item, order) => ({ ...item, order }));
}
