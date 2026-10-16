import type { WidgetConfig, WidgetLayout } from "./types";

export interface WidgetDef {
  id: string;
  label: string; // Hebrew label for the hidden widgets panel
}

// All defined widgets per tab
export const WIDGET_DEFS: Record<string, WidgetDef[]> = {
  overview: [
    { id: "weekly-summary",  label: "סיכום שבועי" },
    { id: "study-plans",     label: "תוכניות לימוד" },
    { id: "quiz-plans",      label: "תוכניות בחינה" },
    { id: "goals-manager",   label: "יעדים" },
    { id: "daily-trackers",  label: "תזכורות יומיות" },
    { id: "quote-card",      label: "ציטוט יומי" },
    { id: "ai-coach",        label: "AI מאמן" },
    { id: "next-alarm",      label: "תזכורת הבאה" },
    { id: "pomodoro",        label: "פומודורו" },
    { id: "task-card",       label: "משימות" },
    { id: "heatmap",         label: "מפת חום" },
    { id: "review-calendar", label: "לוח שנה - חזרות" },
  ],
  goals: [
    { id: "study-plans",       label: "תוכניות לימוד" },
    { id: "quiz-plans",        label: "תוכניות בחינה" },
    { id: "goals-manager",     label: "יעדים" },
    { id: "reminder-settings", label: "הגדרות תזכורת" },
  ],
  cards: [
    { id: "cards-decks",      label: "מערכות" },
    { id: "cards-toolbar",    label: "כותרת ופעולות" },
    { id: "cards-pinned",     label: "קטגוריות מוצמדות" },
    { id: "cards-categories", label: "קטגוריות" },
    { id: "cards-filters",    label: "סינון תאריכים" },
    { id: "cards-list",       label: "רשימת שאלות" },
  ],
  blocker: [
    { id: "blocker-overview", label: "סקירת רצפים" },
    { id: "blocker-insights", label: "תובנות" },
    { id: "blocker-actions", label: "פעולות מומלצות" },
  ],
  morning: [
    { id: "morning-routine", label: "שגרת בוקר" },
    { id: "morning-energy", label: "מדדי אנרגיה" },
  ],
  today: [
    { id: "today-focus", label: "פוקוס להיום" },
    { id: "today-schedule", label: "לו" + "ז יומי" },
    { id: "today-notes", label: "הערות היום" },
  ],
  tasks: [
    { id: "tasks-board", label: "לוח משימות" },
    { id: "tasks-priority", label: "עדיפויות" },
    { id: "tasks-inbox", label: "תיבת משימות" },
  ],
  habits: [
    { id: "habits-tracker", label: "מעקב הרגלים" },
    { id: "habits-streak", label: "רצפים" },
  ],
  journal: [
    { id: "journal-entry", label: "רשומה חדשה" },
    { id: "journal-history", label: "היסטוריה" },
  ],
  timer: [
    { id: "timer-main", label: "טיימר" },
    { id: "timer-summary", label: "סיכום טיימר" },
  ],
  monitor: [
    { id: "monitor-summary", label: "סיכום מעקב" },
    { id: "monitor-analytics", label: "אנליטיקה" },
    { id: "monitor-alerts", label: "התראות" },
  ],
  goals_page: [
    { id: "goals-main", label: "יעדים" },
    { id: "goals-reminders", label: "תזכורות" },
    { id: "goals-progress", label: "התקדמות" },
  ],
  book: [
    { id: "book-learning", label: "לימוד" },
    { id: "book-plans", label: "תכניות" },
  ],
  studio: [
    { id: "studio-files", label: "קבצים" },
    { id: "studio-recent", label: "פעילות אחרונה" },
  ],
  pdf: [
    { id: "pdf-viewer", label: "צפייה" },
    { id: "pdf-notes", label: "הערות" },
  ],
  ai_page: [
    { id: "ai-coach-main", label: "מאמן AI" },
    { id: "ai-tools", label: "כלים חכמים" },
  ],
  achievements_page: [
    { id: "achievements-streak", label: "רצף הישגים" },
    { id: "achievements-badges", label: "תגים" },
  ],
  archive: [
    { id: "archive-search", label: "חיפוש בארכיון" },
    { id: "archive-recent", label: "פריטים אחרונים" },
  ],
  categories: [
    { id: "cat-pinned",  label: "מוצמדים" },
    { id: "cat-manager", label: "עץ קטגוריות" },
    { id: "cat-cards",   label: "שאלות קטגוריה" },
  ],
  study: [
    { id: "study-calendar", label: "לוח שנה" },
    { id: "study-stats",    label: "סטטיסטיקות" },
    { id: "study-decks",    label: "מערכות" },
    { id: "study-actions",  label: "פעולות לימוד" },
    { id: "study-forecast", label: "תחזית חזרות" },
    { id: "study-settings", label: "הגדרות אלגוריתם" },
    { id: "study-heatmap",  label: "מפת חום" },
  ],
};

