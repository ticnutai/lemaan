import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { Layers, Play, Plus, Trash2 } from "lucide-react";
import { db } from "../db";
import { uid } from "../lib/utils";
import { buildChildrenMap, collectDescendantIds, selectableCategories } from "../features/study/categoryTree";
import PageBanner from "../components/PageBanner";

export default function DecksPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  const decks = useLiveQuery(() => db.decks.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const options = useMemo(() => (categories ? selectableCategories(categories) : []), [categories]);

  const deckCounts = useLiveQuery(async () => {
    if (!categories) return new Map<string, number>();
    const childrenMap = buildChildrenMap(categories);
    const all = await db.decks.toArray();
    const map = new Map<string, number>();
    for (const deck of all) {
      const ids = new Set<string>();
      for (const catId of deck.categoryIds) {
        if (deck.includeSubCategories) {
          for (const id of collectDescendantIds(catId, childrenMap)) ids.add(id);
        } else {
          ids.add(catId);
        }
      }
      map.set(deck.id, ids.size ? await db.cards.where("categoryId").anyOf([...ids]).count() : 0);
    }
    return map;
  }, [categories]);

  const catName = (id: string) => {
    const c = categories?.find((x) => x.id === id);
    if (!c) return "?";
    const parts = c.name.split(" · ");
    return parts[parts.length - 1];
  };

  const addDeck = async () => {
    if (!name.trim() || selectedCats.length === 0) return;
    await db.decks.add({
      id: uid(),
      name: name.trim(),
      color: "gold",
      categoryIds: selectedCats,
      includeSubCategories: true,
      createdAt: Date.now(),
    });
    setName("");
    setSelectedCats([]);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <PageBanner icon={Layers} title="חפיסות" subtitle="אוסף אישי של נושאים לתרגול ממוקד." />

      <div className="card-panel space-y-3">
        <h3 className="font-semibold">חפיסה חדשה</h3>
        <input className="input" placeholder="שם החפיסה (למשל: כל מסכת חגיגה)" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto">
          {options.filter((o) => o.depth === 1).map((o) => {
            const selected = selectedCats.includes(o.id);
            return (
              <button
                key={o.id}
                onClick={() => setSelectedCats(selected ? selectedCats.filter((id) => id !== o.id) : [...selectedCats, o.id])}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  selected ? "border-gold bg-gold/15 font-medium" : "hover:border-gold"
                }`}
              >
                {o.name}
              </button>
            );
          })}
        </div>
        <button className="btn-gold" onClick={addDeck} disabled={!name.trim() || selectedCats.length === 0}>
          <Plus className="h-4 w-4" /> יצירת חפיסה
        </button>
      </div>

      <div className="space-y-2">
        {decks?.map((deck) => (
          <div key={deck.id} className="card-panel py-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg border-2 border-gold/70 bg-secondary flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{deck.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {(deckCounts?.get(deck.id) ?? 0).toLocaleString()} שאלות · {deck.categoryIds.map(catName).join(", ")}
              </p>
            </div>
            <button className="btn-gold h-9" onClick={() => navigate(`/study?deck=${deck.id}`)}>
              <Play className="h-4 w-4" /> תרגול
            </button>
            <button className="btn-ghost h-9 w-9 p-0 text-destructive" title="מחיקה"
              onClick={async () => { if (confirm(`למחוק את החפיסה "${deck.name}"?`)) await db.decks.delete(deck.id); }}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {decks?.length === 0 && (
          <div className="card-panel border-dashed text-center py-8 text-muted-foreground">אין חפיסות עדיין.</div>
        )}
      </div>
    </div>
  );
}
