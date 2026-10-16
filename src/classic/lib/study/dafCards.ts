import type { Card, Category } from "./types";
import { displayCategoryName, dafLabel } from "./shasGen";

/**
 * אינדוקס קטגוריות לפי מסכת/דף/עמוד.
 * נבנה פעם אחת לכל (categories, masechta, totalPages) ומשמש גם לסינון וגם לספירה.
 * השדרוג: במקום לטייל בשרשרת הקטגוריות עבור כל כרטיס×כל באקט,
 * נטייל פעם אחת לכל קטגוריה ונבנה lookup ב-O(1) לפי name/id.
 */
type CatHit = { daf: number; amud: 0 | 1 | 2 }; // 0 = generic (ללא ע"א/ע"ב)
type CatIndex = {
  byName: Map<string, CatHit[]>;
  byId: Map<string, CatHit[]>;
  variantToDaf: Map<string, number>;
};

const _indexCache = new WeakMap<Category[], Map<string, CatIndex>>();
const EMPTY_CATEGORIES: Category[] = [];

// Study state replaces its arrays on every data change, so array identity is a
// safe and very cheap cache boundary. Page pickers often ask for dozens of
// adjacent pages in succession; without this cache every click rescanned the
// complete card library.
const _filterCache = new WeakMap<Card[], WeakMap<Category[], Map<string, Card[]>>>();
const _countCache = new WeakMap<Card[], WeakMap<Category[], Map<string, Map<number, { a: number; b: number; total: number }>>>>();

function getReferenceCache<T>(
  root: WeakMap<Card[], WeakMap<Category[], Map<string, T>>>,
  cards: Card[],
  categories: Category[] | undefined,
): Map<string, T> {
  let byCategories = root.get(cards);
  if (!byCategories) {
    byCategories = new WeakMap();
    root.set(cards, byCategories);
  }
  const categoryRef = categories ?? EMPTY_CATEGORIES;
  let values = byCategories.get(categoryRef);
  if (!values) {
    values = new Map();
    byCategories.set(categoryRef, values);
  }
  return values;
}

function buildCatIndex(
  categories: Category[] | undefined,
  masechta: string,
  totalPages: number,
): CatIndex {
  const cats = categories ?? EMPTY_CATEGORIES;
  let perCats = _indexCache.get(cats);
  if (!perCats) {
    perCats = new Map();
    _indexCache.set(cats, perCats);
  }
  const key = `${masechta}::${totalPages}`;
  const cached = perCats.get(key);
  if (cached) return cached;

  const variantToDaf = new Map<string, number>();
  for (let d = 2; d <= totalPages + 1; d++) {
    const lbl = dafLabel(d);
    const noDot = lbl.replace(".", "");
    variantToDaf.set(lbl, d);
    variantToDaf.set(noDot, d);
    variantToDaf.set(`דף ${noDot}`, d);
  }

  const catsById = new Map(cats.map((c) => [c.id, c]));
  const byName = new Map<string, CatHit[]>();
  const byId = new Map<string, CatHit[]>();

  for (const cat of cats) {
    let cur: Category | undefined = cat;
    let guard = 0;
    let hasMasechta = false;
    let foundDaf: number | null = null;
    let foundAmud: 0 | 1 | 2 = 0;
    while (cur && guard < 32) {
      const leaf = displayCategoryName(cur.name);
      if (leaf === masechta) hasMasechta = true;
      else if (leaf === 'ע"א') foundAmud = 1;
      else if (leaf === 'ע"ב') foundAmud = 2;
      else {
        const d = variantToDaf.get(leaf);
        if (d && foundDaf === null) foundDaf = d;
      }
      cur = cur.parentId ? catsById.get(cur.parentId) : undefined;
      guard += 1;
    }
    if (!hasMasechta || foundDaf === null) continue;
    const hit: CatHit = { daf: foundDaf, amud: foundAmud };
    const nameArr = byName.get(cat.name);
    if (nameArr) nameArr.push(hit); else byName.set(cat.name, [hit]);
    byId.set(cat.id, [hit]);
  }

  const idx: CatIndex = { byName, byId, variantToDaf };
  perCats.set(key, idx);
  return idx;
}

/**
 * מסנן כרטיסים השייכים לדף/עמוד נתון של מסכת.
 * תומך גם בשיוך מובנה (masechta/daf/amud) וגם בתגיות `cat:<categoryName|id>`.
 */
