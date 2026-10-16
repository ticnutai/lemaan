import type { Category } from "./types";

/** Reserved name for the singleton "uncategorized" category.
 *  Rules:
 *  - Exists at most once per user (singleton at root).
 *  - Cannot be renamed, deleted, or have sub-categories.
 *  - Auto-created on first use (when a card lacks any cat: tag,
 *    or when a deck is created without picking a category).
 */
export const UNCATEGORIZED_NAME = "כללי";

export function findUncategorized(categories: Category[] | undefined): Category | undefined {
  return (categories ?? []).find(
    (c) => c.parentId === null && c.name === UNCATEGORIZED_NAME,
  );
}

export function isUncategorized(cat: { name: string; parentId: string | null }): boolean {
  return cat.parentId === null && cat.name === UNCATEGORIZED_NAME;
}

export const UNCATEGORIZED_TAG = `cat:${UNCATEGORIZED_NAME}`;
