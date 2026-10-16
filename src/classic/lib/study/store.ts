/**
 * גשר: "useStudy" של האתר הבסיסי, על המסד של האתר שלנו.
 *
 * הרכיבים של הפריסה המקורית (src/classic) הועתקו אחד לאחד, וכולם מקבלים את הנתונים ואת הפעולות
 * מכאן — באותה צורה בדיוק כמו במקור (state + פעולות). הלוגיקה של כל פעולה הועתקה מ-store.ts
 * של המקור; רק השמירה שונה:
 *  - שאלות, קטגוריות, מבחנים, יעדים ויומן התשובות → הטבלאות של האתר שלנו (אותם נתונים כמו בפריסה הרגילה);
 *  - כל השאר (תוכניות לימוד, חזרות, תוצאות תרגול, העדפות תצוגה, פריסת הרכיבים בבית) → טבלת ההגדרות
 *    (מפתח אחד), כך שגם הם נשמרים בין כניסות ובגיבוי לענן.
 * המקור שולח כל שינוי גם לענן שלו — כאן אין צורך: הסנכרון של האתר שלנו מטפל בטבלאות.
 */
import { useEffect, useState } from "react";
import type {
  Card, Category, Deck, GeneralStudyPlan, Goal, LearningSession, PlanReview, PlanReviewQuality, PracticeResult,
  QuizAttempt, QuizPlan, ReviewLog, ShasPlan, ShasReview, StudyState, UiPrefs, WidgetLayout,
} from "./types";
import { PLAN_REVIEW_INTERVALS_DAYS } from "./types";
import { applyReview, defaultSrs, getSrsAlgorithm, getRetentionTarget } from "./srs";
import { UNCATEGORIZED_NAME, UNCATEGORIZED_TAG, findUncategorized, isUncategorized } from "./uncategorized";
import { db } from "../../../db";
import { supabase as appSupabase } from "../../../db/supabase";
import type {
  Card as AppCard, Category as AppCategory, Deck as AppDeck, Goal as AppGoal, ReviewLog as AppLog,
} from "../../../features/study/types";

// ─── מצב בזיכרון + מאזינים (כמו במקור) ─────────────────────────────────────────
const emptyState = (): StudyState => ({
  decks: [], cards: [], logs: [], categories: [], goals: [],
  shasPlan: null, notificationsEnabled: false, reminderTime: "20:00", dayNotes: [],
  shasPlans: [], activeShasPlanId: null,
  cardDecks: [], shasReviews: [], reviewIntervals: [1, 3, 7, 14, 30],
  learningSessions: [], tabConfig: [], sidebarConfig: [], widgetLayout: undefined, uiPrefs: {}, generalPlans: [], planReviews: [],
  customCategoryTemplates: [],
  quizPlans: [], quizAttempts: [], practiceResults: [],
});

let memState: StudyState = emptyState();
const listeners = new Set<() => void>();
let hydrated = false;
let hydrating: Promise<void> | null = null;
let currentUserId = "local";

/** הרשומות המקוריות שלנו לפי מזהה — כדי לשמור שדות שאין להם מקביל במקור (למשל מסנני מבחן). */
const raw = {
  cards: new Map<string, AppCard>(),
  categories: new Map<string, AppCategory>(),
  decks: new Map<string, AppDeck>(),
  goals: new Map<string, AppGoal>(),
  /** מזהה רשומה ביומן (מחרוזת, כמו במקור) ← המספר שלה אצלנו */
  logIds: new Map<string, number>(),
};

const notify = () => listeners.forEach((l) => l());

function setState(updater: (s: StudyState) => StudyState) {
  const prev = memState;
  memState = updater(memState);
  if (memState === prev) return;
  notify();
  persist(prev, memState);
}

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36));

const normalizeName = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();
const normalizeQuestionKey = (v: string | null | undefined): string => normalizeName(v).replace(/\s+/g, " ");

const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayIso = () => isoDate(new Date());

// ─── המרה: האתר שלנו ⇄ המקור ─────────────────────────────────────────────────
const CAT = "cat:";

function toOrigCard(c: AppCard, catName: (id: string | null) => string | null, decksOf: string[]): Card {
  const name = catName(c.categoryId);
  const plainTags = (c.tags ?? []).filter((t) => !t.startsWith(CAT));
  const out: Record<string, unknown> = {
    id: c.id,
    deckId: decksOf[0] ?? null,
    type: c.type,
    question: c.question,
    tags: name ? [...plainTags, `${CAT}${name}`] : plainTags,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    masechta: c.masechta ?? null,
    daf: c.daf ? parseInt(c.daf, 10) || null : null,
    amud: c.amud === "1" ? 1 : c.amud === "2" ? 2 : null,
    srs: c.srs,
    stats: c.stats,
    answer: c.answer ?? "",
    options: c.options ?? [],
    correctIndices: c.correctIndices ?? [],
  };
  if (c.correct !== null && c.correct !== undefined) out.correct = c.correct;
  const extra = c as AppCard & { explanation?: string; editHistory?: unknown };
  if (extra.explanation) out.explanation = extra.explanation;
  if (extra.editHistory) out.editHistory = extra.editHistory;
  return out as unknown as Card;
}

function toAppCard(o: Card, deckIds: string[], cats: Category[]): AppCard {
  const prev = raw.cards.get(o.id);
  const any = o as Card & { answer?: string; options?: string[]; correctIndices?: number[]; correct?: boolean; explanation?: string };
  const catTag = o.tags.find((t) => t.startsWith(CAT));
  // הקטגוריה: אם תגית הקטגוריה לא השתנתה — נשארת אותה קטגוריה (שמות יכולים לחזור בעץ)
  let categoryId = prev?.categoryId ?? null;
  const prevName = categoryId ? cats.find((c) => c.id === categoryId)?.name : null;
  const tagName = catTag ? catTag.slice(CAT.length) : null;
  if (tagName !== prevName) categoryId = tagName ? cats.find((c) => c.name === tagName)?.id ?? null : null;
  const fullSrs = { stability: 0, difficulty: 0, lapses: 0, ...o.srs };
  return {
    ...(prev ?? {}),
    id: o.id,
    type: o.type,
    question: o.question,
    answer: any.answer ?? "",
    options: any.options ?? [],
    correctIndices: any.correctIndices ?? [],
    correct: typeof any.correct === "boolean" ? any.correct : null,
    categoryId,
    deckIds,
    tags: o.tags.filter((t) => !t.startsWith(CAT)),
    masechta: o.masechta ?? null,
    daf: o.daf ? String(o.daf) : null,
    amud: o.amud === 1 ? "1" : o.amud === 2 ? "2" : null,
    createdAt: o.createdAt,
    updatedAt: Date.now(),
    srs: fullSrs as AppCard["srs"],
    stats: o.stats,
    ...(any.explanation ? { explanation: any.explanation } : {}),
  } as AppCard;
}

