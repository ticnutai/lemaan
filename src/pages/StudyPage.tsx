import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen, Check, ChevronLeft, ChevronRight, Eye, Pause, Play, RotateCcw, Scroll, Timer, Type, X, Zap,
} from "lucide-react";
import { db } from "../db";
import { applyReview, buildStudyQueue, type SrsAlgorithm } from "../features/study/srs";
import { cardsForDeck } from "../features/study/deckCards";
import { AMUD_LABELS, SEDARIM, hebrewDaf } from "../features/study/shas";
import QuestionCard, { hasOptions, isSelectionCorrect } from "../components/QuestionCard";
import type { Card, Deck } from "../features/study/types";

/** טאבי התחום כמו במקור; רק ש"ס עם תוכן כרגע. */
const CORPUS_TABS = [
  { name: 'ש"ס', icon: BookOpen },
  { name: "משנה", icon: Scroll },
  { name: "חומש", icon: Scroll },
  { name: 'תנ"ך', icon: BookOpen },
];

const QUALITY_BUTTONS: { q: 0 | 3 | 4 | 5; label: string; cls: string }[] = [
  { q: 0, label: "שכחתי", cls: "bg-destructive text-destructive-foreground hover:opacity-90" },
  { q: 3, label: "קשה", cls: "bg-gold-soft text-navy hover:opacity-90" },
  { q: 4, label: "טוב", cls: "bg-gradient-navy text-primary-foreground hover:opacity-90" },
  { q: 5, label: "קל", cls: "bg-gradient-gold text-navy shadow-gold hover:opacity-90" },
];

