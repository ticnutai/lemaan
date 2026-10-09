import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen, Check, ChevronLeft, Eye, Layers, Pause, Pin, PinOff, Play, RotateCcw, Scroll, Timer, Type, Undo2, X, Zap,
} from "lucide-react";
import { db } from "../db";
import { sendQuestionNote } from "../db/admin";
import { setCardsAmud } from "../db/amudSort";
import { useSession } from "../db/useSession";
import { applyReview, buildPracticeQueue, type SrsAlgorithm } from "../features/study/srs";
import { cardsForDeck } from "../features/study/deckCards";
import { AMUD_LABELS, SEDARIM, hebrewDaf } from "../features/study/shas";
import { useStudySession, type SessionPath } from "../features/study/activeSession";
import { dafStatus, emptyDafEntry, sederOf, STATUS_DOT, STATUS_LABEL, useShasCounts, type DafStatus } from "../features/study/shasCounts";
import {
  isPlacePinned, saveFontScale, saveInstant, togglePinnedCard, togglePinnedPlace,
  usePinnedCardIds, usePinnedPlaces, useStudyToolbarPrefs, type PinnedPlace,
} from "../features/study/studyPrefs";
import QuestionCard, { hasOptions, isSelectionCorrect } from "../components/QuestionCard";
import AmudSorter from "../components/AmudSorter";
import { cn } from "../lib/utils";
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

const OPTION_KEYS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח"];

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

type Crumb = { label: string; onClick?: () => void };

/** פירורי לחם: כל שלב לחיץ חוץ מהאחרון (המקום הנוכחי). */
function Breadcrumbs({ items, className = "" }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="מיקום" className={`flex items-center flex-wrap gap-x-1 gap-y-0.5 min-w-0 ${className}`}>
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {last || !c.onClick ? (
              <span className={last ? "font-bold text-foreground truncate" : "text-muted-foreground"} aria-current={last ? "page" : undefined}>
                {c.label}
              </span>
            ) : (
              <button className="text-muted-foreground hover:text-gold hover:underline transition-colors" onClick={c.onClick}>
                {c.label}
              </button>
            )}
            {!last && <ChevronLeft className="h-3.5 w-3.5 text-gold/70 shrink-0" />}
          </span>
        );
      })}
    </nav>
  );
}