const toOrigCategory = (c: AppCategory): Category => ({
  id: c.id, name: c.name, parentId: c.parentId, createdAt: (c as AppCategory & { createdAt?: number }).createdAt ?? 0,
  ...(c.color ? { color: c.color } : {}), sortOrder: c.sortOrder,
});
const toAppCategory = (c: Category): AppCategory => ({
  ...(raw.categories.get(c.id) ?? {}), id: c.id, name: c.name, parentId: c.parentId, color: c.color ?? null, sortOrder: c.sortOrder ?? 0,
  createdAt: c.createdAt,
} as AppCategory);

const toOrigDeck = (d: AppDeck): Deck => ({
  id: d.id, name: d.name, description: (d as AppDeck & { description?: string }).description, color: d.color ?? "gold",
  createdAt: d.createdAt, categoryIds: d.categoryIds ?? [], includeSubCategories: d.includeSubCategories ?? true,
});
const toAppDeck = (d: Deck): AppDeck => ({
  ...(raw.decks.get(d.id) ?? { filters: [] }), id: d.id, name: d.name, color: d.color ?? null,
  categoryIds: d.categoryIds ?? [], includeSubCategories: d.includeSubCategories, createdAt: d.createdAt,
  ...(d.description ? { description: d.description } : {}),
} as AppDeck);

const toOrigGoal = (g: AppGoal): Goal => ({ active: true, ...(g as unknown as Goal) });
const toAppGoal = (g: Goal): AppGoal => ({ ...(raw.goals.get(g.id) ?? {}), ...(g as unknown as AppGoal) });

// ─── טעינה מהמסד שלנו ──────────────────────────────────────────────────────────
const EXTRAS_KEY = "classic-study-state-v1";
type Extras = Omit<StudyState, "decks" | "cards" | "logs" | "categories" | "goals" | "cardDecks">;
const EXTRA_KEYS: (keyof Extras)[] = [
  "shasPlan", "shasPlans", "activeShasPlanId", "notificationsEnabled", "reminderTime", "dayNotes", "shasReviews",
  "reviewIntervals", "planReviewIntervals", "learningSessions", "tabConfig", "sidebarConfig", "widgetLayout", "uiPrefs",
  "generalPlans", "planReviews", "customCategoryTemplates", "deckCategories", "quizPlans", "quizAttempts", "practiceResults",
];

async function hydrate(): Promise<void> {
  const [cards, categories, decks, goals, logs, extrasRow, session] = await Promise.all([
    db.cards.toArray(),
    db.categories.toArray(),
    db.decks.toArray(),
    db.goals.toArray(),
    db.reviewLogs.orderBy("at").reverse().limit(2000).toArray(),
    db.settings.get(EXTRAS_KEY),
    appSupabase.auth.getSession().then((r) => r.data.session).catch(() => null),
  ]);
  currentUserId = session?.user?.id ?? "local";
  raw.cards = new Map(cards.map((c) => [c.id, c]));
  raw.categories = new Map(categories.map((c) => [c.id, c]));
  raw.decks = new Map(decks.map((d) => [d.id, d]));
  raw.goals = new Map(goals.map((g) => [g.id, g]));
  raw.logIds = new Map();
  const catById = new Map(categories.map((c) => [c.id, c.name]));
  const catName = (id: string | null) => (id ? catById.get(id) ?? null : null);
  const cardDecks: NonNullable<StudyState["cardDecks"]> = [];
  for (const c of cards) (c.deckIds ?? []).forEach((deckId, i) => cardDecks.push({ cardId: c.id, deckId, sortOrder: i }));
  let extras: Partial<Extras> = {};
  try { extras = extrasRow?.value ? JSON.parse(extrasRow.value) : {}; } catch { extras = {}; }
  memState = {
    ...emptyState(),
    ...extras,
    cards: cards.map((c) => toOrigCard(c, catName, c.deckIds ?? [])),
    categories: categories.map(toOrigCategory),
    decks: decks.map(toOrigDeck),
    goals: goals.map(toOrigGoal),
    logs: logs.map((l) => {
      const id = `log-${l.id}`;
      if (l.id !== undefined) raw.logIds.set(id, l.id);
      return { id, cardId: l.cardId, deckId: null, at: l.at, quality: l.quality, correct: l.correct, durationMs: l.durationMs };
    }),
    cardDecks,
  };
  hydrated = true;
  notify();
}

function ensureHydrated(force = false) {
  if (hydrating) return hydrating;
  if (hydrated && !force) return Promise.resolve();
  hydrating = hydrate().finally(() => { hydrating = null; });
  return hydrating;
}

// ─── שמירה: רק מה שהשתנה ─────────────────────────────────────────────────────
let extrasTimer: ReturnType<typeof setTimeout> | null = null;

function diff<T extends { id: string }>(prev: T[] | undefined, next: T[] | undefined) {
  const before = new Map((prev ?? []).map((x) => [x.id, x]));
  const changed: T[] = [];
  const nextIds = new Set<string>();
  for (const x of next ?? []) {
    nextIds.add(x.id);
    if (before.get(x.id) !== x) changed.push(x);
  }
  const removed = [...before.keys()].filter((id) => !nextIds.has(id));
  return { changed, removed };
}

