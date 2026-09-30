import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Eye, RotateCcw, Timer, X } from "lucide-react";
import { db } from "../db";
import { buildChildrenMap, collectDescendantIds, selectableCategories } from "../features/study/categoryTree";
import PageBanner from "../components/PageBanner";
import QuestionCard, { hasOptions, isSelectionCorrect } from "../components/QuestionCard";
import type { Card } from "../features/study/types";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuizPage() {
  const [categoryId, setCategoryId] = useState("");
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [quiz, setQuiz] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const options = useMemo(() => (categories ? selectableCategories(categories) : []), [categories]);

  // Single 1s tick, only while a quiz is running — torn down when it ends.
  const running = quiz !== null && index < quiz.length && now < deadline;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const start = async () => {
    let cards: Card[];
    if (categoryId && categories) {
      const ids = collectDescendantIds(categoryId, buildChildrenMap(categories));
      cards = await db.cards.where("categoryId").anyOf([...ids]).toArray();
    } else {
      cards = await db.cards.toArray();
    }
    setQuiz(shuffle(cards).slice(0, count));
    setIndex(0);
    setRevealed(false);
    setSelected(null);
    setScore({ correct: 0, incorrect: 0 });
    setDeadline(Date.now() + minutes * 60000);
    setNow(Date.now());
  };

  const next = (correct: boolean) => {
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), incorrect: s.incorrect + (correct ? 0 : 1) }));
    setRevealed(false);
    setSelected(null);
    setIndex((i) => i + 1);
  };

  const selectOption = (i: number) => {
    setSelected(i);
    setRevealed(true);
  };

  if (quiz === null) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <PageBanner icon={Timer} title="בניית מבחנים" subtitle="מבחן מתוזמן — בחר נושא, מספר שאלות וזמן, וקבל ציון בסוף." />
        <div className="card-panel space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">נושא</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">כל המאגר</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>{c.depth ? "— " : ""}{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">מספר שאלות</label>
              <input type="number" min={1} max={100} className="input" value={count} onChange={(e) => setCount(Number(e.target.value) || 10)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">דקות</label>
              <input type="number" min={1} max={120} className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 10)} />
            </div>
          </div>
          <button className="btn-gold w-full" onClick={start}>התחל מבחן</button>
        </div>
      </div>
    );
  }

  const timeLeft = Math.max(0, deadline - now);
  const finished = index >= quiz.length || timeLeft === 0;

  if (finished) {
    const answered = score.correct + score.incorrect;
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-fade-in text-center">
        <h2 className="font-display text-3xl font-bold">{timeLeft === 0 && index < quiz.length ? "הזמן נגמר!" : "המבחן הסתיים"}</h2>
        <div className="card-panel gold-frame space-y-2">
          <p className="text-5xl font-bold">{answered ? Math.round((score.correct / answered) * 100) : 0}</p>
          <p className="text-muted-foreground">ציון · {score.correct} נכונות מתוך {answered} ({quiz.length} במבחן)</p>
        </div>
        <button className="btn-primary" onClick={() => setQuiz(null)}><RotateCcw className="h-4 w-4" /> מבחן חדש</button>
      </div>
    );
  }

  const current = quiz[index];
  const withOptions = hasOptions(current);
  const selectionCorrect = selected !== null && isSelectionCorrect(current, selected);
  const mm = Math.floor(timeLeft / 60000);
  const ss = Math.floor((timeLeft % 60000) / 1000).toString().padStart(2, "0");

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">שאלה {index + 1} מתוך {quiz.length}</span>
        <span className={`font-mono text-lg font-bold ${timeLeft < 60000 ? "text-destructive" : "text-gold"}`}>{mm}:{ss}</span>
      </div>

      <QuestionCard card={current} revealed={revealed} selected={selected} onSelect={selectOption} />

      {!revealed ? (
        !withOptions && (
          <button className="btn-primary w-full h-12" onClick={() => setRevealed(true)}><Eye className="h-4 w-4" /> הצג תשובה</button>
        )
      ) : withOptions ? (
        <div className="space-y-2">
          <p className={`text-center text-sm font-medium ${selectionCorrect ? "text-gold" : "text-destructive"}`}>
            {selectionCorrect ? "תשובה נכונה!" : "תשובה שגויה"}
          </p>
          <button className="btn h-12 w-full bg-gradient-gold text-navy shadow-gold hover:opacity-90" onClick={() => next(selectionCorrect)}>
            <ArrowLeft className="h-4 w-4" /> הבא
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn h-12 bg-destructive text-destructive-foreground hover:opacity-90" onClick={() => next(false)}>
            <X className="h-4 w-4" /> טעיתי
          </button>
          <button className="btn h-12 bg-gradient-gold text-navy shadow-gold hover:opacity-90" onClick={() => next(true)}>
            <Check className="h-4 w-4" /> ידעתי
          </button>
        </div>
      )}
    </div>
  );
}