/** כפתור הצמדה למסכת/דף — קיצור דרך בראש מסך התרגול. */
function PinPlaceButton({ place, places }: { place: PinnedPlace; places: PinnedPlace[] | undefined }) {
  const pinned = isPlacePinned(places, place);
  return (
    <button
      className={cn("btn-outline h-8 rounded-full text-xs shrink-0", pinned && "border-gold text-gold bg-gold/10")}
      onClick={() => void togglePinnedPlace(place)}
      title={pinned ? "הסרה מהנעוצים" : "הצמדה לראש מסך התרגול"}
    >
      {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      {pinned ? "נעוץ" : "הצמדה"}
    </button>
  );
}

export default function StudyPage() {
  // ---- מיקום הבחירה ומצב הסשן — במאגר משותף, כדי שיישמרו במעבר לגמרא וחזרה ----
  const st = useStudySession();
  const { corpus, mode, seder, masechta, daf, path, retry, queue, index, revealed, selected, stats, wrongIds, history } = st;
  const set = st.set;

  const [sorting, setSorting] = useState(false);
  const [notice, setNotice] = useState("");
  const [rangeFrom, setRangeFrom] = useState<number | null>(null);
  const [rangeTo, setRangeTo] = useState<number | null>(null);
  useEffect(() => {
    setRangeFrom(null);
    setRangeTo(null);
  }, [masechta]);

  // ---- העדפות סרגל הכלים (נשמרות בין כניסות) ----
  const prefs = useStudyToolbarPrefs();
  const instant = prefs?.instant ?? true;
  const fontScale = prefs?.fontScale ?? 1;

  const pinnedIds = usePinnedCardIds();
  const pinnedPlaces = usePinnedPlaces();

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const decks = useLiveQuery(() => db.decks.toArray(), []);
  const { cards: allCards, counts } = useShasCounts();
  const algorithm = useLiveQuery(async () => ((await db.settings.get("srs-algo"))?.value ?? "sm2") as SrsAlgorithm, []);
  const session = useSession();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteMsg, setNoteMsg] = useState("");
  const shownAt = useRef(Date.now());

  // שעון הסשן — רענון התצוגה פעם בשנייה כשהוא פועל
  const [, setTick] = useState(0);
  useEffect(() => {
    if (queue === null || st.clockStartedAt === null) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [queue, st.clockStartedAt]);
  const elapsed = st.elapsed();

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

  /** התחלת סשן: תרגול חופשי — כל השאלות שנבחרו, בלי להשמיט אף אחת. */
  const beginPractice = (cards: Card[], p: SessionPath, isRetry = false) => {
    if (!cards.length) {
      setNotice("אין שאלות בבחירה הזו.");
      return;
    }
    setNotice("");
    setSorting(false);
    shownAt.current = Date.now();
    st.begin(buildPracticeQueue(cards), p, isRetry);
  };

  /** קפיצה לשלב בבחירה (מפירורי הלחם או מקיצור נעוץ) — יוצאת מהסשן אם צריך. */
  const goTo = (s: string | null, m: string | null = null, d: number | null = null) => {
    st.end();
    setSorting(false);
    setNotice("");
    set("mode", "general");
    set("corpus", 'ש"ס');
    set("seder", s);
    set("masechta", m);
    set("daf", d);
  };

  /** פירורי הלחם של מסלול ש"ס: ש"ס › סדר › מסכת › דף. */
  const shasCrumbs = (s: string | null, m: string | null, d: number | null): Crumb[] => [
    { label: 'ש"ס', onClick: () => goTo(null) },
    ...(s ? [{ label: `סדר ${s}`, onClick: () => goTo(s) }] : []),
    ...(m ? [{ label: m, onClick: () => goTo(s, m) }] : []),
    ...(m && d !== null ? [{ label: `דף ${hebrewDaf(d)}`, onClick: () => goTo(s, m, d) }] : []),
  ];

  /** תרגול עמוד (או כל הדף). שאלות בלי תיוג עמוד שייכות לשני העמודים, כמו במקור. */
  const startAmud = async (amud: "1" | "2" | null) => {
    if (!masechta || daf === null) return;
    const dafStr = String(daf);
    // שליפה ישירה מהמסד — עמיד גם ללחיצה לפני שהטעינה לזיכרון הסתיימה
    const all = await db.cards.where("masechta").equals(masechta).toArray();
    const cards = all.filter((c) => c.daf === dafStr && (amud === null || c.amud == null || c.amud === amud));
    beginPractice(cards, { kind: "shas", masechta, daf, leaf: amud ? AMUD_LABELS[amud] : "כל הדף" });
  };

  /** תרגול מסכת שלמה או טווח דפים. */
  const startRange = async (m: string, from: number, to: number) => {
    const all = await db.cards.where("masechta").equals(m).toArray();
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const cards = all.filter((c) => {
      const n = parseInt(c.daf ?? "", 10);
      return Number.isFinite(n) && n >= lo && n <= hi;
    });
    const dafs = [...(counts.get(m)?.keys() ?? [])];
    const whole = dafs.length > 0 && lo <= Math.min(...dafs) && hi >= Math.max(...dafs);
    beginPractice(cards, { kind: "shas", masechta: m, leaf: whole ? "כל המסכת" : `דפים ${hebrewDaf(lo)}–${hebrewDaf(hi)}` });
  };

  /** תרגול מבחנים: סשן מכל שאלות המבחן — שליפה ישירה, בלי תלות בטעינה לזיכרון. */
  const startDeck = async (deck: Deck) => {
    const [cats, cards] = await Promise.all([db.categories.toArray(), db.cards.toArray()]);
    beginPractice(cardsForDeck(deck, cards, cats), { kind: "deck", name: deck.name });
  };

  /** תרגול השאלות הנעוצות. */
  const startPinned = async () => {
    const ids = [...(pinnedIds ?? [])];
    const cards = (await db.cards.bulkGet(ids)).filter((c): c is Card => !!c);
    beginPractice(cards, { kind: "pinned" });
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
      deckStarted.current = false; // קישור נוסף (גם בלי לצאת מהעמוד) יטופל שוב
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, categories, allCards]);

  // כניסה מתוכנית לימוד: /study?m=<מסכת>&daf=<n>[&amud=1|2] — עמוד/דף אחד;
  // /study?m=<מסכת>&from=<n>&to=<n>&due=1 — "חזרה מהירה": השאלות שהגיע זמנן בטווח שנלמד
  const linkStarted = useRef(false);
  useEffect(() => {
    const m = searchParams.get("m");
    if (!m || linkStarted.current) return;
    linkStarted.current = true;
    (async () => {
      const one = searchParams.get("daf");
      const from = parseInt(searchParams.get("from") ?? one ?? "", 10);
      const to = parseInt(searchParams.get("to") ?? one ?? "", 10);
      const amud = searchParams.get("amud") as "1" | "2" | null;
      const dueOnly = searchParams.get("due") === "1";
      const all = await db.cards.where("masechta").equals(m).toArray();
      const inRange = all.filter((c) => {
        const n = parseInt(c.daf ?? "", 10);
        return Number.isFinite(n) && n >= from && n <= to && (!amud || c.amud == null || c.amud === amud);
      });
      const now = Date.now();
      const due = inRange.filter((c) => c.srs.lastReviewedAt != null && c.srs.dueAt <= now);
      // דף אחד — הדף נכנס למסלול; טווח — מתואר בשלב האחרון
      const single = from === to ? from : undefined;
      const leaf = single !== undefined ? (amud ? AMUD_LABELS[amud] : "כל הדף")
        : from <= 2 && to >= 500 ? "כל המסכת" : `דפים ${hebrewDaf(from)}–${hebrewDaf(to)}`;
      // המקום בבחירה מתעדכן לאותו מקום — "חזרה" מהתרגול מגיעה לשם
      set("mode", "general");
      set("corpus", 'ש"ס');
      set("seder", sederOf(m));
      set("masechta", m);
      set("daf", single ?? null);
      if (dueOnly && due.length) beginPractice(due, { kind: "shas", masechta: m, daf: single, leaf: `חזרה מהירה · ${leaf}` });
      else beginPractice(inRange, { kind: "shas", masechta: m, daf: single, leaf });
      setSearchParams({}, { replace: true });
      linkStarted.current = false; // קישור נוסף (למשל מהחלון הצף) יטופל שוב
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const current = queue?.[index];
  useEffect(() => {
    shownAt.current = Date.now();
  }, [index, queue]);

  const advanceTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);
  const grading = useRef(false);

  const grade = async (quality: 0 | 1 | 2 | 3 | 4 | 5) => {
    window.clearTimeout(advanceTimer.current); // לחיצה על "הבא" בזמן הסימון — בלי ציון כפול
    const s = useStudySession.getState();
    const cur = s.queue?.[s.index];
    if (!cur || grading.current) return;
    grading.current = true;
    try {
      const fresh = (await db.cards.get(cur.id)) ?? cur;
      const correct = quality >= 3;
      const srs = applyReview(fresh, quality, algorithm ?? "sm2");
      let logId = 0;
      await db.transaction("rw", db.cards, db.reviewLogs, async () => {
        await db.cards.update(fresh.id, {
          srs,
          stats: {
            totalReviews: fresh.stats.totalReviews + 1,
            correct: fresh.stats.correct + (correct ? 1 : 0),
            incorrect: fresh.stats.incorrect + (correct ? 0 : 1),
          },
          updatedAt: Date.now(),
        });
        logId = await db.reviewLogs.add({
          cardId: fresh.id, at: Date.now(), quality, correct,
          durationMs: Date.now() - shownAt.current,
        });
      });
      set("history", (h) => [...h, { cardId: fresh.id, prevSrs: fresh.srs, prevStats: fresh.stats, logId, correct }]);
      set("stats", (x) => ({ correct: x.correct + (correct ? 1 : 0), incorrect: x.incorrect + (correct ? 0 : 1) }));
      if (!correct) set("wrongIds", (w) => (w.includes(fresh.id) ? w : [...w, fresh.id]));
      set("revealed", false);
      set("selected", null);
      set("index", (i) => i + 1);
    } finally {
      grading.current = false;
    }
  };

  /** ביטול התשובה האחרונה: מחזיר את מצב השאלה, מוחק את הרישום וחוזר אליה. */
  const undo = async () => {
    window.clearTimeout(advanceTimer.current);
    const s = useStudySession.getState();
    const last = s.history[s.history.length - 1];
    if (!last || grading.current) return;
    grading.current = true;
    try {
      await db.transaction("rw", db.cards, db.reviewLogs, async () => {
        await db.cards.update(last.cardId, { srs: last.prevSrs, stats: last.prevStats });
        if (last.logId) await db.reviewLogs.delete(last.logId);
      });
      set("history", (h) => h.slice(0, -1));
      set("stats", (x) => ({ correct: x.correct - (last.correct ? 1 : 0), incorrect: x.incorrect - (last.correct ? 0 : 1) }));
      if (!last.correct) set("wrongIds", (w) => w.filter((id) => id !== last.cardId));
      set("revealed", false);
      set("selected", null);
      set("index", (i) => Math.max(0, i - 1));
    } finally {
      grading.current = false;
    }
  };

  /** בחירת אפשרות: מסמנים מיד נכון (ירוק ✓) / שגוי (אדום ✗) כמו במקור; במצב "מיידי" עוברים
   *  לשאלה הבאה אחרי הצצה קצרה בסימון (שגיאה מוצגת זמן ארוך יותר, כדי לראות את התשובה הנכונה). */
  const selectOption = (i: number) => {
    const s = useStudySession.getState();
    const cur = s.queue?.[s.index];
    if (!cur || s.revealed) return;
    set("selected", i);
    set("revealed", true);
    if (instant) {
      const ok = isSelectionCorrect(cur, i);
      advanceTimer.current = window.setTimeout(() => { void grade(ok ? 4 : 0); }, ok ? 900 : 1800);
    }
  };

  const togglePinCurrent = () => {
    const cur = useStudySession.getState().queue?.[useStudySession.getState().index];
    if (cur) void togglePinnedCard(cur.id);
  };

  /** שיוך מהיר של השאלה הנוכחית לעמוד (לחיצה שנייה על אותו עמוד — ביטול השיוך). */
  const classifyCurrent = (a: "1" | "2") => {
    if (!current) return;
    const next = current.amud === a ? null : a;
    void setCardsAmud([current.id], next);
    set("queue", (q) => q?.map((c) => (c.id === current.id ? { ...c, amud: next } : c)) ?? null);
  };

  // ---- מקשים בזמן התרגול ----
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      const s = useStudySession.getState();
      const cur = s.queue?.[s.index];
      if (!cur) return;
      if (e.code === "KeyP") { e.preventDefault(); togglePinCurrent(); return; }
      if (e.key === "Backspace") { e.preventDefault(); void undo(); return; }
      const go = e.key === "Enter" || e.key === " ";
      if (hasOptions(cur)) {
        if (!s.revealed) {
          const i = /^[1-8]$/.test(e.key) ? Number(e.key) - 1 : OPTION_KEYS.indexOf(e.key);
          if (i >= 0 && i < cur.options.length) { e.preventDefault(); selectOption(i); }
        } else if (go) {
          e.preventDefault();
          void grade(s.selected !== null && isSelectionCorrect(cur, s.selected) ? 4 : 0);
        }
      } else if (!s.revealed) {
        if (go) { e.preventDefault(); set("revealed", true); }
      } else {
        const q = ({ "1": 0, "2": 3, "3": 4, "4": 5 } as const)[e.key as "1" | "2" | "3" | "4"];
        if (q !== undefined) { e.preventDefault(); void grade(q); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ================= מרכז התרגול =================
  if (queue === null) {
    const sedarimWithCounts = SEDARIM.map((s) => ({
      ...s,
      withContent: s.masechtot.filter((m) => masechtaTotal(m) > 0),
    }));
    const loading = allCards === undefined;
    const pinnedCount = pinnedIds?.size ?? 0;
    const masechtaDafs = masechta ? [...(counts.get(masechta)?.keys() ?? [])].sort((x, y) => x - y) : [];

    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
        {/* נעוצים: השאלות שהוצמדו + קיצורי דרך למסכתות/דפים */}
        {(pinnedCount > 0 || (pinnedPlaces?.length ?? 0) > 0) && (
          <div className="card-panel space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <Pin className="h-4 w-4 text-gold" /> נעוצים
            </div>
            <div className="flex flex-wrap gap-2">
              {pinnedCount > 0 && (
                <button className="btn-gold h-9 rounded-full text-sm" onClick={() => void startPinned()}>
                  <Play className="h-4 w-4" /> השאלות הנעוצות שלי ({pinnedCount})
                </button>
              )}
              {pinnedPlaces?.map((p) => (
                <span key={`${p.masechta}-${p.daf ?? ""}`} className="inline-flex items-center rounded-full border border-gold/50 bg-card">
                  <button
                    className="h-9 ps-3 pe-1 text-sm font-medium hover:text-gold"
                    onClick={() => goTo(sederOf(p.masechta), p.masechta, p.daf ?? null)}
                  >
                    {p.masechta}{p.daf != null ? ` · דף ${hebrewDaf(p.daf)}` : ""}
                  </button>
                  <button className="h-9 w-8 flex items-center justify-center text-muted-foreground hover:text-destructive" title="הסרה מהנעוצים" onClick={() => void togglePinnedPlace(p)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* טאבי תחום */}
        <div className="card-panel p-2 flex gap-2">
          {CORPUS_TABS.map((tab) => (
            <button
              key={tab.name}
              onClick={() => set("corpus", tab.name)}
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
            onClick={() => set("mode", "general")}
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
            onClick={() => set("mode", "tests")}
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

        {notice && <p className="text-sm text-center text-destructive">{notice}</p>}

        {/* תחום שאינו ש"ס — הודעה + קישור להוספת שאלות */}
        {corpus !== 'ש"ס' && (
          <div className="card-panel border-dashed text-center text-muted-foreground py-10">
            לא נמצאו עדיין שאלות בתחום {corpus}. אפשר להוסיף בעמוד{" "}
            <Link to="/questions" className="text-gold hover:underline font-medium">בניית שאלות</Link>.
          </div>
        )}

        {/* ---- תרגול כללי: דרילדאון סדר ← מסכת ← דף ← עמוד ---- */}
        {corpus === 'ש"ס' && mode === "general" && (
          <div className="gold-frame bg-card p-4 space-y-4">
            {/* רמה 1: סדרים */}
            {!seder && !masechta && (
              loading ? (
                <p className="text-center text-sm text-muted-foreground py-8">טוען את מאגר השאלות…</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {sedarimWithCounts.map((s) => (
                    <button
                      key={s.name}
                      disabled={s.withContent.length === 0}
                      onClick={() => set("seder", s.name)}
                      className="card-panel py-4 text-center hover:border-gold transition-colors disabled:opacity-40"
                    >
                      <BookOpen className="h-5 w-5 mx-auto text-gold mb-1.5" />
                      <div className="font-bold">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.withContent.length} מסכתות</div>
                    </button>
                  ))}
                </div>
              )
            )}

            {/* רמה 2: מסכתות הסדר */}
            {seder && !masechta && (
              <div className="space-y-3 animate-slide-in-down">
                <Breadcrumbs className="text-sm" items={shasCrumbs(seder, null, null)} />
                <h3 className="font-bold text-lg">סדר {seder}</h3>
                <div className="flex flex-wrap gap-2">
                  {SEDARIM.find((s) => s.name === seder)?.masechtot.map((m) => {
                    const n = masechtaTotal(m);
                    return (
                      <button
                        key={m}
                        disabled={n === 0}
                        onClick={() => set("masechta", m)}
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

            {/* רמה 3: רשת דפים עם מוני שאלות ומצב תרגול */}
            {masechta && daf === null && (
              <div className="space-y-3 animate-slide-in-down">
                <Breadcrumbs className="text-sm" items={shasCrumbs(seder, masechta, null)} />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-bold text-lg">{masechta} — בחירת דף</h3>
                  <PinPlaceButton place={{ masechta }} places={pinnedPlaces} />
                </div>

                {/* תרגול מסכת שלמה / טווח דפים */}
                {masechtaDafs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm rounded-lg bg-secondary/50 p-2">
                    <button
                      className="btn-gold h-9 rounded-full"
                      onClick={() => void startRange(masechta, masechtaDafs[0], masechtaDafs[masechtaDafs.length - 1])}
                    >
                      <Layers className="h-4 w-4" /> כל המסכת ({masechtaTotal(masechta)})
                    </button>
                    <span className="text-muted-foreground ms-2">או טווח: מדף</span>
                    <select
                      className="input h-9 w-20 py-0"
                      aria-label="מדף"
                      value={rangeFrom ?? masechtaDafs[0]}
                      onChange={(e) => setRangeFrom(Number(e.target.value))}
                    >
                      {masechtaDafs.map((d) => <option key={d} value={d}>{hebrewDaf(d)}</option>)}
                    </select>
                    <span className="text-muted-foreground">עד דף</span>
                    <select
                      className="input h-9 w-20 py-0"
                      aria-label="עד דף"
                      value={rangeTo ?? masechtaDafs[Math.min(masechtaDafs.length - 1, 9)]}
                      onChange={(e) => setRangeTo(Number(e.target.value))}
                    >
                      {masechtaDafs.map((d) => <option key={d} value={d}>{hebrewDaf(d)}</option>)}
                    </select>
                    <button
                      className="btn-outline h-9 rounded-full"
                      onClick={() =>
                        void startRange(
                          masechta,
                          rangeFrom ?? masechtaDafs[0],
                          rangeTo ?? masechtaDafs[Math.min(masechtaDafs.length - 1, 9)]
                        )
                      }
                    >
                      <Play className="h-3.5 w-3.5" /> תרגול הטווח
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-80 overflow-y-auto pr-1">
                  {[...(counts.get(masechta)?.entries() ?? [])]
                    .sort((x, y) => x[0] - y[0])
                    .map(([d, e]) => {
                      const status = dafStatus(e);
                      return (
                        <button
                          key={d}
                          onClick={() => set("daf", d)}
                          title={STATUS_LABEL[status]}
                          className="card-panel py-2.5 px-2 text-center hover:border-gold transition-colors flex items-center justify-center gap-1.5 relative"
                        >
                          {status !== "new" && <span className={cn("absolute top-1.5 left-1.5 h-2.5 w-2.5 rounded-full", STATUS_DOT[status])} />}
                          <span className="font-bold">{hebrewDaf(d)}</span>
                          <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-1.5 py-0.5">
                            {e.a + e.b + e.none}
                          </span>
                        </button>
                      );
                    })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {(["due", "partial", "done"] as DafStatus[]).map((s) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[s])} /> {STATUS_LABEL[s]}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full border border-border" /> {STATUS_LABEL.new}
                  </span>
                </div>
              </div>
            )}

            {/* רמה 4: בחירת עמוד / מיון לעמודים */}
            {masechta && daf !== null && (() => {
              if (sorting) return <AmudSorter masechta={masechta} daf={daf} onClose={() => setSorting(false)} />;
              const e = counts.get(masechta)?.get(daf) ?? emptyDafEntry();
              const total = e.a + e.b + e.none;
              // שאלות בלי תיוג עמוד נספרות בשני העמודים — כמו במקור
              const aCount = e.a + e.none, bCount = e.b + e.none;
              return (
                <div className="space-y-3 animate-slide-in-down">
                  <Breadcrumbs className="text-sm" items={shasCrumbs(seder, masechta, daf)} />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="font-bold text-lg">{masechta}, דף {hebrewDaf(daf)} — בחר עמוד</h3>
                    <div className="flex items-center gap-2">
                      <button className="btn-outline h-8 rounded-full text-xs shrink-0" onClick={() => setSorting(true)}>
                        <Layers className="h-3.5 w-3.5" /> מיון לעמודים
                        {e.none > 0 && <span className="rounded-full bg-gold/20 text-gold font-bold px-1.5">{e.none}</span>}
                      </button>
                      <PinPlaceButton place={{ masechta, daf }} places={pinnedPlaces} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <button
                      disabled={aCount === 0}
                      onClick={() => void startAmud("1")}
                      className="card-panel py-4 text-center hover:border-gold transition-colors disabled:opacity-40"
                    >
                      <div className="font-bold">עמוד א'</div>
                      <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-2 py-0.5">{aCount}</span>
                    </button>
                    <button
                      disabled={bCount === 0}
                      onClick={() => void startAmud("2")}
                      className="card-panel py-4 text-center hover:border-gold transition-colors disabled:opacity-40"
                    >
                      <div className="font-bold">עמוד ב'</div>
                      <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-2 py-0.5">{bCount}</span>
                    </button>
                    <button
                      onClick={() => void startAmud(null)}
                      className="card-panel py-4 text-center border-gold shadow-gold hover:opacity-90 transition-opacity col-span-2 md:col-span-1"
                    >
                      <div className="font-bold">כל הדף</div>
                      <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-2 py-0.5">{total}</span>
                    </button>
                  </div>
                  {e.none > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {e.none} שאלות עוד לא שויכו לעמוד, ולכן מופיעות גם בעמוד א' וגם בעמוד ב'.{" "}
                      <button className="text-gold hover:underline font-medium" onClick={() => setSorting(true)}>למיון עכשיו</button>
                    </p>
                  )}
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
                    <button className="btn-gold shrink-0" onClick={() => void startDeck(d)}>
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

  // ---- פירורי הלחם של הסשן ----
  const sessionCrumbs: Crumb[] =
    path?.kind === "deck"
      ? [{ label: "מבחנים", onClick: () => { st.end(); set("mode", "tests"); } }, { label: path.name }]
      : path?.kind === "pinned"
        ? [{ label: "תרגול", onClick: () => st.end() }, { label: "השאלות הנעוצות" }]
        : path
          ? [...shasCrumbs(sederOf(path.masechta), path.masechta, path.daf ?? null), { label: path.leaf }]
          : [{ label: "תרגול" }];
  if (retry) sessionCrumbs.push({ label: "תיקון טעויות" });
  const modeLabel = retry
    ? "תיקון טעויות"
    : path?.kind === "pinned"
      ? "שאלות נעוצות"
      : path?.kind === "shas" && path.leaf.startsWith("חזרה מהירה")
        ? "חזרה מהירה"
        : "תרגול חופשי";

  // ================= סיום סשן =================
  if (!current) {
    const total = stats.correct + stats.incorrect;
    const retryWrong = async () => {
      const cards = (await db.cards.bulkGet(wrongIds)).filter((c): c is Card => !!c);
      if (path) beginPractice(cards, path, true);
    };
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-fade-in text-center">
        <Breadcrumbs className="text-sm justify-center" items={sessionCrumbs} />
        <h2 className="font-display text-3xl font-bold">הסשן הסתיים 🎉</h2>
        <div className="card-panel gold-frame space-y-2">
          <p className="text-4xl font-bold">{total ? Math.round((stats.correct / total) * 100) : 0}%</p>
          <p className="text-muted-foreground">ענית נכון על {stats.correct} מתוך {total} שאלות · {formatClock(elapsed)} דקות</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {wrongIds.length > 0 && (
            <button className="btn-gold" onClick={() => void retryWrong()}>
              <RotateCcw className="h-4 w-4" /> תרגול חוזר על {wrongIds.length} השאלות שטעית בהן
            </button>
          )}
          {history.length > 0 && (
            <button className="btn-outline" onClick={() => void undo()}>
              <Undo2 className="h-4 w-4" /> חזרה לשאלה האחרונה
            </button>
          )}
          <button className="btn-primary" onClick={() => st.end()}>
            <Check className="h-4 w-4" /> חזרה לתרגול
          </button>
        </div>
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
  const isPinned = !!pinnedIds?.has(current.id);

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
      {/* פירורי לחם + חזרה */}
      <div className="flex items-center justify-between gap-2">
        <Breadcrumbs className="text-base" items={sessionCrumbs} />
        <button className="btn-outline rounded-full shrink-0" onClick={() => st.end()}>
          <X className="h-4 w-4" /> חזרה
        </button>
      </div>

      {/* סרגל כלים: שעון · עצור · מיידי · גופן · הצמדה · ביטול */}
      <div className="card-panel py-2.5 px-3 flex items-center gap-2 flex-wrap text-sm">
        <span className="flex items-center gap-1.5 font-mono font-bold text-gold">
          <Timer className="h-4 w-4" /> {formatClock(elapsed)}
        </span>
        <button
          className={`btn-outline h-8 rounded-full ${st.clockStartedAt !== null ? "" : "border-gold text-gold"}`}
          onClick={() => {
            if (st.clockStartedAt !== null) {
              set("clockBase", st.elapsed());
              set("clockStartedAt", null);
            } else set("clockStartedAt", Date.now());
          }}
        >
          {st.clockStartedAt !== null ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {st.clockStartedAt !== null ? "עצור שעון" : "המשך שעון"}
        </button>
        <button
          className={`btn-outline h-8 rounded-full ${instant ? "border-gold text-gold bg-gold/10" : ""}`}
          title="מעבר אוטומטי לשאלה הבאה אחרי בחירה"
          onClick={() => void saveInstant(!instant)}
        >
          <Zap className="h-3.5 w-3.5" /> מיידי
        </button>
        <button
          className="btn-outline h-8 rounded-full"
          title="גודל גופן"
          onClick={() => void saveFontScale(fontScale >= 1.4 ? 1 : +(fontScale + 0.2).toFixed(1))}
        >
          <Type className="h-3.5 w-3.5" /> {fontScale !== 1 && `×${fontScale}`}
        </button>
        <button
          className={`btn-outline h-8 rounded-full ${isPinned ? "border-gold text-gold bg-gold/10" : ""}`}
          title={isPinned ? "הסרת ההצמדה (פ)" : "הצמדת השאלה לחזרה מאוחרת (פ)"}
          aria-pressed={isPinned}
          onClick={togglePinCurrent}
        >
          <Pin className="h-3.5 w-3.5" /> {isPinned ? "נעוצה" : "הצמדה"}
        </button>
        <button
          className="btn-outline h-8 rounded-full disabled:opacity-40"
          title="ביטול התשובה האחרונה וחזרה אליה (מחיקה אחורה)"
          disabled={history.length === 0}
          onClick={() => void undo()}
        >
          <Undo2 className="h-3.5 w-3.5" /> הקודם
        </button>
        <span className="ms-auto text-muted-foreground">
          {index + 1} / {queue.length} · {modeLabel}
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
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <button
          className="text-muted-foreground hover:text-gold"
          onClick={() => { setNoteOpen((v) => !v); setNoteMsg(""); }}
        >
          💬 הערה על השאלה
        </button>
        {/* שיוך מהיר לעמוד — גם תוך כדי תרגול */}
        {current.masechta && current.daf && (
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{current.amud ? "עמוד:" : "לא שויכה לעמוד:"}</span>
            {(["1", "2"] as const).map((a) => (
              <button
                key={a}
                className={cn(
                  "h-7 px-2.5 rounded-full border transition-colors",
                  current.amud === a ? "border-gold bg-gold/15 text-gold font-bold" : "hover:border-gold"
                )}
                title={current.amud === a ? "לחיצה נוספת מבטלת את השיוך" : `שיוך ל${AMUD_LABELS[a]}`}
                onClick={() => classifyCurrent(a)}
              >
                {AMUD_LABELS[a]}
              </button>
            ))}
          </span>
        )}
        {current.masechta && current.daf && (
          <Link
            to={`/shas?he=${encodeURIComponent(current.masechta)}&daf=${encodeURIComponent(current.daf)}`}
            className="text-gold hover:underline"
          >
            פתיחת הדף בגמרא ←
          </Link>
        )}
      </div>

      {noteOpen && (
        <div className="card-panel space-y-2 animate-slide-in-down">
          {session ? (
            <>
              <textarea
                className="input min-h-16 text-sm"
                placeholder="מה לא מדויק בשאלה או בתשובה? ההערה תישלח למנהל."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <button
                  className="btn-primary h-9 text-sm"
                  disabled={!noteText.trim()}
                  onClick={async () => {
                    try {
                      await sendQuestionNote(session, current, noteText.trim());
                      setNoteText("");
                      setNoteOpen(false);
                      setNoteMsg("✓ ההערה נשלחה — תודה!");
                      setTimeout(() => setNoteMsg(""), 3000);
                    } catch {
                      setNoteMsg("השליחה נכשלה — בדוק חיבור לאינטרנט");
                    }
                  }}
                >
                  שליחת הערה
                </button>
                <button className="btn-ghost h-9 text-sm" onClick={() => setNoteOpen(false)}>ביטול</button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              שליחת הערות דורשת חשבון — <Link to="/login" className="text-gold hover:underline">כניסה</Link>.
            </p>
          )}
        </div>
      )}
      {noteMsg && <p className="text-xs text-gold text-center">{noteMsg}</p>}

      {/* כפתורי ההמשך — דבוקים לתחתית, כך שתמיד גלויים בלי לגלול */}
      <div className="sticky bottom-0 z-10 -mx-2 px-2 pt-2 pb-3 bg-background/95 backdrop-blur-sm space-y-2">
        {!revealed ? (
          !withOptions && (
            <button className="btn-primary w-full h-12" onClick={() => set("revealed", true)}>
              <Eye className="h-4 w-4" /> הצג תשובה
            </button>
          )
        ) : withOptions ? (
          <>
            <p className={`text-center text-sm font-medium ${selectionCorrect ? "text-gold" : "text-destructive"}`}>
              {selectionCorrect ? "תשובה נכונה!" : "תשובה שגויה"}
            </p>
            <button
              className="btn h-12 w-full bg-gradient-gold text-navy shadow-gold hover:opacity-90"
              onClick={() => void grade(selectionCorrect ? 4 : 0)}
            >
              <Check className="h-4 w-4" /> הבא
            </button>
          </>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {QUALITY_BUTTONS.map(({ q, label, cls }, i) => (
              <button key={q} className={`btn h-12 ${cls}`} onClick={() => void grade(q)} title={`מקש ${i + 1}`}>
                {q === 0 ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="hidden md:block text-[11px] text-center text-muted-foreground">
          מקשים: {withOptions ? "1–4 או א–ד לבחירה · אנטר או רווח להמשך" : "אנטר או רווח להצגת התשובה · 1–4 לדירוג"} · פ להצמדה · מחיקה אחורה לשאלה הקודמת
        </p>
      </div>
    </div>
  );
}