function persist(prev: StudyState, next: StudyState) {
  if (!hydrated) return;
  // קישורי שאלה ⇄ מבחן: אצלנו הם חלק מהשאלה (deckIds)
  const deckCardsChanged = new Set<string>();
  if (prev.cardDecks !== next.cardDecks) {
    const key = (l: { cardId: string; deckId: string }) => `${l.cardId}\u0000${l.deckId}`;
    const a = new Set((prev.cardDecks ?? []).map(key));
    const b = new Set((next.cardDecks ?? []).map(key));
    for (const k of a) if (!b.has(k)) deckCardsChanged.add(k.split("\u0000")[0]);
    for (const k of b) if (!a.has(k)) deckCardsChanged.add(k.split("\u0000")[0]);
  }
  const decksByCard = () => {
    const m = new Map<string, string[]>();
    for (const l of [...(next.cardDecks ?? [])].sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0))) {
      const list = m.get(l.cardId) ?? [];
      if (!list.includes(l.deckId)) list.push(l.deckId);
      m.set(l.cardId, list);
    }
    return m;
  };

  if (prev.cards !== next.cards || deckCardsChanged.size) {
    const { changed, removed } = prev.cards !== next.cards ? diff(prev.cards, next.cards) : { changed: [] as Card[], removed: [] as string[] };
    const ids = new Set(changed.map((c) => c.id));
    for (const id of deckCardsChanged) {
      if (ids.has(id)) continue;
      const c = next.cards.find((x) => x.id === id);
      if (c) { changed.push(c); ids.add(id); }
    }
    if (changed.length) {
      const m = decksByCard();
      const cats = next.categories ?? [];
      const rows = changed.map((c) => toAppCard(c, m.get(c.id) ?? (c.deckId ? [c.deckId] : []), cats));
      rows.forEach((r) => raw.cards.set(r.id, r));
      void db.cards.bulkPut(rows);
    }
    if (removed.length) {
      removed.forEach((id) => raw.cards.delete(id));
      void db.cards.bulkDelete(removed);
    }
  }
  if (prev.categories !== next.categories) {
    const { changed, removed } = diff(prev.categories, next.categories);
    const rows = changed.map(toAppCategory);
    rows.forEach((r) => raw.categories.set(r.id, r));
    if (rows.length) void db.categories.bulkPut(rows);
    if (removed.length) void db.categories.bulkDelete(removed);
  }
  if (prev.decks !== next.decks) {
    const { changed, removed } = diff(prev.decks, next.decks);
    const rows = changed.map(toAppDeck);
    rows.forEach((r) => raw.decks.set(r.id, r));
    if (rows.length) void db.decks.bulkPut(rows);
    if (removed.length) void db.decks.bulkDelete(removed);
  }
  if (prev.goals !== next.goals) {
    const { changed, removed } = diff(prev.goals, next.goals);
    const rows = changed.map(toAppGoal);
    rows.forEach((r) => raw.goals.set(r.id, r));
    if (rows.length) void db.goals.bulkPut(rows);
    if (removed.length) void db.goals.bulkDelete(removed);
  }
  if (prev.logs !== next.logs) {
    const { changed, removed } = diff(prev.logs, next.logs);
    for (const l of changed) {
      if (raw.logIds.has(l.id)) continue;
      const row: AppLog = { cardId: l.cardId, at: l.at, quality: l.quality, correct: l.correct, durationMs: l.durationMs };
      void db.reviewLogs.add(row).then((n) => raw.logIds.set(l.id, n as number));
    }
    const nums = removed.map((id) => raw.logIds.get(id)).filter((n): n is number => n !== undefined);
    if (nums.length) void db.reviewLogs.bulkDelete(nums);
  }
  if (EXTRA_KEYS.some((k) => prev[k] !== next[k])) {
    if (extrasTimer) clearTimeout(extrasTimer);
    extrasTimer = setTimeout(() => {
      const out: Partial<Extras> = {};
      for (const k of EXTRA_KEYS) (out as Record<string, unknown>)[k] = memState[k];
      void db.settings.put({ key: EXTRAS_KEY, value: JSON.stringify(out) });
    }, 300);
  }
}

// ─── הפעולות (הלוגיקה מהמקור) ────────────────────────────────────────────────
const requireUser = () => currentUserId;

const ensureUncategorized = (): string => {
  const existing = findUncategorized(memState.categories);
  if (existing) return existing.id;
  const cat: Category = { id: uid(), name: UNCATEGORIZED_NAME, parentId: null, createdAt: Date.now() };
  setState((s) => ({ ...s, categories: [...(s.categories ?? []), cat] }));
  return cat.id;
};

