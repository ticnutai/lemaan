import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { ChevronLeft, Folder, FolderTree, GraduationCap, Home, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "../db";
import { uid } from "../lib/utils";
import { buildChildrenMap } from "../features/study/categoryTree";
import PageBanner from "../components/PageBanner";
import type { Category } from "../features/study/types";

/** Category names in the imported library are full paths ("עבודה זרה · יז.") — show only the leaf. */
function leafName(name: string): string {
  const parts = name.split(" · ");
  return parts[parts.length - 1] || name;
}

export default function CategoriesPage() {
  const [path, setPath] = useState<Category[]>([]);
  const [newName, setNewName] = useState("");

  const categories = useLiveQuery(() => db.categories.toArray(), []);

  const directCounts = useLiveQuery(async () => {
    const map = new Map<string, number>();
    await db.cards.each((c) => {
      if (c.categoryId) map.set(c.categoryId, (map.get(c.categoryId) ?? 0) + 1);
    });
    return map;
  }, []);

  const childrenMap = useMemo(() => (categories ? buildChildrenMap(categories) : new Map()), [categories]);

  /** Total (recursive) card count per category. */
  const totalCounts = useMemo(() => {
    const totals = new Map<string, number>();
    if (!categories || !directCounts) return totals;
    const compute = (id: string): number => {
      if (totals.has(id)) return totals.get(id)!;
      let sum = directCounts.get(id) ?? 0;
      for (const child of childrenMap.get(id) ?? []) sum += compute(child.id);
      totals.set(id, sum);
      return sum;
    };
    for (const c of categories) compute(c.id);
    return totals;
  }, [categories, directCounts, childrenMap]);

  const current = path[path.length - 1] ?? null;
  const folders: Category[] = useMemo(() => {
    const list: Category[] = childrenMap.get(current?.id ?? null) ?? [];
    return [...list].sort(
      (a, b) => (totalCounts.get(b.id) ?? 0) - (totalCounts.get(a.id) ?? 0) || a.name.localeCompare(b.name, "he")
    );
  }, [childrenMap, current, totalCounts]);

  const addCategory = async () => {
    if (!newName.trim()) return;
    await db.categories.add({
      id: uid(),
      name: current ? `${current.name} · ${newName.trim()}` : newName.trim(),
      parentId: current?.id ?? null,
      color: null,
      sortOrder: folders.length + 1,
    });
    setNewName("");
  };

  const rename = async (c: Category) => {
    const name = prompt("שם חדש:", leafName(c.name));
    if (name?.trim()) {
      const prefix = current ? `${current.name} · ` : "";
      await db.categories.update(c.id, { name: prefix + name.trim() });
    }
  };

  const remove = async (c: Category) => {
    if ((childrenMap.get(c.id) ?? []).length > 0) {
      alert("יש למחוק תחילה את תתי־הקטגוריות.");
      return;
    }
    const count = totalCounts.get(c.id) ?? 0;
    if (!confirm(`למחוק את "${leafName(c.name)}"? ${count ? `${count} שאלות יישארו ללא קטגוריה.` : ""}`)) return;
    await db.transaction("rw", db.categories, db.cards, async () => {
      await db.cards.where("categoryId").equals(c.id).modify({ categoryId: null });
      await db.categories.delete(c.id);
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fade-in">
      <PageBanner icon={FolderTree} title="קטגוריות" subtitle="יצירה, סידור וניהול של עץ הקטגוריות ותתי־הקטגוריות." />

      {/* Breadcrumb */}
      <div className="card-panel py-2.5 flex items-center gap-1 text-sm overflow-x-auto">
        <button className="btn-ghost h-8 px-2.5 gap-1.5 shrink-0" onClick={() => setPath([])}>
          <Home className="h-3.5 w-3.5 text-gold" /> בית
        </button>
        {path.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1 shrink-0">
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
            <button className="btn-ghost h-8 px-2.5" onClick={() => setPath(path.slice(0, i + 1))}>
              {leafName(c.name)}
            </button>
          </span>
        ))}
      </div>

      {/* Add */}
      <div className="card-panel py-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder={current ? `תיקייה חדשה בתוך "${leafName(current.name)}"` : "קטגוריה ראשית חדשה"}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
        />
        <button className="btn-primary" onClick={addCategory}>
          <Plus className="h-4 w-4" /> הוספה
        </button>
      </div>

      {/* Folder grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {folders.map((folder) => {
          const total = totalCounts.get(folder.id) ?? 0;
          const hasChildren = (childrenMap.get(folder.id) ?? []).length > 0;
          return (
            <div
              key={folder.id}
              className="card-panel p-3 group relative hover:border-gold transition-colors cursor-pointer"
              onClick={() => hasChildren && setPath([...path, folder])}
            >
              <div className="flex flex-col items-center text-center gap-1.5 py-2">
                <div className="relative">
                  <Folder className="h-10 w-10 text-gold fill-gold/20" />
                  {total > 0 && (
                    <span className="absolute -top-1.5 -left-2 text-[10px] font-bold bg-gradient-navy text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[20px]">
                      {total.toLocaleString()}
                    </span>
                  )}
                </div>
                <span className="font-medium text-sm leading-tight">{leafName(folder.name)}</span>
                <span className="text-[11px] text-muted-foreground">
                  {hasChildren ? `${(childrenMap.get(folder.id) ?? []).length} תיקיות` : "ללא תתי־תיקיות"}
                </span>
              </div>
              <div className="absolute top-2 left-2 hidden group-hover:flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button className="btn-ghost h-7 w-7 p-0" title="שינוי שם" onClick={() => rename(folder)}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button className="btn-ghost h-7 w-7 p-0 text-destructive" title="מחיקה" onClick={() => remove(folder)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {folders.length === 0 && (
        <div className="card-panel border-dashed text-center py-10 text-muted-foreground">
          <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
          אין תתי־תיקיות כאן. {current && (totalCounts.get(current.id) ?? 0) > 0 && (
            <Link to="/study" className="text-gold font-medium inline-flex items-center gap-1">
              <GraduationCap className="h-4 w-4" /> אפשר לתרגל את השאלות שבתיקייה
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
