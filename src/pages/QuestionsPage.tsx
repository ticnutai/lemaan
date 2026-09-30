import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Fuse from "fuse.js";
import { HelpCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import PageBanner from "../components/PageBanner";
import { db } from "../db";
import { defaultSrs } from "../features/study/srs";
import { buildChildrenMap, collectDescendantIds, selectableCategories } from "../features/study/categoryTree";
import { uid, formatDate } from "../lib/utils";
import type { Card } from "../features/study/types";

const PAGE_SIZE = 30;

interface EditorState {
  id: string | null;
  question: string;
  answer: string;
  categoryId: string;
}

export default function QuestionsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const options = useMemo(() => (categories ? selectableCategories(categories) : []), [categories]);
  const cards = useLiveQuery(async () => {
    if (categoryFilter && categories) {
      const ids = collectDescendantIds(categoryFilter, buildChildrenMap(categories));
      return db.cards.where("categoryId").anyOf([...ids]).toArray();
    }
    return db.cards.toArray();
  }, [categoryFilter, categories]);

  const fuse = useMemo(
    () => (cards ? new Fuse(cards, { keys: ["question", "answer", "masechta"], threshold: 0.35, ignoreLocation: true }) : null),
    [cards]
  );

  const filtered = useMemo(() => {
    if (!cards) return [];
    if (!search.trim() || !fuse) return cards;
    return fuse.search(search.trim()).map((r) => r.item);
  }, [cards, search, fuse]);

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE);

  const save = async () => {
    if (!editor || !editor.question.trim()) return;
    const now = Date.now();
    if (editor.id) {
      await db.cards.update(editor.id, {
        question: editor.question.trim(),
        answer: editor.answer.trim(),
        categoryId: editor.categoryId || null,
        updatedAt: now,
      });
    } else {
      const card: Card = {
        id: uid(),
        type: "flashcard",
        question: editor.question.trim(),
        answer: editor.answer.trim(),
        options: [],
        correctIndices: [],
        correct: null,
        categoryId: editor.categoryId || null,
        deckIds: [],
        tags: [],
        masechta: options.find((c) => c.id === editor.categoryId)?.name ?? null,
        daf: null,
        createdAt: now,
        updatedAt: now,
        srs: defaultSrs(),
        stats: { totalReviews: 0, correct: 0, incorrect: 0 },
      };
      await db.cards.add(card);
    }
    setEditor(null);
  };

  const remove = async (id: string) => {
    if (!confirm("למחוק את השאלה?")) return;
    await db.cards.delete(id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fade-in">
      <PageBanner icon={HelpCircle} title="בניית שאלות" subtitle="יצירה, עריכה וחיפוש של שאלות במאגר." />
      <div className="flex justify-end">
        <button className="btn-gold" onClick={() => setEditor({ id: null, question: "", answer: "", categoryId: categoryFilter })}>
          <Plus className="h-4 w-4" /> שאלה חדשה
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            className="input pr-9"
            placeholder="חיפוש בשאלות ובתשובות…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <select className="input w-52" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}>
          <option value="">כל המסכתות</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{c.depth ? "— " : ""}{c.name}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} שאלות</p>

      {editor && (
        <div className="card-panel gold-frame space-y-3 animate-slide-in-down">
          <h3 className="font-semibold">{editor.id ? "עריכת שאלה" : "שאלה חדשה"}</h3>
          <textarea className="input min-h-20" placeholder="שאלה" value={editor.question} onChange={(e) => setEditor({ ...editor, question: e.target.value })} />
          <textarea className="input min-h-20" placeholder="תשובה" value={editor.answer} onChange={(e) => setEditor({ ...editor, answer: e.target.value })} />
          <select className="input" value={editor.categoryId} onChange={(e) => setEditor({ ...editor, categoryId: e.target.value })}>
            <option value="">ללא מסכת</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>{c.depth ? "— " : ""}{c.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save}>שמירה</button>
            <button className="btn-outline" onClick={() => setEditor(null)}>ביטול</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {visible.map((card) => (
          <div key={card.id} className="card-panel py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-snug">{card.question}</p>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{card.answer}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {card.masechta ?? "ללא מסכת"}{card.daf ? ` · ${card.daf}` : ""} · חזרה הבאה: {formatDate(card.srs.dueAt)}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button className="btn-ghost h-8 w-8 p-0" title="עריכה"
                onClick={() => setEditor({ id: card.id, question: card.question, answer: card.answer, categoryId: card.categoryId ?? "" })}>
                <Pencil className="h-4 w-4" />
              </button>
              <button className="btn-ghost h-8 w-8 p-0 text-destructive" title="מחיקה" onClick={() => remove(card.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {visible.length < filtered.length && (
        <button className="btn-outline w-full" onClick={() => setPage((p) => p + 1)}>
          טען עוד ({filtered.length - visible.length} נותרו)
        </button>
      )}
    </div>
  );
}
