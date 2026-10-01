import { buildChildrenMap, collectDescendantIds } from "./categoryTree";
import type { Card, Category, Deck } from "./types";

/**
 * האם כרטיס עונה על מסנן תוכן (מסכת / דף / עמוד).
 * שאלה בלי תיוג עמוד שייכת לשני העמודים — כמו במקור.
 */
export function matchesFilter(c: Card, f: { masechta: string; daf?: string; amud?: string }): boolean {
  if (c.masechta !== f.masechta) return false;
  if (f.daf != null && c.daf !== f.daf) return false;
  if (f.amud != null && c.amud != null && c.amud !== f.amud) return false;
  return true;
}

/** כל שאלות המבחן: קטגוריות (ירושה מהעץ) + מסנני מסכת/דף/עמוד, בלי כפילויות. */
export function cardsForDeck(deck: Deck, allCards: Card[], categories: Category[]): Card[] {
  const picked = new Map<string, Card>();
  if (deck.categoryIds.length) {
    const childrenMap = buildChildrenMap(categories);
    const ids = new Set<string>();
    for (const catId of deck.categoryIds) {
      if (deck.includeSubCategories) for (const id of collectDescendantIds(catId, childrenMap)) ids.add(id);
      else ids.add(catId);
    }
    for (const c of allCards) if (c.categoryId && ids.has(c.categoryId)) picked.set(c.id, c);
  }
  for (const f of deck.filters ?? []) {
    for (const c of allCards) if (matchesFilter(c, f)) picked.set(c.id, c);
  }
  return [...picked.values()];
}
