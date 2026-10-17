// כל השאלות בזיכרון — עותק אחד משותף לכל המסכים.
// קודם כל מסך (וגם כפתור הניווט הצף שמופיע בכל דף) קרא מחדש את כל עשרות אלפי השאלות מהמסד
// אחרי כל שינוי — גם אחרי כל תשובה בתרגול. עכשיו הן נטענות פעם אחת, ומכאן כל שינוי במסד
// (הוספה, עדכון, מחיקה) מעדכן רק את השאלה שהשתנתה — דרך "ווי" של המסד שרואים כל כתיבה.
import { useSyncExternalStore } from "react";
import { db } from "./index";
import type { Card } from "../features/study/types";

let byId: Map<string, Card> | null = null;
let snapshot: Card[] | undefined;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
let scheduled = false;

function publish() {
  if (scheduled) return;
  scheduled = true;
  // כמה שינויים ברצף (למשל ייבוא) — עדכון אחד למסכים
  setTimeout(() => {
    scheduled = false;
    if (!byId) return;
    snapshot = [...byId.values()];
    listeners.forEach((l) => l());
  }, 30);
}

function load(): Promise<void> {
  loading ??= db.cards.toArray().then((all) => {
    byId = new Map(all.map((c) => [c.id, c]));
    snapshot = all;
    listeners.forEach((l) => l());
  }).catch(() => {
    loading = null;
  });
  return loading;
}

/** טעינה מחדש מלאה — אחרי פעולות שמחליפות את כל המסד (משיכת גיבוי, איפוס). */
export function reloadCards(): Promise<void> {
  loading = null;
  return load();
}

// ווים על טבלת השאלות: כל כתיבה במסד מעדכנת את הזיכרון (אחרי שהיא הצליחה)
db.cards.hook("creating", function (_key, obj) {
  this.onsuccess = () => {
    if (!byId) return;
    byId.set(obj.id, obj);
    publish();
  };
});
db.cards.hook("updating", function (_mods, key) {
  this.onsuccess = (updated: Card) => {
    if (!byId) return;
    byId.set(String(key), updated);
    publish();
  };
});
db.cards.hook("deleting", function (key) {
  this.onsuccess = () => {
    if (!byId) return;
    byId.delete(String(key));
    publish();
  };
});

function subscribe(l: () => void) {
  listeners.add(l);
  void load();
  return () => {
    listeners.delete(l);
  };
}

/** כל השאלות (undefined עד שנטענו). מתעדכן חי, בלי לקרוא שוב את כל המסד. */
export function useAllCards(): Card[] | undefined {
  return useSyncExternalStore(subscribe, () => snapshot);
}
