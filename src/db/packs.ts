// חבילות שאלות נוספות למאגר הכללי (מעבר לקובץ המאגר הראשי) — מגיעות לכל הלומדים.
// כל חבילה נטענת פעם אחת לכל גרסה: מוסיפה רק קטגוריות ושאלות שעוד אין במכשיר, ולכן לא נוגעת
// בהתקדמות של מי שכבר תרגל. המזהים בחבילה קבועים — אין כפילויות גם אחרי עדכון גרסה.
import { db } from "./index";
import type { Card, Category } from "../features/study/types";
import { markNoSync } from "./sync";

interface PackCategory { id: string; name: string; parentId: string | null; sortOrder?: number }
interface PackCard { id: string; type: Card["type"]; question: string; answer: string; categoryId: string; tags?: string[] }
interface Pack { id: string; version: number; categories: PackCategory[]; cards: PackCard[] }

export const PACKS: { id: string; version: number; file: string }[] = [
  { id: "sa-oc-shabbat", version: 1, file: "data/packs/sa-oc-shabbat.json" },
];

const markerKey = (id: string) => `pack:${id}`;

let running: Promise<number> | null = null;

/** טעינת כל החבילות שעוד לא נטענו במכשיר הזה. מחזיר כמה שאלות נוספו. */
export function installPacks(): Promise<number> {
  running ??= (async () => {
    let added = 0;
    try {
      if ((await db.settings.get("library-import-done"))?.value !== "1") return 0; // קודם המאגר הראשי
      for (const p of PACKS) {
        if ((await db.settings.get(markerKey(p.id)))?.value === String(p.version)) continue;
        const res = await fetch(`${import.meta.env.BASE_URL}${p.file}`);
        if (!res.ok) continue;
        const pack = (await res.json()) as Pack;
        const now = Date.now();
        await db.transaction("rw", db.cards, db.categories, db.settings, async (tx) => {
          markNoSync(tx); // תוכן משותף — לא מידע אישי לסנכרון
          const haveCats = new Set(await db.categories.bulkGet(pack.categories.map((c) => c.id)).then((r) => r.filter(Boolean).map((c) => c!.id)));
          const newCats: Category[] = pack.categories
            .filter((c) => !haveCats.has(c.id))
            .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, color: null, sortOrder: c.sortOrder ?? 0 }));
          const haveCards = new Set(await db.cards.bulkGet(pack.cards.map((c) => c.id)).then((r) => r.filter(Boolean).map((c) => c!.id)));
          const newCards: Card[] = pack.cards
            .filter((c) => !haveCards.has(c.id))
            .map((c) => ({
              id: c.id,
              type: c.type,
              question: c.question,
              answer: c.answer,
              options: [],
              correctIndices: [],
              correct: null,
              categoryId: c.categoryId,
              deckIds: [],
              tags: c.tags ?? [],
              masechta: null,
              daf: null,
              amud: null,
              createdAt: now,
              updatedAt: now,
              srs: { ease: 2.5, interval: 0, repetitions: 0, dueAt: now, lastReviewedAt: null, stability: 0, difficulty: 5, lapses: 0 },
              stats: { totalReviews: 0, correct: 0, incorrect: 0 },
            }));
          if (newCats.length) await db.categories.bulkPut(newCats);
          if (newCards.length) await db.cards.bulkPut(newCards);
          await db.settings.put({ key: markerKey(p.id), value: String(p.version) });
          added += newCards.length;
        });
      }
    } catch {
      // אופליין בלי הקובץ — ננסה שוב בהפעלה הבאה
    } finally {
      running = null;
    }
    return added;
  })();
  return running;
}
