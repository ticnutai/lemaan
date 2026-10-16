import type { Card, Category } from "./types";
import { displayCategoryName } from "./shasGen";

/**
 * מסנן כרטיסים לפי שרשרת קטגוריות נדרשת.
 * כל שם בשרשרת חייב להופיע איפשהו בעץ הקטגוריה (ההורים שלה או היא עצמה).
 * השיוך נעשה דרך תגיות `cat:<categoryName>` בכרטיס.
 */
export function filterCardsByCategoryChain(
  cards: Card[],
  categories: Category[] | undefined,
  chain: string[],
): Card[] {
  const cats = categories ?? [];
  const catsById = new Map(cats.map((c) => [c.id, c]));

  const chainNamesInPath = (cat: Category): Set<string> => {
    const names = new Set<string>();
    let cur: Category | undefined = cat;
    let guard = 0;
    while (cur && guard < 64) {
      names.add(displayCategoryName(cur.name));
      cur = cur.parentId ? catsById.get(cur.parentId) : undefined;
      guard += 1;
    }
    return names;
  };

  const matchingCatNames = new Set<string>();
  const matchingCatIds = new Set<string>();
  for (const cat of cats) {
    const namesInPath = chainNamesInPath(cat);
    if (chain.every((name) => namesInPath.has(name))) {
      matchingCatNames.add(cat.name);
      matchingCatIds.add(cat.id);
    }
  }

  return cards.filter((c) =>
    c.tags?.some((t) => {
      if (!t.startsWith("cat:")) return false;
      const payload = t.slice(4);
      return matchingCatNames.has(payload) || matchingCatIds.has(payload);
    }),
  );
}