export const DEFAULT_WIDGET_LAYOUT: WidgetLayout = {
  // "כללי" is the landing tab, so it shows the widgets belonging to the pages
  // that actually exist in the tab strip (לימוד דף / קטגוריות / יצירת מבחנים / יצירת שאלות / לוח ש"ס):
  // study progress, review scheduling and question plans. Widgets for pages that
  // are not part of the strip (משימות, פומודורו, ציטוט, מאמן AI, תזכורות) stay
  // available in "ערוך פריסה" but are hidden by default so the tab stays focused.
  overview: [
    { id: "study-plans",     visible: true,  size: "half", order: 0 },
    { id: "quiz-plans",      visible: true,  size: "half", order: 1 },
    { id: "review-calendar", visible: true,  size: "full", order: 2 },
    { id: "weekly-summary",  visible: true,  size: "full", order: 3 },
    { id: "heatmap",         visible: true,  size: "full", order: 4 },
    { id: "goals-manager",   visible: false, size: "full", order: 5 },
    { id: "daily-trackers",  visible: false, size: "half", order: 6 },
    { id: "quote-card",      visible: false, size: "half", order: 7 },
    { id: "ai-coach",        visible: false, size: "half", order: 8 },
    { id: "next-alarm",      visible: false, size: "half", order: 9 },
    { id: "pomodoro",        visible: false, size: "half", order: 10 },
    { id: "task-card",       visible: false, size: "half", order: 11 },
  ],
  goals: [
    { id: "study-plans",       visible: true, size: "half", order: 0 },
    { id: "quiz-plans",        visible: true, size: "half", order: 2 },
    { id: "goals-manager",     visible: true, size: "half", order: 3 },
    { id: "reminder-settings", visible: true, size: "half", order: 4 },
  ],
  cards: [
    { id: "cards-categories", visible: true, size: "full", order: 0 },
    { id: "cards-decks",      visible: true, size: "half", order: 1 },
    { id: "cards-toolbar",    visible: true, size: "half", order: 2 },
    { id: "cards-pinned",     visible: true, size: "half", order: 3, collapsed: true },
    { id: "cards-filters",    visible: true, size: "half", order: 4 },
    { id: "cards-list",       visible: true, size: "full", order: 5 },
  ],
  blocker: [
    { id: "blocker-overview", visible: true, size: "half", order: 0 },
    { id: "blocker-insights", visible: true, size: "half", order: 1 },
    { id: "blocker-actions", visible: true, size: "full", order: 2 },
  ],
  morning: [
    { id: "morning-routine", visible: true, size: "half", order: 0 },
    { id: "morning-energy", visible: true, size: "half", order: 1 },
  ],
  today: [
    { id: "today-focus", visible: true, size: "half", order: 0 },
    { id: "today-schedule", visible: true, size: "half", order: 1 },
    { id: "today-notes", visible: true, size: "full", order: 2 },
  ],
  tasks: [
    { id: "tasks-board", visible: true, size: "full", order: 0 },
    { id: "tasks-priority", visible: true, size: "half", order: 1 },
    { id: "tasks-inbox", visible: true, size: "half", order: 2 },
  ],
  habits: [
    { id: "habits-tracker", visible: true, size: "half", order: 0 },
    { id: "habits-streak", visible: true, size: "half", order: 1 },
  ],
  journal: [
    { id: "journal-entry", visible: true, size: "half", order: 0 },
    { id: "journal-history", visible: true, size: "half", order: 1 },
  ],
  timer: [
    { id: "timer-main", visible: true, size: "half", order: 0 },
    { id: "timer-summary", visible: true, size: "half", order: 1 },
  ],
  monitor: [
    { id: "monitor-summary", visible: true, size: "half", order: 0 },
    { id: "monitor-analytics", visible: true, size: "half", order: 1 },
    { id: "monitor-alerts", visible: true, size: "full", order: 2 },
  ],
  goals_page: [
    { id: "goals-main", visible: true, size: "half", order: 0 },
    { id: "goals-reminders", visible: true, size: "half", order: 1 },
    { id: "goals-progress", visible: true, size: "full", order: 2 },
  ],
  book: [
    { id: "book-learning", visible: true, size: "half", order: 0 },
    { id: "book-plans", visible: true, size: "half", order: 1 },
  ],
  studio: [
    { id: "studio-files", visible: true, size: "half", order: 0 },
    { id: "studio-recent", visible: true, size: "half", order: 1 },
  ],
  pdf: [
    { id: "pdf-viewer", visible: true, size: "half", order: 0 },
    { id: "pdf-notes", visible: true, size: "half", order: 1 },
  ],
  ai_page: [
    { id: "ai-coach-main", visible: true, size: "half", order: 0 },
    { id: "ai-tools", visible: true, size: "half", order: 1 },
  ],
  achievements_page: [
    { id: "achievements-streak", visible: true, size: "half", order: 0 },
    { id: "achievements-badges", visible: true, size: "half", order: 1 },
  ],
  archive: [
    { id: "archive-search", visible: true, size: "half", order: 0 },
    { id: "archive-recent", visible: true, size: "half", order: 1 },
  ],
  categories: [
    { id: "cat-manager", visible: true, size: "full", order: 0 },
    { id: "cat-pinned",  visible: true, size: "full", order: 1 },
    { id: "cat-cards",   visible: true, size: "half", order: 2 },
  ],
  study: [
    { id: "study-calendar", visible: true, size: "full", order: 0 },
    { id: "study-heatmap",  visible: false, size: "full", order: 1 },
    { id: "study-stats",    visible: true,  size: "full", order: 2 },
    { id: "study-decks",    visible: true,  size: "half", order: 3 },
    { id: "study-actions",  visible: true,  size: "half", order: 4 },
    { id: "study-forecast", visible: true,  size: "half", order: 5 },
    { id: "study-settings", visible: true,  size: "half", order: 6 },
  ],
};

/** Merge saved layout with defaults — adds new widgets, keeps removed ones hidden */
export function mergeLayout(saved: WidgetConfig[] | undefined, tabId: string): WidgetConfig[] {
  const defaults = DEFAULT_WIDGET_LAYOUT[tabId] ?? [];
  if (!saved || saved.length === 0) return defaults;
  const savedMap = new Map(saved.map((w) => [w.id, w]));
  // Start with saved order
  const merged: WidgetConfig[] = saved.map((w, i) => ({ ...w, order: i }));
  // Add any new widgets from defaults not yet in saved
  defaults.forEach((d) => {
    if (!savedMap.has(d.id)) {
      merged.push({ ...d, order: merged.length });
    }
  });
  return merged;
}

/** Apply admin-defined global widget blocklist — removes blocked widgets entirely */
export function applyWidgetBlocklist(
  layout: WidgetConfig[],
  tabId: string,
  blockedByTab: Record<string, string[]> | undefined,
): WidgetConfig[] {
  const blocked = new Set(blockedByTab?.[tabId] ?? []);
  if (blocked.size === 0) return layout;
  return layout.filter((w) => !blocked.has(w.id));
}
