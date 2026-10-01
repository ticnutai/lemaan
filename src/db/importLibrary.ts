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
  amud?: number | string | null;
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

  /** Hebrew numeral for a daf number (2..176), e.g. 17 → "יז". */
  const hebrewDaf = (n: number): string => {
    const hundreds = ["", "ק"];
    const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
    const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    let s = hundreds[Math.floor(n / 100)] ?? "";
    const rest = n % 100;
    if (rest === 15) return s + "טו";
    if (rest === 16) return s + "טז";
    return s + tens[Math.floor(rest / 10)] + ones[rest % 10];
  };

  const catIds = new Set(seedCats.map((c) => c.id));
  const shasRootId = seedCats.find((c) => c.parentId === null && c.name === 'ש"ס')?.id ?? null;
  const NAME_ALIASES: Record<string, string> = { "נידה": "נדה", "תלמוד בבלי": 'ש"ס' };

  /** Resolve a card's category: exact cat: tag (name/id/alias), else masechta+daf, else masechta. */
  const resolveCategory = (s: SeedCard): string | null => {
    const catTag = s.tags?.find((t) => t.startsWith("cat:"));
    if (catTag) {
      const key = catTag.slice(4);
      const direct = catIdByName.get(key) ?? catIdByName.get(NAME_ALIASES[key] ?? "");
      if (direct) return direct;
      if (catIds.has(key)) return key;
      if (key === "תלמוד בבלי" && shasRootId) return shasRootId;
    }
    const masechta = NAME_ALIASES[s.masechta?.trim() ?? ""] ?? s.masechta?.trim();
    if (!masechta) return null;
    const dafNum = typeof s.daf === "number" ? s.daf : parseInt(String(s.daf ?? ""), 10);
    if (Number.isFinite(dafNum) && dafNum > 1) {
      const byDaf = catIdByName.get(`${masechta} · ${hebrewDaf(dafNum)}.`);
      if (byDaf) return byDaf;
    }
    return catIdByName.get(masechta) ?? null;
  };

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

    const categoryId = resolveCategory(s);

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
      masechta: s.masechta ? (NAME_ALIASES[s.masechta.trim()] ?? s.masechta.trim()) : null,
      daf: s.daf != null ? String(s.daf) : null,
      amud: s.amud != null ? String(s.amud) : null,
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

/**
 * השלמת שדה amud לכרטיסים שיובאו לפני שהשדה נוסף — רצה פעם אחת.
 * (בלי זה הדרילדאון עד רמת עמוד לא יציג מונים במכשירים ותיקים.)
 */
export async function ensureAmudBackfill(): Promise<void> {
  // איחוד כתיב מסכתות (נידה→נדה) — עדכון חד-פעמי מהיר גם במכשירים קיימים
  if (!(await db.settings.get("masechta-alias-fix"))?.value) {
    const fixes = await db.cards.where("masechta").equals("נידה").primaryKeys();
    if (fixes.length) await db.cards.where("masechta").equals("נידה").modify({ masechta: "נדה" });
    await db.settings.put({ key: "masechta-alias-fix", value: "1" });
  }
  if ((await db.settings.get("amud-backfill-done"))?.value) return;
  if (!(await db.settings.get("library-import-done"))?.value) return; // ימולא בייבוא עצמו
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/library.json`);
    if (!res.ok) return;
    const lib = (await res.json()) as Library;
    const amudById = new Map<string, string>();
    for (const s of lib.seed.cards) if (s.id && s.amud != null) amudById.set(s.id, String(s.amud));
    const updates: { key: string; changes: { amud: string } }[] = [];
    await db.cards.toCollection().each((c) => {
      if (c.amud == null) {
        const a = amudById.get(c.id);
        if (a) updates.push({ key: c.id, changes: { amud: a } });
      }
    });
    if (updates.length) await db.cards.bulkUpdate(updates);
    await db.settings.put({ key: "amud-backfill-done", value: "1" });
  } catch {
    // אופליין בלי קובץ — ננסה שוב בהפעלה הבאה
  }
}