const actions = {
  // === מבחנים ===
  addDeck: (name: string, description?: string, categoryNames?: string[]) => {
    let cats = Array.isArray(categoryNames) ? categoryNames.slice() : [];
    if (cats.length === 0) { ensureUncategorized(); cats = [UNCATEGORIZED_NAME]; }
    const deck: Deck = { id: uid(), name, description, color: "gold", createdAt: Date.now(), categoryIds: [], includeSubCategories: true };
    setState((s) => ({ ...s, decks: [...s.decks, deck], deckCategories: { ...(s.deckCategories ?? {}), [deck.id]: cats } }));
    return deck;
  },
  deleteDeck: (id: string) => {
    setState((s) => {
      const nextDC = { ...(s.deckCategories ?? {}) };
      delete nextDC[id];
      return {
        ...s,
        decks: s.decks.filter((d) => d.id !== id),
        cardDecks: (s.cardDecks ?? []).filter((cd) => cd.deckId !== id),
        cards: s.cards.map((c) => c.deckId === id ? { ...c, deckId: null } as Card : c),
        deckCategories: nextDC,
      };
    });
  },
  updateDeckCategoryIds: (deckId: string, categoryIds: string[], includeSubCategories: boolean) => {
    setState((s) => ({ ...s, decks: s.decks.map((d) => d.id === deckId ? { ...d, categoryIds, includeSubCategories } : d) }));
  },
  setDeckCategories: (deckId: string, categoryNames: string[]) => {
    setState((s) => ({ ...s, deckCategories: { ...(s.deckCategories ?? {}), [deckId]: categoryNames.slice() } }));
  },
  renameDeck: (deckId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) => ({ ...s, decks: s.decks.map((d) => (d.id === deckId ? { ...d, name: trimmed } : d)) }));
  },

  // === שאלות ===
  addCard: (card: Omit<Card, "id" | "createdAt" | "srs" | "stats">) => {
    const questionKey = normalizeQuestionKey(card.question);
    const existing = memState.cards.find((c) => normalizeQuestionKey(c.question) === questionKey);
    if (existing) return existing;
    const tags = Array.isArray(card.tags) ? [...card.tags] : [];
    if (!tags.some((t) => t.startsWith(CAT))) { ensureUncategorized(); tags.push(UNCATEGORIZED_TAG); }
    const full = { ...card, tags, id: uid(), createdAt: Date.now(), srs: defaultSrs(), stats: { totalReviews: 0, correct: 0, incorrect: 0 } } as Card;
    setState((s) => ({ ...s, cards: [...s.cards, full] }));
    if (full.deckId) {
      setState((s) => ({ ...s, cardDecks: [...(s.cardDecks ?? []), { cardId: full.id, deckId: full.deckId!, sortOrder: 0 }] }));
    }
    return full;
  },
  updateCard: (id: string, patch: Partial<Card>) => {
    setState((s) => ({ ...s, cards: s.cards.map((c) => (c.id !== id ? c : ({ ...c, ...patch } as Card))) }));
    return true;
  },
  duplicateCard: (id: string, targetDeckId?: string) => {
    setState((s) => {
      const orig = s.cards.find((c) => c.id === id);
      if (!orig) return s;
      const copy = { ...orig, id: uid(), published: false, deckId: targetDeckId ?? orig.deckId, createdAt: Date.now(), srs: defaultSrs(), stats: { totalReviews: 0, correct: 0, incorrect: 0 } } as Card;
      return { ...s, cards: [...s.cards, copy] };
    });
  },
  deleteCard: (id: string) => {
    setState((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id), cardDecks: (s.cardDecks ?? []).filter((l) => l.cardId !== id) }));
  },
  forkSourceCard: async (_id: string, _opts?: { patch?: Partial<Card>; note?: string }): Promise<string | null> => null,
  isCardFromSource: (_id: string) => false,
  setCardCategories: (cardId: string, categoryNames: string[]) => {
    setState((s) => ({
      ...s,
      cards: s.cards.map((c) => {
        if (c.id !== cardId) return c;
        const plain = c.tags.filter((t) => !t.startsWith(CAT));
        return { ...c, tags: [...plain, ...categoryNames.map((n) => `${CAT}${n}`)] } as Card;
      }),
    }));
  },

  // === תשובה (חזרה מרווחת) ===
  reviewCard: (cardId: string, quality: 0 | 1 | 2 | 3 | 4 | 5, durationMs: number, useSrs: boolean, customDueAt?: number) => {
    const correct = quality >= 3;
    const algo = getSrsAlgorithm(currentUserId);
    const retention = getRetentionTarget(currentUserId);
    let prevSrs: Card["srs"] | undefined;
    let prevStats: Card["stats"] | undefined;
    let logEntry: ReviewLog | undefined;
    setState((s) => {
      const cards = s.cards.map((c) => {
        if (c.id !== cardId) return c;
        prevSrs = c.srs;
        prevStats = c.stats;
        const baseSrs = useSrs ? applyReview(c, quality, algo, retention) : c.srs;
        const finalSrs = (customDueAt && useSrs) ? { ...baseSrs, dueAt: customDueAt, lastReviewedAt: Date.now() } : baseSrs;
        return {
          ...c,
          srs: finalSrs,
          stats: {
            totalReviews: c.stats.totalReviews + 1,
            correct: c.stats.correct + (correct ? 1 : 0),
            incorrect: c.stats.incorrect + (correct ? 0 : 1),
          },
        } as Card;
      });
      const card = s.cards.find((c) => c.id === cardId);
      logEntry = { id: uid(), cardId, deckId: card?.deckId ?? null, at: Date.now(), quality, correct, durationMs };
      return { ...s, cards, logs: [logEntry, ...s.logs].slice(0, 2000) };
    });
    return { logId: logEntry?.id, prevSrs, prevStats };
  },
  undoReview: (cardId: string, prevSrs: Card["srs"], prevStats: Card["stats"], logId?: string) => {
    setState((s) => ({
      ...s,
      cards: s.cards.map((c) => c.id === cardId ? { ...c, srs: prevSrs, stats: prevStats } : c),
      logs: logId ? s.logs.filter((l) => l.id !== logId) : s.logs,
    }));
  },
  deleteReviewLog: (logId: string) => {
    setState((s) => {
      const log = s.logs.find((l) => l.id === logId);
      if (!log) return s;
      const cards = s.cards.map((c) => c.id !== log.cardId ? c : {
        ...c,
        stats: {
          totalReviews: Math.max(0, c.stats.totalReviews - 1),
          correct: Math.max(0, c.stats.correct - (log.correct ? 1 : 0)),
          incorrect: Math.max(0, c.stats.incorrect - (log.correct ? 0 : 1)),
        },
      });
      return { ...s, cards, logs: s.logs.filter((l) => l.id !== logId) };
    });
  },

  // === קטגוריות ===
  addCategory: (name: string, parentId: string | null = null) => {
    const cat: Category = { id: uid(), name, parentId, createdAt: Date.now() };
    setState((s) => ({ ...s, categories: [...(s.categories ?? []), cat] }));
    return cat;
  },
  addCategoriesBulk: (nodes: { name: string; children?: unknown[] }[], parentId: string | null = null) => {
    type Node = { name: string; children?: Node[] };
    if (!nodes.length) return 0;
    const makeKey = (pid: string | null, name: string) => `${pid ?? "__root__"}\u0000${name}`;
    const created: Category[] = [];
    const existingByKey = new Map<string, Category>();
    for (const c of memState.categories ?? []) existingByKey.set(makeKey(c.parentId, c.name), c);
    const queue: Array<{ node: Node; pid: string | null }> = (nodes as Node[]).map((node) => ({ node, pid: parentId }));
    for (let i = 0; i < queue.length; i++) {
      const { node, pid } = queue[i];
      const key = makeKey(pid, node.name);
      let cat = existingByKey.get(key);
      if (!cat) {
        cat = { id: uid(), name: node.name, parentId: pid, createdAt: Date.now() };
        created.push(cat);
        existingByKey.set(key, cat);
      }
      for (const child of node.children ?? []) queue.push({ node: child, pid: cat.id });
    }
    if (created.length === 0) return 0;
    setState((s) => ({ ...s, categories: [...(s.categories ?? []), ...created] }));
    return created.length;
  },
  deleteCategory: (id: string) => {
    const target = (memState.categories ?? []).find((c) => c.id === id);
    if (target && isUncategorized(target)) return;
    setState((s) => {
      const cats = s.categories ?? [];
      const toRemove = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        cats.forEach((c) => {
          if (c.parentId && toRemove.has(c.parentId) && !toRemove.has(c.id)) { toRemove.add(c.id); changed = true; }
        });
      }
      const removedNames = new Set(cats.filter((c) => toRemove.has(c.id)).map((c) => `${CAT}${c.name}`));
      const newCards = s.cards.map((card) => {
        const filtered = card.tags.filter((t) => !removedNames.has(t));
        return filtered.length === card.tags.length ? card : { ...card, tags: filtered };
      });
      return { ...s, categories: cats.filter((c) => !toRemove.has(c.id)), cards: newCards };
    });
  },
  ensureUncategorized,

  // === יעדים ===
  addGoal: (goal: Omit<Goal, "id" | "createdAt" | "active">) => {
    const full: Goal = { ...goal, id: uid(), createdAt: Date.now(), active: true };
    setState((s) => ({ ...s, goals: [...(s.goals ?? []), full] }));
    return full;
  },
  updateGoal: (id: string, patch: Partial<Goal>) => {
    setState((s) => ({ ...s, goals: (s.goals ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  },
  deleteGoal: (id: string) => {
    setState((s) => ({ ...s, goals: (s.goals ?? []).filter((g) => g.id !== id) }));
  },
  toggleGoalDate: (id: string, dateKey: string) => {
    setState((s) => ({
      ...s,
      goals: (s.goals ?? []).map((g) => {
        if (g.id !== id) return g;
        const dates = new Set(g.manualDoneDates ?? []);
        if (dates.has(dateKey)) dates.delete(dateKey); else dates.add(dateKey);
        return { ...g, manualDoneDates: Array.from(dates) };
      }),
    }));
  },

  // === תוכנית ש"ס ===
  setShasPlan: (
    selectedMasechtos: string[], pagesPerDay: number, unit: ShasPlan["unit"] = "daf", startMasechta?: string, startDaf?: number,
    skipWeekdays?: number[], skipDates?: string[], anchorDate?: string, anchorPosition?: ShasPlan["anchorPosition"],
  ) => {
    const first = startMasechta ?? selectedMasechtos[0];
    const planName = selectedMasechtos.length > 1 ? `${selectedMasechtos[0]} +${selectedMasechtos.length - 1}` : (selectedMasechtos[0] ?? 'ש"ס');
    const plan: ShasPlan = {
      id: uid(), selectedMasechtos, pagesPerDay, startDate: Date.now(), name: planName, unit,
      currentMasechta: first, currentDaf: startDaf ?? 2, currentAmud: 1, currentHalf: 1, completed: [],
      ...(skipWeekdays?.length ? { skipWeekdays } : {}),
      ...(skipDates?.length ? { skipDates } : {}),
      ...(anchorDate ? { anchorDate } : {}),
      ...(anchorPosition ? { anchorPosition } : {}),
    };
    const nextPlans = [...(memState.shasPlans ?? []), plan];
    setState((s) => ({ ...s, shasPlan: plan, shasPlans: nextPlans, activeShasPlanId: plan.id }));
    return plan;
  },
  setDayNote: (date: string, text: string) => {
    const trimmed = text.trim();
    setState((s) => {
      const notes = s.dayNotes ?? [];
      if (!trimmed) return { ...s, dayNotes: notes.filter((n) => n.date !== date) };
      const exists = notes.some((n) => n.date === date);
      const updated = exists
        ? notes.map((n) => (n.date === date ? { ...n, text: trimmed, updatedAt: Date.now() } : n))
        : [...notes, { date, text: trimmed, updatedAt: Date.now() }];
      return { ...s, dayNotes: updated };
    });
  },

  // === שאלה ⇄ מבחן ===
  addCardToDeck: (cardId: string, deckId: string) => {
    const sortOrder = (memState.cardDecks ?? []).reduce((max, link) => link.deckId === deckId ? Math.max(max, link.sortOrder ?? 0) : max, -1) + 1;
    setState((s) => {
      const links = s.cardDecks ?? [];
      if (links.some((l) => l.cardId === cardId && l.deckId === deckId)) return s;
      return { ...s, cardDecks: [...links, { cardId, deckId, sortOrder }] };
    });
  },
  addCardsToDeck: (cardIds: string[], deckId: string) => {
    const existing = new Set((memState.cardDecks ?? []).filter((l) => l.deckId === deckId).map((l) => l.cardId));
    const missing = [...new Set(cardIds)].filter((id) => id && !existing.has(id));
    if (!missing.length) return;
    const first = (memState.cardDecks ?? []).reduce((max, l) => l.deckId === deckId ? Math.max(max, l.sortOrder ?? 0) : max, -1) + 1;
    setState((s) => ({ ...s, cardDecks: [...(s.cardDecks ?? []), ...missing.map((cardId, i) => ({ cardId, deckId, sortOrder: first + i }))] }));
  },
  removeCardFromDeck: (cardId: string, deckId: string) => {
    setState((s) => ({ ...s, cardDecks: (s.cardDecks ?? []).filter((l) => !(l.cardId === cardId && l.deckId === deckId)) }));
  },
  setCardDecks: (cardId: string, deckIds: string[]) => {
    setState((s) => {
      const others = (s.cardDecks ?? []).filter((l) => l.cardId !== cardId);
      return { ...s, cardDecks: [...others, ...deckIds.map((deckId, i) => ({ cardId, deckId, sortOrder: i }))] };
    });
  },

  // === חזרות ש"ס ===
  markShasReviewDone: (id: string, dateKey?: string) => {
    const day = dateKey ?? todayIso();
    setState((s) => ({ ...s, shasReviews: (s.shasReviews ?? []).map((r) => r.id === id ? { ...r, doneAt: day } : r) }));
  },
  unmarkShasReviewDone: (id: string) => {
    setState((s) => ({ ...s, shasReviews: (s.shasReviews ?? []).map((r) => r.id === id ? { ...r, doneAt: null } : r) }));
  },
  rescheduleShasReview: (id: string, newDueDate: string) => {
    setState((s) => ({ ...s, shasReviews: (s.shasReviews ?? []).map((r) => r.id === id ? { ...r, dueDate: newDueDate } : r) }));
  },
  setShasReviewNote: (id: string, note: string) => {
    const v = note.trim() || null;
    setState((s) => ({ ...s, shasReviews: (s.shasReviews ?? []).map((r) => r.id === id ? { ...r, note: v } : r) }));
  },
  deleteShasReview: (id: string) => {
    setState((s) => ({ ...s, shasReviews: (s.shasReviews ?? []).filter((r) => r.id !== id) }));
  },
  addManualShasReview: (args: {
    masechta: string; daf: number; amud: 1 | 2; half?: 1 | 2 | null; unit: ShasReview["unit"]; dueDate: string;
    doneAt?: string | null; isInitial?: boolean; reviewIndex?: number; note?: string;
  }) => {
    const r: ShasReview = {
      id: uid(), masechta: args.masechta, daf: args.daf, amud: args.amud, half: args.half ?? null, unit: args.unit,
      reviewIndex: args.reviewIndex ?? 1, dueDate: args.dueDate, doneAt: args.doneAt ?? null,
      isInitial: !!args.isInitial, note: args.note?.trim() || null,
    };
    setState((s) => ({ ...s, shasReviews: [...(s.shasReviews ?? []), r] }));
    return r;
  },
  setReviewIntervals: (intervals: number[]) => {
    const cleaned = intervals.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    setState((s) => ({ ...s, reviewIntervals: cleaned }));
  },
  setPlanReviewIntervals: (intervals: number[]) => {
    const cleaned = intervals.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    if (cleaned.length === 0) return;
    setState((s) => ({ ...s, planReviewIntervals: cleaned }));
  },

  // === מפגשי לימוד ===
  addLearningSession: (args: {
    date: string; subject: string; sessionType: "initial" | "review"; quality: 1 | 2 | 3 | 4 | 5;
    durationMinutes?: number; note?: string; nextReviewDate?: string | null; reviewNumber?: number;
  }) => {
    const session: LearningSession = {
      id: uid(), date: args.date, subject: args.subject.trim(), sessionType: args.sessionType, quality: args.quality,
      durationMinutes: args.durationMinutes, note: args.note?.trim() || undefined, nextReviewDate: args.nextReviewDate ?? null,
      reviewNumber: args.reviewNumber ?? 1, createdAt: Date.now(),
    };
    setState((s) => ({ ...s, learningSessions: [session, ...(s.learningSessions ?? [])] }));
    return session;
  },
  updateLearningSession: (id: string, patch: Partial<LearningSession>) => {
    setState((s) => ({ ...s, learningSessions: (s.learningSessions ?? []).map((r) => r.id === id ? { ...r, ...patch } : r) }));
  },
  deleteLearningSession: (id: string) => {
    setState((s) => ({ ...s, learningSessions: (s.learningSessions ?? []).filter((r) => r.id !== id) }));
  },

  // === תצוגה ===
  setWidgetLayout: (layout: WidgetLayout) => setState((s) => ({ ...s, widgetLayout: layout })),
  _applyPreviewLayout: () => {},
  setTabConfig: (tabs: StudyState["tabConfig"]) => setState((s) => ({ ...s, tabConfig: tabs })),
  setSidebarConfig: (sidebar: StudyState["sidebarConfig"]) => setState((s) => ({ ...s, sidebarConfig: sidebar })),
  setUiPref: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => {
    const next: UiPrefs = { ...(memState.uiPrefs ?? {}), [key]: value, updatedAt: Date.now() };
    setState((s) => ({ ...s, uiPrefs: next }));
  },
  setNotificationsEnabled: (enabled: boolean) => setState((s) => ({ ...s, notificationsEnabled: enabled })),
  setReminderTime: (time: string) => setState((s) => ({ ...s, reminderTime: time })),

  // === תוכניות לימוד ===
  addMasecthaReviewPlan: (
    title: string, units: string[], reviewScheduleType: "srs" | "fixed_interval" | "manual", fixedIntervalDays?: number,
    manualReviewDates?: string[], linkedDeckId?: string, reviewScopeType?: "masechta" | "perek" | "daf_range" | "custom", reviewScopeDetail?: string,
  ) => {
    const todayStr = todayIso();
    const newPlan: GeneralStudyPlan = {
      id: uid(), planType: "masechta_review", title, units, unitsPerDay: 1, startDate: Date.now(), completedUnits: [],
      reviewScheduleType, fixedIntervalDays, manualReviewDates, linkedDeckId, reviewScopeType, reviewScopeDetail,
    };
    setState((s) => ({ ...s, generalPlans: [...(s.generalPlans ?? []), newPlan] }));
    const newReviews: PlanReview[] = [];
    if (reviewScheduleType === "manual" && manualReviewDates?.length) {
      units.forEach((unit) => manualReviewDates.forEach((dueDate, i) => newReviews.push({
        id: uid(), planId: newPlan.id, planTitle: title, unit, dueDate, doneAt: null, reviewIndex: i + 1, createdAt: Date.now(),
      })));
    } else {
      units.forEach((unit) => newReviews.push({
        id: uid(), planId: newPlan.id, planTitle: title, unit, dueDate: todayStr, doneAt: null, reviewIndex: 1, createdAt: Date.now(),
      }));
    }
    if (newReviews.length > 0) setState((s) => ({ ...s, planReviews: [...(s.planReviews ?? []), ...newReviews] }));
  },
  addDeckReviewPlan: (title: string, deckIds: string[], _opts?: Partial<GeneralStudyPlan>) => {
    const deckMap = Object.fromEntries((memState.decks ?? []).map((d) => [d.id, d.name]));
    const newPlan: GeneralStudyPlan = {
      id: uid(), planType: "deck_review", title, units: deckIds.map((id) => deckMap[id] ?? id), deckIds,
      unitsPerDay: 1, startDate: Date.now(), completedUnits: [],
    };
    setState((s) => ({ ...s, generalPlans: [...(s.generalPlans ?? []), newPlan] }));
  },
  addGeneralPlan: (plan: Omit<GeneralStudyPlan, "id" | "startDate" | "completedUnits">) => {
    const newPlan: GeneralStudyPlan = { ...plan, id: uid(), startDate: Date.now(), completedUnits: [] };
    setState((s) => ({ ...s, generalPlans: [...(s.generalPlans ?? []), newPlan] }));
    return newPlan;
  },
  deleteGeneralPlan: (planId: string, _opts?: { purgeHistory?: boolean }) => {
    setState((s) => ({ ...s, generalPlans: (s.generalPlans ?? []).filter((p) => p.id !== planId) }));
  },
  updateGeneralPlan: (planId: string, patch: Partial<Omit<GeneralStudyPlan, "id" | "startDate" | "completedUnits">>) => {
    setState((s) => ({ ...s, generalPlans: (s.generalPlans ?? []).map((p) => p.id === planId ? { ...p, ...patch } : p) }));
  },
  completeGeneralPlanUnit: (planId: string, unit: string, _isoDate?: string) => {
    const plan = (memState.generalPlans ?? []).find((p) => p.id === planId);
    const alreadyDone = plan?.completedUnits.includes(unit) ?? false;
    setState((s) => ({
      ...s,
      generalPlans: (s.generalPlans ?? []).map((p) => p.id !== planId ? p : { ...p, completedUnits: alreadyDone ? p.completedUnits : [...p.completedUnits, unit] }),
    }));
    if (!alreadyDone && plan) {
      const today = new Date();
      const session: LearningSession = {
        id: uid(), date: isoDate(today), subject: `${plan.title} — ${unit}`, sessionType: "initial", quality: 5,
        durationMinutes: undefined, note: undefined, nextReviewDate: null, reviewNumber: 1, createdAt: Date.now(),
      };
      setState((s) => ({ ...s, learningSessions: [session, ...(s.learningSessions ?? [])] }));
      const reviewScheduleType = plan.reviewScheduleType ?? "srs";
      let newReviews: PlanReview[] = [];
      if (!(reviewScheduleType === "manual" && plan.manualReviewDates?.length)) {
        let intervals: number[];
        if (reviewScheduleType === "fixed_interval") {
          const d = plan.fixedIntervalDays ?? 30;
          intervals = [d, d * 2, d * 3, d * 4, d * 5];
        } else {
          intervals = (memState.planReviewIntervals && memState.planReviewIntervals.length) ? memState.planReviewIntervals : [...PLAN_REVIEW_INTERVALS_DAYS];
        }
        newReviews = intervals.map((days, i) => {
          const due = new Date(today);
          due.setDate(due.getDate() + days);
          return { id: uid(), planId, planTitle: plan.title, unit, dueDate: isoDate(due), doneAt: null, reviewIndex: i + 1, createdAt: Date.now() };
        });
      }
      setState((s) => ({ ...s, planReviews: [...(s.planReviews ?? []), ...newReviews] }));
    }
  },
  undoLastGeneralPlanUnit: (planId: string) => {
    const plan = (memState.generalPlans ?? []).find((p) => p.id === planId);
    const lastUnit = plan?.completedUnits[plan.completedUnits.length - 1];
    setState((s) => ({ ...s, generalPlans: (s.generalPlans ?? []).map((p) => p.id !== planId ? p : { ...p, completedUnits: p.completedUnits.slice(0, -1) }) }));
    if (plan && lastUnit) {
      const targetSubject = `${plan.title} — ${lastUnit}`;
      const match = [...(memState.learningSessions ?? [])]
        .filter((s) => s.subject === targetSubject && s.sessionType === "initial")
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (match) setState((s) => ({ ...s, learningSessions: (s.learningSessions ?? []).filter((r) => r.id !== match.id) }));
      setState((s) => ({ ...s, planReviews: (s.planReviews ?? []).filter((r) => !(r.planId === planId && r.unit === lastUnit)) }));
    }
  },
  setGeneralPlanProgressTo: (planId: string, targetCount: number): void => {
    const plan = (memState.generalPlans ?? []).find((p) => p.id === planId);
    if (!plan) return;
    const target = Math.max(0, Math.min(targetCount, plan.units.length));
    const current = plan.completedUnits.length;
    if (target > current) for (let i = current; i < target; i++) actions.completeGeneralPlanUnit(planId, plan.units[i]);
    else for (let i = 0; i < current - target; i++) actions.undoLastGeneralPlanUnit(planId);
  },
  uncompleteSpecificUnit: (planId: string, unit: string): void => {
    setState((s) => ({ ...s, generalPlans: (s.generalPlans ?? []).map((p) => p.id !== planId ? p : { ...p, completedUnits: p.completedUnits.filter((u) => u !== unit) }) }));
  },
  setPlanUnitNote: (planId: string, unit: string, note: string): void => {
    setState((s) => ({
      ...s,
      generalPlans: (s.generalPlans ?? []).map((p) => {
        if (p.id !== planId) return p;
        const next = { ...(p.unitNotes ?? {}) };
        const trimmed = note.trim();
        if (trimmed) next[unit] = trimmed; else delete next[unit];
        return { ...p, unitNotes: next };
      }),
    }));
  },
  reschedulePlanReviews: (_planId: string): void => {},
  archiveGeneralPlan: (planId: string): void => {
    setState((s) => ({ ...s, generalPlans: (s.generalPlans ?? []).map((p) => p.id === planId ? { ...p, archivedAt: Date.now() } : p) }));
  },
  unarchiveGeneralPlan: (planId: string): void => {
    setState((s) => ({ ...s, generalPlans: (s.generalPlans ?? []).map((p) => p.id === planId ? { ...p, archivedAt: undefined } : p) }));
  },

  // === חזרות על תוכניות ===
  markPlanReviewDone: (reviewId: string, quality: PlanReviewQuality = 3) => {
    const today = new Date();
    const todayStr = isoDate(today);
    const allReviews = memState.planReviews ?? [];
    const target = allReviews.find((r) => r.id === reviewId);
    if (!target) return;
    let updated = allReviews.map((r) => r.id === reviewId ? { ...r, doneAt: todayStr, quality } : r);
    const plan = (memState.generalPlans ?? []).find((p) => p.id === target.planId);
    const reviewScheduleType = plan?.reviewScheduleType ?? "srs";
    if (reviewScheduleType === "manual") { setState((s) => ({ ...s, planReviews: updated })); return; }
    const nextIndex = quality === 1 ? target.reviewIndex : target.reviewIndex + 1;
    const intervalsList = (memState.planReviewIntervals && memState.planReviewIntervals.length) ? memState.planReviewIntervals : [...PLAN_REVIEW_INTERVALS_DAYS];
    let intervalDays: number;
    if (reviewScheduleType === "fixed_interval") {
      const fixedDays = plan?.fixedIntervalDays ?? 30;
      const qualityMult = quality === 1 ? 0.1 : quality === 2 ? 0.7 : quality === 4 ? 1.3 : 1.0;
      intervalDays = Math.max(1, Math.round(fixedDays * qualityMult));
    } else {
      const baseDays = nextIndex <= intervalsList.length ? intervalsList[nextIndex - 1] : Math.round(intervalsList[intervalsList.length - 1] * 1.5);
      const qualityMultiplier = quality === 1 ? 0.05 : quality === 2 ? 0.7 : quality === 4 ? 1.4 : 1.0;
      intervalDays = Math.max(1, Math.round(baseDays * qualityMultiplier));
    }
    if (intervalDays >= 3) {
      const dayStr = (days: number) => isoDate(new Date(today.getTime() + days * 86_400_000));
      const dayLoad = updated.filter((r) => r.dueDate === dayStr(intervalDays) && !r.doneAt).length;
      if (dayLoad > 5) {
        let bestDelta = 0;
        let bestLoad = dayLoad;
        for (const delta of [-2, -1, 1, 2]) {
          const altDays = intervalDays + delta;
          if (altDays < 1) continue;
          const load = updated.filter((r) => r.dueDate === dayStr(altDays) && !r.doneAt).length;
          if (load < bestLoad) { bestLoad = load; bestDelta = delta; }
        }
        intervalDays += bestDelta;
      }
    }
    const isMastered = reviewScheduleType === "srs" && quality === 4 && target.reviewIndex >= intervalsList.length;
    if (!isMastered) {
      updated = [...updated, {
        id: uid(), planId: target.planId, planTitle: target.planTitle, unit: target.unit,
        dueDate: isoDate(new Date(today.getTime() + intervalDays * 86_400_000)), doneAt: null, reviewIndex: nextIndex, createdAt: Date.now(),
      }];
    }
    setState((s) => ({ ...s, planReviews: updated }));
  },
  undoPlanReviewDone: (reviewId: string) => {
    const target = (memState.planReviews ?? []).find((r) => r.id === reviewId);
    let updated = (memState.planReviews ?? []).map((r) => r.id === reviewId ? { ...r, doneAt: null, quality: undefined } : r);
    if (target?.doneAt) {
      const candidates = updated
        .filter((r) => r.planId === target.planId && r.unit === target.unit && r.id !== reviewId && !r.doneAt && r.reviewIndex >= target.reviewIndex)
        .sort((a, b) => b.createdAt - a.createdAt);
      if (candidates.length > 0) updated = updated.filter((r) => r.id !== candidates[0].id);
    }
    setState((s) => ({ ...s, planReviews: updated }));
  },
  postponePlanReview: (reviewId: string, days: number = 1) => {
    const safeDays = Math.max(1, Math.round(days));
    setState((s) => ({
      ...s,
      planReviews: (s.planReviews ?? []).map((r) => {
        if (r.id !== reviewId) return r;
        const base = new Date(r.dueDate + "T00:00:00");
        base.setDate(base.getDate() + safeDays);
        return { ...r, dueDate: isoDate(base) };
      }),
    }));
  },
  setPlanReviewNote: (reviewId: string, note: string) => {
    const trimmed = note.trim();
    setState((s) => ({ ...s, planReviews: (s.planReviews ?? []).map((r) => r.id === reviewId ? { ...r, note: trimmed || undefined } : r) }));
  },

  // === מבחנים מתוכננים ותוצאות ===
  addQuizPlan: (plan: Omit<QuizPlan, "id" | "createdAt">) => {
    const newPlan: QuizPlan = { ...plan, id: uid(), createdAt: Date.now() };
    setState((s) => ({ ...s, quizPlans: [...(s.quizPlans ?? []), newPlan] }));
    return newPlan;
  },
  updateQuizPlan: (id: string, patch: Partial<Omit<QuizPlan, "id" | "createdAt">>) => {
    setState((s) => ({ ...s, quizPlans: (s.quizPlans ?? []).map((p) => p.id === id ? { ...p, ...patch } : p) }));
  },
  deleteQuizPlan: (id: string) => setState((s) => ({ ...s, quizPlans: (s.quizPlans ?? []).filter((p) => p.id !== id) })),
  setActiveQuizPlan: (id: string, active: boolean) => {
    setState((s) => ({ ...s, quizPlans: (s.quizPlans ?? []).map((p) => p.id === id ? { ...p, isActive: active } : p) }));
  },
  addQuizAttempt: (attempt: Omit<QuizAttempt, "id">) => {
    const newAttempt: QuizAttempt = { ...attempt, id: uid() };
    setState((s) => ({ ...s, quizAttempts: [...(s.quizAttempts ?? []), newAttempt] }));
    return newAttempt;
  },
  updateQuizAttempt: (id: string, patch: Partial<Omit<QuizAttempt, "id">>) => {
    setState((s) => ({ ...s, quizAttempts: (s.quizAttempts ?? []).map((a) => a.id === id ? { ...a, ...patch } : a) }));
  },
  deleteQuizAttempt: (id: string) => setState((s) => ({ ...s, quizAttempts: (s.quizAttempts ?? []).filter((a) => a.id !== id) })),
  addPracticeResult: (result: PracticeResult) => {
    if ((memState.practiceResults ?? []).some((item) => item.id === result.id)) return result;
    setState((s) => ({ ...s, practiceResults: [...(s.practiceResults ?? []), result] }));
    return result;
  },
  deletePracticeResult: (id: string) => {
    setState((s) => ({ ...s, practiceResults: (s.practiceResults ?? []).filter((item) => item.id !== id) }));
  },
};

// כל פעולה אחרת של המקור שלא נדרשת במסכים האלה — לא עושה כלום (ולא מפילה את המסך)
const fallback = new Proxy(actions as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return () => undefined;
  },
});

/** הוק המאגר — כמו במקור: { state, ...פעולות }. */
export function useStudy() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    const first = listeners.size === 0;
    listeners.add(l);
    // כניסה ראשונה לפריסה המקורית (או חזרה אליה) — טוענים מחדש מהמסד, כי הפריסה הרגילה אולי שינתה נתונים
    void ensureHydrated(first);
    return () => { listeners.delete(l); };
  }, []);
  return { state: memState, ...(fallback as typeof actions), requireUser, hydrated } as typeof actions & {
    state: StudyState; requireUser: () => string; hydrated: boolean;
  } & Record<string, (...args: never[]) => unknown>;
}

export function getCurrentStudyCardsCount(): number {
  return memState.cards.length;
}