/** מוני שאלות: מסכת → דף → {עמוד א, עמוד ב, בלי עמוד}. */
type DafCounts = Map<number, { a: number; b: number; none: number }>;

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function StudyPage() {
  // ---- מצב דרילדאון (תרגול כללי) ----
  const [corpus, setCorpus] = useState('ש"ס');
  const [mode, setMode] = useState<"general" | "tests" | null>("general");
  const [seder, setSeder] = useState<string | null>(null);
  const [masechta, setMasechta] = useState<string | null>(null);
  const [daf, setDaf] = useState<number | null>(null);

  // ---- מצב סשן ----
  const [sessionTitle, setSessionTitle] = useState("");
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0 });
  const shownAt = useRef(Date.now());

  // ---- סרגל כלים של הסשן, כמו במקור ----
  const [instant, setInstant] = useState(true); // "מיידי" — מעבר אוטומטי אחרי בחירה
  const [fontScale, setFontScale] = useState(1); // כפתור T
  const [clockRunning, setClockRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const decks = useLiveQuery(() => db.decks.toArray(), []);
  const allCards = useLiveQuery(() => db.cards.toArray(), []);
  const algorithm = useLiveQuery(async () => ((await db.settings.get("srs-algo"))?.value ?? "sm2") as SrsAlgorithm, []);

  // שעון הסשן
  useEffect(() => {
    if (queue === null || !clockRunning) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000);
    return () => clearInterval(t);
  }, [queue, clockRunning]);

  /** מוני שאלות לכל מסכת/דף/עמוד — חישוב אחד מהמאגר. */
  const counts = useMemo(() => {
    const byMasechta = new Map<string, DafCounts>();
    if (!allCards) return byMasechta;
    for (const c of allCards) {
      if (!c.masechta) continue;
      const dafNum = parseInt(c.daf ?? "", 10);
      if (!Number.isFinite(dafNum)) continue;
      let dafMap = byMasechta.get(c.masechta);
      if (!dafMap) byMasechta.set(c.masechta, (dafMap = new Map()));
      let entry = dafMap.get(dafNum);
      if (!entry) dafMap.set(dafNum, (entry = { a: 0, b: 0, none: 0 }));
      if (c.amud === "1") entry.a++;
      else if (c.amud === "2") entry.b++;
      else entry.none++;
    }
    return byMasechta;
  }, [allCards]);

  const masechtaTotal = (name: string) => {
    let n = 0;
    for (const e of counts.get(name)?.values() ?? []) n += e.a + e.b + e.none;
    return n;
  };

  /** מספר שאלות בכל מבחן (חפיסה). */
  const deckCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (!decks || !categories || !allCards) return map;
    for (const d of decks) map.set(d.id, cardsForDeck(d, allCards, categories).length);
    return map;
  }, [decks, categories, allCards]);

  const beginSession = (cards: Card[], title: string) => {
    setSessionTitle(title);
    setQueue(buildStudyQueue(cards));
    setIndex(0);
    setRevealed(false);
    setSelected(null);
    setSessionStats({ correct: 0, incorrect: 0 });
    shownAt.current = Date.now();
    startedAt.current = Date.now();
    setElapsed(0);
    setClockRunning(true);
  };

  /**
   * תרגול כללי: התחלת סשן מעמוד (או כל הדף) — אצלנו זה באמת מתחיל.
   * שאלות בלי תיוג עמוד שייכות לשני העמודים, כמו במקור.
   */
  const startAmud = async (amud: "1" | "2" | null) => {
    if (!masechta || daf === null) return;
    const dafStr = String(daf);
    const cards = (allCards ?? []).filter(
      (c) => c.masechta === masechta && c.daf === dafStr && (amud === null || c.amud == null || c.amud === amud)
    );
    const amudLabel = amud ? ` · ${AMUD_LABELS[amud]}` : "";
    beginSession(cards, `${masechta} דף ${hebrewDaf(daf)}${amudLabel}`);
  };

  /** תרגול מבחנים: סשן מכל שאלות המבחן. */
  const startDeck = async (deck: Deck) => {
    if (!categories || !allCards) return;
    beginSession(cardsForDeck(deck, allCards, categories), `תרגול מבחן: ${deck.name}`);
  };

  // כניסה מחפיסה/מבחן בקישור (/study?deck=<id>)
  const [searchParams, setSearchParams] = useSearchParams();
  const deckStarted = useRef(false);
  useEffect(() => {
    const deckId = searchParams.get("deck");
    if (!deckId || !categories || !allCards || deckStarted.current) return;
    deckStarted.current = true;
    (async () => {
      const deck = await db.decks.get(deckId);
      if (deck) await startDeck(deck);
      setSearchParams({}, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, categories, allCards]);

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
        cardId: current.id, at: Date.now(), quality, correct,
        durationMs: Date.now() - shownAt.current,
      });
    });
    setSessionStats((s) => ({ correct: s.correct + (correct ? 1 : 0), incorrect: s.incorrect + (correct ? 0 : 1) }));
    setRevealed(false);
    setSelected(null);
    setIndex((i) => i + 1);
  };

  /** בחירת אפשרות: במצב "מיידי" עוברים ישר לשאלה הבאה, כמו במקור. */
  const selectOption = async (i: number) => {
    if (!current) return;
    if (instant) {
      const ok = isSelectionCorrect(current, i);
      await grade(ok ? 4 : 0);
    } else {
      setSelected(i);
      setRevealed(true);
    }
  };

  // ================= מרכז התרגול =================
  if (queue === null) {
    const sedarimWithCounts = SEDARIM.map((s) => ({
      ...s,
      withContent: s.masechtot.filter((m) => masechtaTotal(m) > 0),
    }));

    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
        {/* טאבי תחום */}
        <div className="card-panel p-2 flex gap-2">
          {CORPUS_TABS.map((tab) => (
            <button
              key={tab.name}
              onClick={() => setCorpus(tab.name)}
              className={
                corpus === tab.name
                  ? "flex-1 h-12 rounded-lg bg-gradient-navy text-primary-foreground font-bold flex items-center justify-center gap-2 shadow-elegant"
                  : "flex-1 h-12 rounded-lg text-foreground/80 font-medium flex items-center justify-center gap-2 hover:bg-secondary transition-colors"
              }
            >
              <tab.icon className="h-4 w-4" />
              {tab.name}
            </button>
          ))}
        </div>

        {/* שני מצבי תרגול */}
        <div className="gold-frame p-4 grid md:grid-cols-2 gap-4 bg-secondary/50">
          <button
            onClick={() => setMode("general")}
            className={
              mode === "general"
                ? "rounded-lg bg-gradient-navy text-primary-foreground p-5 text-right shadow-elegant flex items-center justify-between gap-3"
                : "rounded-lg bg-card border p-5 text-right shadow-elegant hover:border-gold transition-colors flex items-center justify-between gap-3"
            }
          >
            <div>
              <h3 className="font-display text-xl font-bold">תרגול כללי</h3>
              <p className={`text-sm mt-1 ${mode === "general" ? "opacity-80" : "text-muted-foreground"}`}>
                תרגול לפי התחום, המסכת והעמוד
              </p>
            </div>
            <span className="h-12 w-12 rounded-full bg-gradient-gold shadow-gold flex items-center justify-center shrink-0">
              <Play className="h-5 w-5 text-navy" />
            </span>
          </button>
          <button
            onClick={() => setMode("tests")}
            className={
              mode === "tests"
                ? "rounded-lg bg-gradient-navy text-primary-foreground p-5 text-right shadow-elegant flex items-center justify-between gap-3"
                : "rounded-lg bg-card border p-5 text-right shadow-elegant hover:border-gold transition-colors flex items-center justify-between gap-3"
            }
          >
            <div>
              <h3 className="font-display text-xl font-bold">תרגול מבחנים</h3>
              <p className={`text-sm mt-1 ${mode === "tests" ? "opacity-80" : "text-muted-foreground"}`}>
                תרגול מתוך המבחנים שיצרת
              </p>
            </div>
            <span className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${mode === "tests" ? "bg-gradient-gold shadow-gold" : "border-2 border-gold/70 bg-secondary"}`}>
              <BookOpen className={`h-5 w-5 ${mode === "tests" ? "text-navy" : "text-gold"}`} />
            </span>
          </button>
        </div>

        {/* תחום שאינו ש"ס — כמו במקור, הודעה */}
        {corpus !== 'ש"ס' && (
          <div className="card-panel border-dashed text-center text-muted-foreground py-10">
            לא נמצאו עדיין שאלות בתחום {corpus}. אפשר להוסיף בעמוד בניית שאלות.
          </div>
        )}

        {/* ---- תרגול כללי: דרילדאון סדר ← מסכת ← דף ← עמוד ---- */}
        {corpus === 'ש"ס' && mode === "general" && (
          <div className="gold-frame bg-card p-4 space-y-4">
            {/* רמה 1: סדרים */}
            {!seder && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {sedarimWithCounts.map((s) => (
                  <button
                    key={s.name}
                    disabled={s.withContent.length === 0}
                    onClick={() => setSeder(s.name)}
                    className="card-panel py-4 text-center hover:border-gold transition-colors disabled:opacity-40"
                  >
                    <BookOpen className="h-5 w-5 mx-auto text-gold mb-1.5" />
                    <div className="font-bold">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.withContent.length} מסכתות</div>
                  </button>
                ))}
              </div>
            )}

            {/* רמה 2: מסכתות הסדר */}
            {seder && !masechta && (
              <div className="space-y-3 animate-slide-in-down">
                <button className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1" onClick={() => setSeder(null)}>
                  <ChevronRight className="h-4 w-4" /> חזרה לסדרים
                </button>
                <h3 className="font-bold text-lg">סדר {seder}</h3>
                <div className="flex flex-wrap gap-2">
                  {SEDARIM.find((s) => s.name === seder)?.masechtot.map((m) => {
                    const n = masechtaTotal(m);
                    return (
                      <button
                        key={m}
                        disabled={n === 0}
                        onClick={() => setMasechta(m)}
                        className="btn-outline rounded-full hover:border-gold hover:bg-secondary disabled:opacity-40"
                      >
                        {m}
                        {n > 0 && <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-1.5">{n}</span>}
                        <ChevronLeft className="h-3.5 w-3.5 text-gold" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* רמה 3: רשת דפים עם מוני שאלות */}
            {masechta && daf === null && (
              <div className="space-y-3 animate-slide-in-down">
                <button className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1" onClick={() => setMasechta(null)}>
                  <ChevronRight className="h-4 w-4" /> חזרה למסכתות
                </button>
                <h3 className="font-bold text-lg">{masechta} — בחירת דף</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-80 overflow-y-auto pr-1">
                  {[...(counts.get(masechta)?.entries() ?? [])]
                    .sort((x, y) => x[0] - y[0])
                    .map(([d, e]) => (
                      <button
                        key={d}
                        onClick={() => setDaf(d)}
                        className="card-panel py-2.5 px-2 text-center hover:border-gold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span className="font-bold">{hebrewDaf(d)}</span>
                        <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-1.5 py-0.5">
                          {e.a + e.b + e.none}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* רמה 4: בחירת עמוד */}
            {masechta && daf !== null && (() => {
              const e = counts.get(masechta)?.get(daf) ?? { a: 0, b: 0, none: 0 };
              const total = e.a + e.b + e.none;
              // שאלות בלי תיוג עמוד נספרות בשני העמודים — כמו במקור
              const aCount = e.a + e.none, bCount = e.b + e.none;
              return (
                <div className="space-y-3 animate-slide-in-down">
                  <button className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1" onClick={() => setDaf(null)}>
                    <ChevronRight className="h-4 w-4" /> חזרה לדפים
                  </button>
                  <h3 className="font-bold text-lg">{masechta}, דף {hebrewDaf(daf)} — בחר עמוד</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <button
                      disabled={aCount === 0}
                      onClick={() => startAmud("1")}
                      className="card-panel py-4 text-center hover:border-gold transition-colors disabled:opacity-40"
                    >
                      <div className="font-bold">עמוד א'</div>
                      <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-2 py-0.5">{aCount}</span>
                    </button>
                    <button
                      disabled={bCount === 0}
                      onClick={() => startAmud("2")}
                      className="card-panel py-4 text-center hover:border-gold transition-colors disabled:opacity-40"
                    >
                      <div className="font-bold">עמוד ב'</div>
                      <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-2 py-0.5">{bCount}</span>
                    </button>
                    <button
                      onClick={() => startAmud(null)}
                      className="card-panel py-4 text-center border-gold shadow-gold hover:opacity-90 transition-opacity col-span-2 md:col-span-1"
                    >
                      <div className="font-bold">כל הדף</div>
                      <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-2 py-0.5">{total}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ---- תרגול מבחנים: המבחנים שנוצרו בטאב בניית מבחנים ---- */}
        {corpus === 'ש"ס' && mode === "tests" && (
          <div className="gold-frame bg-card p-4 space-y-3">
            <div>
              <h3 className="font-bold text-lg">תרגול מבחנים</h3>
              <p className="text-sm text-muted-foreground">כל המבחנים שיצרת בטאב בניית מבחנים.</p>
            </div>
            {(decks ?? []).length === 0 ? (
              <div className="border-dashed border rounded-lg text-center text-muted-foreground py-8">
                עדיין אין מבחנים — צור אחד בעמוד <Link to="/quiz" className="text-gold hover:underline">בניית מבחנים</Link>.
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {(decks ?? []).map((d) => (
                  <div key={d.id} className="card-panel flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{deckCounts.get(d.id) ?? 0} שאלות</p>
                    </div>
                    <button className="btn-gold shrink-0" onClick={() => startDeck(d)}>
                      <Play className="h-4 w-4" /> התחל תרגול
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ================= סיום סשן =================
  if (!current) {
    const total = sessionStats.correct + sessionStats.incorrect;
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-fade-in text-center">
        <h2 className="font-display text-3xl font-bold">הסשן הסתיים 🎉</h2>
        <div className="card-panel gold-frame space-y-2">
          <p className="text-4xl font-bold">{total ? Math.round((sessionStats.correct / total) * 100) : 0}%</p>
          <p className="text-muted-foreground">ענית נכון על {sessionStats.correct} מתוך {total} שאלות · {formatClock(elapsed)} דקות</p>
        </div>
        <button className="btn-primary" onClick={() => setQueue(null)}>
          <RotateCcw className="h-4 w-4" /> חזרה לתרגול
        </button>
      </div>
    );
  }

  // ================= מסך סשן פעיל =================
  const withOptions = hasOptions(current);
  const selectionCorrect = selected !== null && isSelectionCorrect(current, selected);
  const dafNum = parseInt(current.daf ?? "", 10);
  const breadcrumb = current.masechta
    ? `${current.masechta}${Number.isFinite(dafNum) ? ` · ${hebrewDaf(dafNum)}.` : ""}`
    : undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      {/* כותרת + חזרה */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-lg truncate">{sessionTitle}</h2>
        <button className="btn-outline rounded-full shrink-0" onClick={() => setQueue(null)}>
          <X className="h-4 w-4" /> חזרה
        </button>
      </div>

      {/* סרגל כלים כמו במקור: שעון · עצור · מיידי · גופן */}
      <div className="card-panel py-2.5 px-3 flex items-center gap-2 flex-wrap text-sm">
        <span className="flex items-center gap-1.5 font-mono font-bold text-gold">
          <Timer className="h-4 w-4" /> {formatClock(elapsed)}
        </span>
        <button
          className={`btn-outline h-8 rounded-full ${clockRunning ? "" : "border-gold text-gold"}`}
          onClick={() => {
            if (clockRunning) setClockRunning(false);
            else {
              startedAt.current = Date.now() - elapsed;
              setClockRunning(true);
            }
          }}
        >
          {clockRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {clockRunning ? "עצור שעון" : "המשך שעון"}
        </button>
        <button
          className={`btn-outline h-8 rounded-full ${instant ? "border-gold text-gold bg-gold/10" : ""}`}
          title="מעבר אוטומטי לשאלה הבאה אחרי בחירה"
          onClick={() => setInstant((v) => !v)}
        >
          <Zap className="h-3.5 w-3.5" /> מיידי
        </button>
        <button
          className="btn-outline h-8 rounded-full"
          title="גודל גופן"
          onClick={() => setFontScale((f) => (f >= 1.4 ? 1 : +(f + 0.2).toFixed(1)))}
        >
          <Type className="h-3.5 w-3.5" /> {fontScale !== 1 && `×${fontScale}`}
        </button>
        <span className="ms-auto text-muted-foreground">
          {index + 1} / {queue.length} · תרגול חופשי
        </span>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-gradient-gold transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      <QuestionCard
        card={current}
        revealed={revealed}
        selected={selected}
        onSelect={selectOption}
        breadcrumb={breadcrumb}
        fontScale={fontScale}
      />
      {current.masechta && current.daf && (
        <p className="text-left text-xs">
          <Link
            to={`/shas?he=${encodeURIComponent(current.masechta)}&daf=${encodeURIComponent(current.daf)}`}
            className="text-gold hover:underline"
          >
            פתיחת הדף בגמרא ←
          </Link>
        </p>
      )}

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
