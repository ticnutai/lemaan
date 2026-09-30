import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Eye, RotateCcw, X } from "lucide-react";
import { db } from "../db";
import { applyReview, buildStudyQueue, type SrsAlgorithm } from "../features/study/srs";
import type { Card } from "../features/study/types";

const QUALITY_BUTTONS: { q: 0 | 3 | 4 | 5; label: string; cls: string }[] = [
  { q: 0, label: "שכחתי", cls: "bg-destructive text-destructive-foreground hover:opacity-90" },
  { q: 3, label: "קשה", cls: "bg-gold-soft text-navy hover:opacity-90" },
  { q: 4, label: "טוב", cls: "bg-gradient-navy text-primary-foreground hover:opacity-90" },
  { q: 5, label: "קל", cls: "bg-gradient-gold text-navy shadow-gold hover:opacity-90" },
];

export default function StudyPage() {
  const [categoryId, setCategoryId] = useState<string>("");
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0 });
  const shownAt = useRef(Date.now());

  const categories = useLiveQuery(() => db.categories.orderBy("sortOrder").toArray(), []);
  const algorithm = useLiveQuery(async () => ((await db.settings.get("srs-algo"))?.value ?? "sm2") as SrsAlgorithm, []);

  const childIds = useMemo(() => {
    if (!categoryId || !categories) return null;
    const ids = new Set<string>([categoryId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of categories) {
        if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [categoryId, categories]);

  const startSession = async () => {
    let cards = await db.cards.toArray();
    if (childIds) cards = cards.filter((c) => c.categoryId && childIds.has(c.categoryId));
    const q = buildStudyQueue(cards).slice(0, 30);
    setQueue(q);
    setIndex(0);
    setRevealed(false);
    setSessionStats({ correct: 0, incorrect: 0 });
    shownAt.current = Date.now();
  };

  const current = queue?.[index];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  const grade = async (quality: 0 | 3 | 4 | 5) => {
    if (!current || algorithm === undefined) return;
    const correct = quality >= 3;
    const srs = applyReview(current, quality, algorithm ?? "sm2");
    await db.transaction("rw", db.cards, db.reviewLogs, async () => {
      await db.cards.update(current.id, {
        srs,
        stats: {
          totalReviews: current.stats.totalReviews + 1,
          correct: current.stats.correct + (correct ? 1 : 0),
          incorrect: current.stats.incorrect + (correct ? 0 : 1),
        },
        updatedAt: Date.now(),
      });
      await db.reviewLogs.add({
        cardId: current.id,
        at: Date.now(),
        quality,
        correct,
        durationMs: Date.now() - shownAt.current,
      });
    });
    setSessionStats((s) => ({ correct: s.correct + (correct ? 1 : 0), incorrect: s.incorrect + (correct ? 0 : 1) }));
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  // ---- session not started ----
  if (queue === null) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <h2 className="font-display text-3xl font-bold">חזרה חכמה</h2>
        <div className="card-panel space-y-4">
          <label className="block text-sm font-medium">בחר מסכת (או הכל)</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">כל המאגר</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? "— " : ""}{c.name}
              </option>
            ))}
          </select>
          <button className="btn-gold w-full" onClick={startSession}>התחל סשן חזרה</button>
          <p className="text-xs text-muted-foreground">
            הסדר נקבע לפי אלגוריתם חזרה מרווחת ({algorithm === "fsrs" ? "FSRS" : "SM-2"}) — שאלות שקשות לך או שעבר זמנן מופיעות קודם.
          </p>
        </div>
      </div>
    );
  }

  // ---- session finished ----
  if (!current) {
    const total = sessionStats.correct + sessionStats.incorrect;
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-fade-in text-center">
        <h2 className="font-display text-3xl font-bold">הסשן הסתיים 🎉</h2>
        <div className="card-panel gold-frame space-y-2">
          <p className="text-4xl font-bold">{total ? Math.round((sessionStats.correct / total) * 100) : 0}%</p>
          <p className="text-muted-foreground">ענית נכון על {sessionStats.correct} מתוך {total} שאלות</p>
        </div>
        <button className="btn-primary" onClick={() => setQueue(null)}>
          <RotateCcw className="h-4 w-4" /> סשן חדש
        </button>
      </div>
    );
  }

  // ---- active card ----
  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>שאלה {index + 1} מתוך {queue.length}</span>
        <span>{current.masechta}{current.daf ? ` · ${current.daf}` : ""}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-gradient-gold transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      <div className="card-panel gold-frame min-h-[220px] flex flex-col">
        <p className="text-lg font-medium leading-relaxed flex-1">{current.question}</p>
        {revealed && (
          <div className="mt-4 pt-4 border-t animate-slide-in-down">
            <p className="text-sm text-muted-foreground mb-1">תשובה:</p>
            <p className="leading-relaxed">{current.answer}</p>
          </div>
        )}
      </div>

      {!revealed ? (
        <button className="btn-primary w-full h-12" onClick={() => setRevealed(true)}>
          <Eye className="h-4 w-4" /> הצג תשובה
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {QUALITY_BUTTONS.map(({ q, label, cls }) => (
            <button key={q} className={`btn h-12 ${cls}`} onClick={() => grade(q)}>
              {q === 0 ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
