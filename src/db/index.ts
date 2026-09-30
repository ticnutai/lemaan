import Dexie, { type Table } from "dexie";
import type { Card, Category, Deck, ReviewLog, Goal, Setting } from "../features/study/types";

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