export function filterCardsByDafAmud(
  cards: Card[],
  categories: Category[] | undefined,
  masechta: string,
  daf: number,
  amud: 1 | 2 | null,
  options?: { includeDafOnly?: boolean },
): Card[] {
  const includeDafOnly = options?.includeDafOnly ?? true;
  const resultCache = getReferenceCache(_filterCache, cards, categories);
  const resultKey = `${masechta}::${daf}::${amud ?? 0}::${includeDafOnly ? "with-daf" : "amud-only"}`;
  const cachedResult = resultCache.get(resultKey);
  if (cachedResult) return cachedResult;

  const totalPagesHint = Math.max(daf + 1, 200);
  const idx = buildCatIndex(categories, masechta, totalPagesHint);
  const matchingCategoryPayloads = new Set<string>();
  const matchesTarget = (hits: CatHit[]) => hits.some((hit) => (
    hit.daf === daf && (!amud || hit.amud === amud || (includeDafOnly && hit.amud === 0))
  ));
  for (const [payload, hits] of idx.byName) {
    if (matchesTarget(hits)) matchingCategoryPayloads.add(payload);
  }
  for (const [payload, hits] of idx.byId) {
    if (matchesTarget(hits)) matchingCategoryPayloads.add(payload);
  }

  const out: Card[] = [];
  for (const card of cards) {
    if (card.masechta === masechta && card.daf === daf) {
      const resolvedAmud = card.amud === 1 || card.amud === 2 ? card.amud : null;
      if (!amud || resolvedAmud === amud || (includeDafOnly && !resolvedAmud)) out.push(card);
      continue;
    }
    for (const tag of card.tags ?? []) {
      if (tag.startsWith("cat:") && matchingCategoryPayloads.has(tag.slice(4))) {
        out.push(card);
        break;
      }
    }
  }
  resultCache.set(resultKey, out);
  return out;
}

/** מחזיר ספירת כרטיסים פר-עמוד למסכת — לשימוש ב-badges של בורר הדפים. */
export function countCardsPerDaf(
  cards: Card[],
  categories: Category[] | undefined,
  masechta: string,
  totalPages: number,
): Map<number, { a: number; b: number; total: number }> {
  const resultCache = getReferenceCache(_countCache, cards, categories);
  const resultKey = `${masechta}::${totalPages}`;
  const cachedResult = resultCache.get(resultKey);
  if (cachedResult) return cachedResult;

  const out = new Map<number, { a: number; b: number; total: number }>();
  const idx = buildCatIndex(categories, masechta, totalPages);

  const bump = (d: number, a: boolean, b: boolean) => {
    const cur = out.get(d) ?? { a: 0, b: 0, total: 0 };
    if (a) cur.a += 1;
    if (b) cur.b += 1;
    // total represents unique questions on the daf. A daf-only question is
    // visible on both amudim, but must contribute only once to this total.
    if (a || b) cur.total += 1;
    out.set(d, cur);
  };

  for (const card of cards) {
    if (card.masechta === masechta && card.daf) {
      const d = card.daf;
      if (d >= 2 && d <= totalPages + 1) {
        const resolvedAmud = card.amud === 1 || card.amud === 2 ? card.amud : null;
        if (resolvedAmud === 1) bump(d, true, false);
        else if (resolvedAmud === 2) bump(d, false, true);
        else bump(d, true, true);
      }
      continue;
    }
    const tags = card.tags;
    if (!tags || tags.length === 0) continue;

    // איסוף ייחודי של (daf,amud) לכרטיס כדי לא לספור פעמיים על אותה תגית
    let perDaf: Map<number, { hasA: boolean; hasB: boolean }> | null = null;
    for (const t of tags) {
      if (!t.startsWith("cat:")) continue;
      const payload = t.slice(4);
      const hits = idx.byName.get(payload) ?? idx.byId.get(payload);
      if (!hits) continue;
      for (const h of hits) {
        if (h.daf < 2 || h.daf > totalPages + 1) continue;
        if (!perDaf) perDaf = new Map();
        const e = perDaf.get(h.daf) ?? { hasA: false, hasB: false };
        if (h.amud === 1) e.hasA = true;
        else if (h.amud === 2) e.hasB = true;
        else { e.hasA = true; e.hasB = true; }
        perDaf.set(h.daf, e);
      }
    }
    if (!perDaf) continue;
    for (const [d, hit] of perDaf) bump(d, hit.hasA, hit.hasB);
  }

  for (const [d, c] of Array.from(out.entries())) {
    if (c.total === 0) out.delete(d);
  }
  resultCache.set(resultKey, out);
  return out;
}
