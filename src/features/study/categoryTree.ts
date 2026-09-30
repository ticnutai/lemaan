import type { Category } from "./types";

/** parentId → children, built once per category list. */
export function buildChildrenMap(categories: Category[]): Map<string | null, Category[]> {
  const map = new Map<string | null, Category[]>();
  for (const c of categories) {
    const arr = map.get(c.parentId) ?? [];
    arr.push(c);
    map.set(c.parentId, arr);
  }
  return map;
}

/** The category itself plus all its descendants (efficient BFS). */
export function collectDescendantIds(rootId: string, childrenMap: Map<string | null, Category[]>): Set<string> {
  const ids = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of childrenMap.get(id) ?? []) {
      if (!ids.has(child.id)) {
        ids.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return ids;
}

/**
 * Options for filter dropdowns: roots and their direct children only
 * (e.g. ש"ס and each masechta) — not the tens of thousands of daf/amud nodes.
 */
export function selectableCategories(categories: Category[]): { id: string; name: string; depth: number }[] {
  const childrenMap = buildChildrenMap(categories);
  const out: { id: string; name: string; depth: number }[] = [];
  const roots = (childrenMap.get(null) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"));
  for (const root of roots) {
    out.push({ id: root.id, name: root.name, depth: 0 });
    const children = (childrenMap.get(root.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "he"));
    for (const child of children) out.push({ id: child.id, name: child.name, depth: 1 });
  }
  return out;
}
