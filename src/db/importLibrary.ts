import { db } from "./index";
import { uid } from "../lib/utils";
import type { Card, CardType, Category, Deck } from "../features/study/types";

/**
 * Imports the full offline library (public/data/library.json) exported from
 * the original Lemaan app: ~22,700 cards and their category tree (~28,000
 * nodes: ש"ס / תנ"ך / טור / נביאים וכתובים / כללי).
 *
 * Card→category linkage in the source is a `cat:<full category name>` tag;
 * category names are full paths like "עבודה זרה · יז. · ע\"א".
 */

interface SeedCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder?: number;
}

interface SeedCard {
  id: string;
  question: string;
  answer?: string;
  options?: string[];
  correctIndices?: number[];
  tags?: string[];
  type?: string;
  masechta?: string | null;
  daf?: number | string | null;
  createdAt?: number;
  updatedAt?: number;
}

interface SeedDeck {
  id: string;
  name: string;
  color?: string | null;
  categoryIds?: string[];
  includeSubCategories?: boolean;
  createdAt?: number;
}

interface Library {
  version: number;
  seed: {
    categories: SeedCategory[];
    cards: SeedCard[];
    decks: SeedDeck[];
  };
}

export interface ImportProgress {
  total: number;
  done: number;
}

const VALID_TYPES = new Set<CardType>(["flashcard", "multiple", "boolean", "combo"]);

export async function importLibrary(onProgress?: (p: ImportProgress) => void): Promise<number> {
  const marker = await db.settings.get("library-import-done");
  if (marker?.value === "1") return 0;

  const res = await fetch(`${import.meta.env.BASE_URL}data/library.json`);
  if (!res.ok) throw new Error(`טעינת מאגר השאלות נכשלה (${res.status})`);
  const library: Library = await res.json();
  const { categories: seedCats, cards: seedCards, decks: seedDecks } = library.seed;

  const now = Date.now();

  const categories: Category[] = seedCats.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    color: null,
    sortOrder: c.sortOrder ?? 0,
  }));
  const catIdByName = new Map<string, string>();
  for (const c of seedCats) if (!catIdByName.has(c.name)) catIdByName.set(c.name, c.id);

  const decks: Deck[] = seedDecks.map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color ?? null,
    categoryIds: d.categoryIds ?? [],
    includeSubCategories: d.includeSubCategories ?? true,
    createdAt: d.createdAt ?? now,
  }));

  const cards: Card[] = [];
  const seen = new Set<string>();
  const total = seedCards.length;

  for (let i = 0; i < total; i++) {
    const s = seedCards[i];
    const question = s.question?.trim();
    if (!question) continue;

    const catTag = s.tags?.find((t) => t.startsWith("cat:"));
    const categoryId = catTag ? catIdByName.get(catTag.slice(4)) ?? null : null;

    const dedupeKey = `${categoryId ?? ""}|${question}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const type = (VALID_TYPES.has(s.type as CardType) ? s.type : "flashcard") as CardType;

    cards.push({
      id: s.id || uid(),
      type,
      question,
      answer: s.answer?.trim() ?? "",
      options: s.options ?? [],
      correctIndices: s.correctIndices ?? [],
      correct: null,
      categoryId,
      deckIds: [],
      tags: (s.tags ?? []).filter((t) => !t.startsWith("cat:")),
      masechta: s.masechta ?? null,
      daf: s.daf != null ? String(s.daf) : null,
      createdAt: s.createdAt ?? now,
      updatedAt: s.updatedAt ?? now,
      srs: {
        ease: 2.5,
        interval: 0,
        repetitions: 0,
        dueAt: now,
        lastReviewedAt: null,
        stability: 0,
        difficulty: 5,
        lapses: 0,
      },
      stats: { totalReviews: 0, correct: 0, incorrect: 0 },
    });

    if (i % 2000 === 0) onProgress?.({ total, done: i });
  }

  // Drop categories with no cards and no descendants with cards, except roots.
  const usedCatIds = new Set(cards.map((c) => c.categoryId).filter(Boolean) as string[]);
  for (const d of decks) d.categoryIds.forEach((id) => usedCatIds.add(id));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const keep = new Set<string>();
  for (const id of usedCatIds) {
    let cur = byId.get(id);
    while (cur && !keep.has(cur.id)) {
      keep.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  const prunedCategories = categories.filter((c) => keep.has(c.id) || c.parentId === null);

  onProgress?.({ total, done: total });

  await db.transaction("rw", db.cards, db.categories, db.decks, db.settings, async () => {
    await db.categories.bulkPut(prunedCategories);
    await db.decks.bulkPut(decks);
    await db.cards.bulkPut(cards);
    await db.settings.put({ key: "library-import-done", value: "1" });
    await db.settings.put({ key: "shas-import-done", value: "1" });
  });

  return cards.length;
}
