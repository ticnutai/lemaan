import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, ChevronLeft, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../db";
import { uid } from "../lib/utils";
import type { Category } from "../features/study/types";

interface TreeNode extends Category {
  children: TreeNode[];
  cardCount: number;
  totalCount: number;
}

export default function CategoriesPage() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");

  const categories = useLiveQuery(() => db.categories.orderBy("sortOrder").toArray(), []);
  const counts = useLiveQuery(async () => {
    const map = new Map<string, number>();
    await db.cards.each((c) => {
      if (c.categoryId) map.set(c.categoryId, (map.get(c.categoryId) ?? 0) + 1);
    });
    return map;
  }, []);

  const tree = useMemo(() => {
    if (!categories) return [];
    const nodes = new Map<string, TreeNode>();
    for (const c of categories) nodes.set(c.id, { ...c, children: [], cardCount: counts?.get(c.id) ?? 0, totalCount: 0 });
    const roots: TreeNode[] = [];
    for (const n of nodes.values()) {
      if (n.parentId && nodes.has(n.parentId)) nodes.get(n.parentId)!.children.push(n);
      else roots.push(n);
    }
    const sum = (n: TreeNode): number => {
      n.totalCount = n.cardCount + n.children.reduce((a, c) => a + sum(c), 0);
      n.children.sort((a, b) => a.name.localeCompare(b.name, "he"));
      return n.totalCount;
    };
    roots.forEach(sum);
    return roots;
  }, [categories, counts]);

  const toggle = (id: string) => {
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCategory = async () => {
    if (!newName.trim()) return;
    await db.categories.add({
      id: uid(),
      name: newName.trim(),
      parentId: newParent || null,
      color: null,
      sortOrder: (categories?.length ?? 0) + 1,
    });
    setNewName("");
  };

  const rename = async (c: Category) => {
    const name = prompt("שם חדש:", c.name);
    if (name?.trim()) await db.categories.update(c.id, { name: name.trim() });
  };

  const remove = async (node: TreeNode) => {
    if (node.children.length) {
      alert("יש למחוק תחילה את תתי־הקטגוריות.");
      return;
    }
    if (!confirm(`למחוק את "${node.name}"? ${node.cardCount ? `${node.cardCount} שאלות יישארו ללא מסכת.` : ""}`)) return;
    await db.transaction("rw", db.categories, db.cards, async () => {
      await db.cards.where("categoryId").equals(node.id).modify({ categoryId: null });
      await db.categories.delete(node.id);
    });
  };

  const renderNode = (node: TreeNode, depth: number) => (
    <div key={node.id}>
      <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-secondary group" style={{ paddingRight: depth * 20 + 8 }}>
        {node.children.length > 0 ? (
          <button onClick={() => toggle(node.id)} className="text-muted-foreground">
            {open.has(node.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="font-medium flex-1">{node.name}</span>
        <span className="text-xs text-muted-foreground">{node.totalCount}</span>
        <span className="hidden group-hover:flex gap-1">
          <Link to={`/study`} className="btn-ghost h-7 px-2 text-xs">חזרה</Link>
          <button className="btn-ghost h-7 w-7 p-0" onClick={() => rename(node)}><Pencil className="h-3.5 w-3.5" /></button>
          <button className="btn-ghost h-7 w-7 p-0 text-destructive" onClick={() => remove(node)}><Trash2 className="h-3.5 w-3.5" /></button>
        </span>
      </div>
      {open.has(node.id) && node.children.map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <h2 className="font-display text-3xl font-bold flex items-center gap-3">
        <FolderTree className="h-7 w-7 text-gold" /> מסכתות וקטגוריות
      </h2>

      <div className="card-panel flex gap-2">
        <input className="input flex-1" placeholder="שם קטגוריה חדשה" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <select className="input w-48" value={newParent} onChange={(e) => setNewParent(e.target.value)}>
          <option value="">רמה ראשית</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button className="btn-primary" onClick={addCategory}><Plus className="h-4 w-4" /> הוספה</button>
      </div>

      <div className="card-panel">
        {tree.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין קטגוריות עדיין — ייבא את המאגר מדף הבית או צור קטגוריה.</p>
        ) : (
          tree.map((n) => renderNode(n, 0))
        )}
      </div>
    </div>
  );
}
