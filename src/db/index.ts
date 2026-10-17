import Dexie, { type Table } from "dexie";
import type { Card, Category, Deck, ReviewLog, Goal, Setting, StudyPlan } from "../features/study/types";
import type { ShasAmud, ShasLogRow } from "../features/study/shasBoard";

/** מעקב סנכרון לפריט אישי: key = "סוג:מזהה", changedAt — זמן השינוי האחרון, pending — 1 עד שנשלח לענן. */
export interface SyncItem {
  key: string;
  changedAt: number;
  pending: 0 | 1;
}

/**
 * Single local data layer for the whole app (IndexedDB via Dexie).
 * All persistence goes through here — no localStorage state, no polling.
 * When cloud sync is added later it will be a separate module that talks
 * to this database, not scattered through the UI.
 */
class LemaanDB extends Dexie {
  cards!: Table<Card, string>;
  categories!: Table<Category, string>;
  decks!: Table<Deck, string>;
  reviewLogs!: Table<ReviewLog, number>;
  goals!: Table<Goal, string>;
  settings!: Table<Setting, string>;
  shasProgress!: Table<ShasAmud, string>;
  shasLog!: Table<ShasLogRow, number>;
  studyPlans!: Table<StudyPlan, string>;
  syncItems!: Table<SyncItem, string>;

  constructor() {
    super("lemaan");
    this.version(1).stores({
      cards: "id, categoryId, masechta, srs.dueAt, updatedAt",
      categories: "id, parentId, sortOrder",
      decks: "id, name",
      reviewLogs: "++id, cardId, at",
      goals: "id, type",
      settings: "key",
    });
    // לוח לימוד הש"ס: התקדמות לפי עמוד + יומן יומי לסטטיסטיקות
    this.version(2).stores({
      shasProgress: "key, masechta",
      shasLog: "++id, at",
    });
    // תוכניות לימוד יומיות (חומש, רמב"ם, דף יומי...)
    this.version(3).stores({
      studyPlans: "id, name",
    });
    // אינדקס לפי שם קטגוריה — מציאת שורש (למשל "טור" לשולחן ערוך) בלי לעבור על כל הקטגוריות
    this.version(4).stores({
      categories: "id, parentId, sortOrder, name",
    });
    // סנכרון מדורג: לכל פריט אישי — זמן השינוי האחרון, והאם הוא עוד לא נשלח לענן
    this.version(5).stores({
      syncItems: "key, pending",
    });
  }
}

export const db = new LemaanDB();

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await db.settings.get(key);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}
