import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, Check, ChevronLeft, Eye, Play, RotateCcw, Timer, X } from "lucide-react";
import { db } from "../db";
import { applyReview, buildStudyQueue, type SrsAlgorithm } from "../features/study/srs";
import { buildChildrenMap, collectDescendantIds } from "../features/study/categoryTree";
import { SEDARIM } from "../features/study/shas";
import type { Category } from "../features/study/types";
import QuestionCard, { hasOptions, isSelectionCorrect } from "../components/QuestionCard";
import type { Card } from "../features/study/types";

const CORPUS_TABS = ["ש\"ס", "משנה", "חומש", "תנ\"ך"];

const QUALITY_BUTTONS: { q: 0 | 3 | 4 | 5; label: string; cls: string }[] = [
  { q: 0, label: "שכחתי", cls: "bg-destructive text-destructive-foreground hover:opacity-90" },
  { q: 3, label: "קשה", cls: "bg-gold-soft text-navy hover:opacity-90" },
  { q: 4, label: "טוב", cls: "bg-gradient-navy text-primary-foreground hover:opacity-90" },
  { q: 5, label: "קל", cls: "bg-gradient-gold text-navy shadow-gold hover:opacity-90" },
];

export default function StudyPage() {
  const [openSeder, setOpenSeder] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0 });
  const shownAt = useRef(Date.now());

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const algorithm = useLiveQuery(async () => ((await db.settings.get("srs-algo"))?.value ?? "sm2") as SrsAlgorithm, []);

  // Arriving from a deck's "תרגול" button (/study?deck=<id>): start that session once.
  const [searchParams, setSearchParams] = useSearchParams();
  const deckStarted = useRef(false);
  useEffect(() => {
    const deckId = searchParams.get("deck");
    if (!deckId || !categories || deckStarted.current) return;
    deckStarted.current = true;
    (async () => {
      const deck = await db.decks.get(deckId);
      if (!deck) return;
      const childrenMap = buildChildrenMap(categories);
      const ids = new Set<string>();
      for (const catId of deck.categoryIds) {
        if (deck.includeSubCategories) for (const id of collectDescendantIds(catId, childrenMap)) ids.add(id);
        else ids.add(catId);
      }
      const cards = ids.size ? await db.cards.where("categoryId").anyOf([...ids]).toArray() : [];
      setSessionTitle(deck.name);
      setQueue(buildStudyQueue(cards).slice(0, 30));
      setIndex(0);
      setSearchParams({}, { replace: true });
    })();
  }, [searchParams, categories, setSearchParams]);

  /** Sedarim and their masechtot, straight from the data. Hierarchy: ש"ס → סדר → מסכת → דף. */
  const sedarim = useMemo(() => {
    if (!categories) return [];
    const shasRoot = categories.find((c) => c.parentId === null && c.name === 'ש"ס');
    if (!shasRoot) return [];
    const childrenMap = buildChildrenMap(categories);
    const order = new Map(SEDARIM.map((s, i) => [s.name, i]));
    const sederNodes = (childrenMap.get(shasRoot.id) ?? [])
      .slice()
      .sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
    return sederNodes.map((seder) => ({
      name: seder.name,
      masechtot: (childrenMap.get(seder.id) ?? [])
        .slice()
        .sort((a: Category, b: Category) => a.name.localeCompare(b.name, "he")),
    }));
  }, [categories]);

  const startSession = async (catId: string | null, title: string) => {
    let cards: Card[];
    if (catId && categories) {
      const ids = collectDescendantIds(catId, buildChildrenMap(categories));
      cards = await db.cards.where("categoryId").anyOf([...ids]).toArray();
    } else {
      cards = await db.cards.toArray();
    }
    setSessionTitle(title);
    setQueue(buildStudyQueue(cards).slice(0, 30));
    setIndex(0);
    setRevealed(false);
    setSelected(null);
    setSessionStats({ correct: 0, incorrect: 0 });
    shownAt.current = Date.now();
  };

  const current = queue?.[index];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  const grade = async (quality: 0 | 1 | 2 | 3 | 4 | 5) => {
    if (!current) return;
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
    setSelected(null);
    setIndex((i) => i + 1);
  };

  // ---------------- hub ----------------
  if (queue === null) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 animate-fade-in">
        {/* Corpus pill tabs like the original */}
        <div className="card-panel p-2 flex gap-2">
          {CORPUS_TABS.map((tab, i) => (
            <button
              key={tab}
              disabled={i > 0}
              title={i > 0 ? "בקרוב" : undefined}
              className={
                i === 0
                  ? "flex-1 h-12 rounded-lg bg-gradient-navy text-primary-foreground font-bold flex items-center justify-center gap-2 shadow-elegant"
                  : "flex-1 h-12 rounded-lg text-muted-foreground font-medium flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
              }
            >
              <BookOpen className="h-4 w-4" />
              {tab}
            </button>
          ))}
        </div>

        {/* Practice mode cards */}
        <div className="gold-frame p-4 grid md:grid-cols-2 gap-4 bg-secondary/50">
          <button
            onClick={() => startSession(null, "תרגול כללי")}
            className="rounded-lg bg-gradient-navy text-primary-foreground p-5 text-right shadow-elegant hover:opacity-95 transition-opacity flex items-center justify-between gap-3"
          >
            <div>
              <h3 className="font-display text-xl font-bold">תרגול כללי</h3>
              <p className="text-sm opacity-80 mt-1">חזרה חכמה על כל המאגר לפי דחיפות</p>
            </div>
            <span className="h-12 w-12 rounded-full bg-gradient-gold shadow-gold flex items-center justify-center shrink-0">
              <Play className="h-5 w-5 text-navy" />
            </span>
          </button>
          <Link
            to="/quiz"
            className="rounded-lg bg-card border p-5 text-right shadow-elegant hover:border-gold transition-colors flex items-center justify-between gap-3"
          >
            <div>
              <h3 className="font-display text-xl font-bold">תרגול מבחנים</h3>
              <p className="text-sm text-muted-foreground mt-1">מבחן מתוזמן עם ציון בסוף</p>
            </div>
            <span className="h-12 w-12 rounded-full border-2 border-gold/70 bg-secondary flex items-center justify-center shrink-0">
              <Timer className="h-5 w-5 text-gold" />
            </span>
          </Link>
        </div>

        {/* Sedarim */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {sedarim.map((seder) => (
            <button
              key={seder.name}
              disabled={seder.masechtot.length === 0}
              onClick={() => setOpenSeder(openSeder === seder.name ? null : seder.name)}
              className={
                openSeder === seder.name
                  ? "card-panel py-4 text-center border-gold shadow-gold"
                  : "card-panel py-4 text-center hover:border-gold transition-colors disabled:opacity-40"
              }
            >
              <BookOpen className="h-5 w-5 mx-auto text-gold mb-1.5" />
              <div className="font-bold">{seder.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{seder.masechtot.length} מסכתות</div>
            </button>
          ))}
        </div>

        {/* Masechtot of the open seder */}
        {openSeder && (
          <div className="gold-frame bg-card p-4 animate-slide-in-down">
            <h3 className="font-bold mb-3 text-lg">סדר {openSeder}</h3>
            <div className="flex flex-wrap gap-2">
              {sedarim
                .find((s) => s.name === openSeder)
                ?.masechtot.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => startSession(m.id, m.name)}
                    className="btn-outline rounded-full hover:border-gold hover:bg-secondary"
                  >
                    {m.name}
                    <ChevronLeft className="h-3.5 w-3.5 text-gold" />
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------- finished ----------------
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
          <RotateCcw className="h-4 w-4" /> חזרה לתרגול
        </button>
      </div>
    );
  }

  // ---------------- active card ----------------
  const withOptions = hasOptions(current);
  const selectionCorrect = selected !== null && isSelectionCorrect(current, selected);

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{sessionTitle} · שאלה {index + 1} מתוך {queue.length}</span>
        <span>{current.masechta}{current.daf ? ` · דף ${current.daf}` : ""}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-gradient-gold transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      <QuestionCard card={current} revealed={revealed} selected={selected} onSelect={(i) => { setSelected(i); setRevealed(true); }} />

      {!revealed ? (
        !withOptions && (
          <button className="btn-primary w-full h-12" onClick={() => setRevealed(true)}>
            <Eye className="h-4 w-4" /> הצג תשובה
          </button>
        )
      ) : withOptions ? (
        <div className="space-y-2">
          <p className={`text-center text-sm font-medium ${selectionCorrect ? "text-gold" : "text-destructive"}`}>
            {selectionCorrect ? "תשובה נכונה!" : "תשובה שגויה"}
          </p>
          <button
            className="btn h-12 w-full bg-gradient-gold text-navy shadow-gold hover:opacity-90"
            onClick={() => grade(selectionCorrect ? 4 : 0)}
          >
            <Check className="h-4 w-4" /> הבא
          </button>
        </div>
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
