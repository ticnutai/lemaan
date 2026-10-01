import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Calendar, Check, ChevronRight, Download, Layers, LayoutGrid, Minus, Palette, Plus, RotateCcw,
  Sparkles, TrendingUp, X,
} from "lucide-react";
import { db } from "../db";
import {
  BOARD_SEDARIM, SHAS_BOARD, TOTAL_AMUDIM, amudChipLabel, amudKey, amudimOf, dapimOf,
  type MasechetInfo,
} from "../features/study/shasBoard";
import { hebrewDaf } from "../features/study/shas";

type View = "seders" | "all" | "plan" | "calendar";

/** צבעי סימון ללוח (כפתור הפלטה) — נשמר בהגדרות. */
const MARK_COLORS = [
  { id: "navy", label: "נייבי", cls: "bg-gradient-navy text-primary-foreground" },
  { id: "gold", label: "זהב", cls: "bg-gradient-gold text-navy" },
  { id: "emerald", label: "ירוק", cls: "bg-emerald-700 text-white" },
  { id: "burgundy", label: "בורדו", cls: "bg-rose-900 text-white" },
];

const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export default function ShasBoardPage() {
  const [view, setView] = useState<View>("all");
  const [openMasechet, setOpenMasechet] = useState<string | null>(null);
  const [openSeder, setOpenSeder] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [repsInput, setRepsInput] = useState(1);
  const [planWindow, setPlanWindow] = useState(14);
  const [dailyTarget, setDailyTarget] = useState(2);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const progress = useLiveQuery(() => db.shasProgress.toArray(), []);
  const log = useLiveQuery(() => db.shasLog.toArray(), []);
  const markColor = useLiveQuery(async () => (await db.settings.get("shas-board-color"))?.value ?? "navy", []);

  const byKey = useMemo(() => new Map((progress ?? []).map((p) => [p.key, p])), [progress]);

  /** התקדמות לכל מסכת. */
  const perMasechet = useMemo(() => {
    const map = new Map<string, { learned: number; reps: number }>();
    for (const m of SHAS_BOARD) map.set(m.name, { learned: 0, reps: 0 });
    for (const p of progress ?? []) {
      const e = map.get(p.masechta);
      if (e && p.reps > 0) { e.learned++; e.reps += p.reps; }
    }
    return map;
  }, [progress]);

  const totalLearned = [...perMasechet.values()].reduce((s, e) => s + e.learned, 0);
  const totalReps = [...perMasechet.values()].reduce((s, e) => s + e.reps, 0);
  const completedMasechtot = SHAS_BOARD.filter((m) => (perMasechet.get(m.name)?.learned ?? 0) >= amudimOf(m)).length;
  const pct = Math.round((totalLearned / TOTAL_AMUDIM) * 100);

  const colorCls = MARK_COLORS.find((c) => c.id === markColor)?.cls ?? MARK_COLORS[0].cls;

  // ---- פעולות סימון ----
  const bump = async (m: MasechetInfo, daf: number, amud: "1" | "2", delta: number) => {
    const key = amudKey(m.name, daf, amud);
    const now = Date.now();
    const existing = await db.shasProgress.get(key);
    const newReps = Math.max(0, (existing?.reps ?? 0) + delta);
    const wasLearned = (existing?.reps ?? 0) > 0;
    if (newReps === 0) await db.shasProgress.delete(key);
    else await db.shasProgress.put({
      key, masechta: m.name, daf, amud, reps: newReps,
      firstAt: existing?.firstAt ?? now, lastAt: now,
    });
    const nowLearned = newReps > 0;
    if (wasLearned !== nowLearned) await db.shasLog.add({ at: now, delta: nowLearned ? 1 : -1 });
  };

  const bulk = async (m: MasechetInfo, keys: string[], action: "learn" | "unlearn" | "add" | "set" | "sub" | "reset") => {
    const now = Date.now();
    let learnedDelta = 0;
    await db.transaction("rw", db.shasProgress, db.shasLog, async () => {
      for (const key of keys) {
        const [, dafS, amud] = key.split("|");
        const daf = Number(dafS);
        const existing = await db.shasProgress.get(key);
        const was = (existing?.reps ?? 0) > 0;
        let reps = existing?.reps ?? 0;
        if (action === "learn") reps = Math.max(1, reps);
        else if (action === "unlearn" || action === "reset") reps = 0;
        else if (action === "add") reps += repsInput;
        else if (action === "sub") reps = Math.max(0, reps - repsInput);
        else if (action === "set") reps = Math.max(0, repsInput);
        if (reps === 0) await db.shasProgress.delete(key);
        else await db.shasProgress.put({
          key, masechta: m.name, daf, amud: amud as "1" | "2", reps,
          firstAt: existing?.firstAt ?? now, lastAt: now,
        });
        learnedDelta += (reps > 0 ? 1 : 0) - (was ? 1 : 0);
      }
      if (learnedDelta !== 0) await db.shasLog.add({ at: now, delta: learnedDelta });
    });
  };

  const exportProgress = () => {
    const rows = (progress ?? []).slice().sort((a, b) => a.masechta.localeCompare(b.masechta, "he") || a.daf - b.daf);
    const csv = ["מסכת,דף,עמוד,חזרות", ...rows.map((p) => `${p.masechta},${hebrewDaf(p.daf)},${p.amud === "1" ? "א" : "ב"},${p.reps}`)].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "לוח-השס-התקדמות.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cycleColor = async () => {
    const i = MARK_COLORS.findIndex((c) => c.id === markColor);
    await db.settings.put({ key: "shas-board-color", value: MARK_COLORS[(i + 1) % MARK_COLORS.length].id });
  };

  // ---- סטטיסטיקות תכנון ----
  const planStats = useMemo(() => {
    const events = (log ?? []).filter((l) => l.delta > 0);
    const since = Date.now() - planWindow * 86400000;
    const perDay = new Map<number, number>();
    for (const e of events) if (e.at >= since) perDay.set(dayStart(e.at), (perDay.get(dayStart(e.at)) ?? 0) + e.delta);
    const daysLearned = perDay.size;
    const sum = [...perDay.values()].reduce((s, v) => s + v, 0);
    const rate = sum / planWindow;
    const best = Math.max(0, ...perDay.values());
    // רצף ימים רצופים עד היום
    let streak = 0;
    for (let d = dayStart(Date.now()); perDay.has(d); d -= 86400000) streak++;
    const remaining = TOTAL_AMUDIM - totalLearned;
    const daysToFinish = rate > 0 ? Math.ceil(remaining / rate) : null;
    const finishAt = daysToFinish ? new Date(Date.now() + daysToFinish * 86400000) : null;
    const targetDays = dailyTarget > 0 ? Math.ceil(remaining / dailyTarget) : null;
    const targetFinish = targetDays ? new Date(Date.now() + targetDays * 86400000) : null;
    return { rate, daysLearned, streak, best, remaining, daysToFinish, finishAt, targetDays, targetFinish };
  }, [log, planWindow, totalLearned, dailyTarget]);

  /** עמודים שנלמדו לכל יום (ללוח השנה). */
  const calDays = useMemo(() => {
    const perDay = new Map<number, number>();
    for (const e of (log ?? [])) if (e.delta > 0) perDay.set(dayStart(e.at), (perDay.get(dayStart(e.at)) ?? 0) + e.delta);
    return perDay;
  }, [log]);

  // ================= מסך מסכת =================
  if (openMasechet) {
    const m = SHAS_BOARD.find((x) => x.name === openMasechet)!;
    const stats = perMasechet.get(m.name) ?? { learned: 0, reps: 0 };
    const total = amudimOf(m);
    const allKeys: string[] = [];
    for (let d = m.startDaf; d <= m.endDaf; d++) for (const a of ["1", "2"] as const) allKeys.push(amudKey(m.name, d, a));

    const toggleSelect = (key: string) =>
      setSelected((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

    const runBulk = async (action: Parameters<typeof bulk>[2]) => {
      await bulk(m, [...selected], action);
      setSelected(new Set());
    };

    return (
      <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1"
            onClick={() => { setOpenMasechet(null); setSelectMode(false); setSelected(new Set()); }}
          >
            <ChevronRight className="h-4 w-4" /> חזרה
          </button>
          <h2 className="font-display text-2xl font-bold">מסכת {m.name}</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full border px-3 py-1 bg-card">{stats.learned}/{total} עמודים ({total ? Math.round((stats.learned / total) * 100) : 0}%)</span>
            <span className="rounded-full border px-3 py-1 bg-card">סך חזרות: {stats.reps}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            className={`btn-outline h-9 rounded-full ${selectMode ? "border-gold text-gold bg-gold/10" : ""}`}
            onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
          >
            <Sparkles className="h-3.5 w-3.5" /> {selectMode ? "יציאה מבחירה" : "מצב בחירה"}
          </button>
          {selectMode && (
            <button
              className="btn-outline h-9 rounded-full"
              onClick={() => setSelected(selected.size === allKeys.length ? new Set() : new Set(allKeys))}
            >
              {selected.size === allKeys.length ? "בטל הכל" : "בחר הכל במסכת"}
            </button>
          )}
          <span className="ms-auto" />
          <button className="btn-outline h-9 w-9 p-0 rounded-full" title="צבע סימון" onClick={cycleColor}><Palette className="h-4 w-4" /></button>
          <button className="btn-outline h-9 w-9 p-0 rounded-full" title="ייצוא התקדמות" onClick={exportProgress}><Download className="h-4 w-4" /></button>
        </div>

        {/* סרגל פעולות במצב בחירה — כמו במקור */}
        {selectMode && (
          <div className="gold-frame bg-card p-3 space-y-2 animate-slide-in-down">
            <p className="text-sm"><b>נבחרו: {selected.size}</b> — בחר עמודים כדי להפעיל פעולות ↓</p>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <button className="btn-outline h-9" disabled={!selected.size} onClick={() => runBulk("learn")}>
                <Check className="h-3.5 w-3.5" /> סמן כנלמד
              </button>
              <button className="btn-outline h-9" disabled={!selected.size} onClick={() => runBulk("unlearn")}>
                <X className="h-3.5 w-3.5" /> סמן כלא נלמד
              </button>
              <span className="flex items-center gap-1 border rounded-full px-2 h-9">
                חזרות:
                <button className="btn-ghost h-6 w-6 p-0" onClick={() => setRepsInput(Math.max(1, repsInput - 1))}><Minus className="h-3 w-3" /></button>
                <b>{repsInput}</b>
                <button className="btn-ghost h-6 w-6 p-0" onClick={() => setRepsInput(repsInput + 1)}><Plus className="h-3 w-3" /></button>
              </span>
              <button className="btn-outline h-9" disabled={!selected.size} onClick={() => runBulk("add")}>+{repsInput}</button>
              <button className="btn-outline h-9" disabled={!selected.size} onClick={() => runBulk("sub")}>-{repsInput}</button>
              <button className="btn-outline h-9" disabled={!selected.size} onClick={() => runBulk("set")}>קבע = {repsInput}</button>
              <button className="btn-outline h-9" disabled={!selected.size} onClick={() => runBulk("reset")}>
                <RotateCcw className="h-3.5 w-3.5" /> איפוס
              </button>
              <button className="btn-ghost h-9" disabled={!selected.size} onClick={() => setSelected(new Set())}>נקה בחירה</button>
            </div>
          </div>
        )}

        {/* רשת העמודים: ב. ב: ג. ג: ... */}
        <div className="gold-frame bg-card p-4">
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5">
            {Array.from({ length: dapimOf(m) }, (_, i) => m.startDaf + i).flatMap((d) =>
              (["1", "2"] as const).map((a) => {
                const key = amudKey(m.name, d, a);
                const p = byKey.get(key);
                const learned = (p?.reps ?? 0) > 0;
                const isSel = selected.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => (selectMode ? toggleSelect(key) : bump(m, d, a, 1))}
                    title={`${m.name} ${hebrewDaf(d)} עמוד ${a === "1" ? "א" : "ב"}${p ? ` · ${p.reps} חזרות` : ""}`}
                    className={`relative h-10 rounded-lg border text-sm font-medium transition-colors ${
                      learned ? colorCls + " border-transparent shadow-sm" : "bg-card hover:border-gold"
                    } ${isSel ? "ring-2 ring-gold ring-offset-1" : ""}`}
                  >
                    {amudChipLabel(d, a)}
                    {p && p.reps > 1 && (
                      <span className="absolute -top-1.5 -left-1.5 h-4 min-w-4 px-0.5 rounded-full bg-gradient-gold text-navy text-[10px] font-bold flex items-center justify-center shadow-gold">
                        {p.reps}
                      </span>
                    )}
                    {selectMode && (
                      <span className={`absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 ${isSel ? "bg-gold border-gold" : "bg-card border-muted-foreground/40"}`} />
                    )}
                  </button>
                );
              })
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            לחיצה על עמוד מסמנת נלמד; כל לחיצה נוספת מוסיפה חזרה (המונה בפינה). ביטול וכיוונון — דרך מצב בחירה.
          </p>
        </div>
      </div>
    );
  }

  // ================= הלוח הראשי =================
  const masechetCard = (m: MasechetInfo) => {
    const stats = perMasechet.get(m.name) ?? { learned: 0, reps: 0 };
    const total = amudimOf(m);
    const p = total ? Math.round((stats.learned / total) * 100) : 0;
    return (
      <button key={m.name} onClick={() => setOpenMasechet(m.name)} className="card-panel p-3 text-right hover:border-gold transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold truncate">{m.name}</p>
            <p className="text-xs text-muted-foreground">{m.seder} · {dapimOf(m)} דפים</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.learned}/{total}</p>
          </div>
          <span className={`text-xs font-bold rounded-full px-2 py-0.5 border ${p === 100 ? "bg-gradient-gold text-navy border-transparent" : "text-gold border-gold/50"}`}>
            {p}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
          <div className="h-full bg-gradient-gold" style={{ width: `${p}%` }} />
        </div>
      </button>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      {/* כותרת עם סטטיסטיקות — כמו במקור */}
      <div className="gold-frame bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" /> לוח לימוד ש"ס
          </h2>
          <div className="flex items-center gap-2">
            <span className="rounded-full border px-3 py-1 text-sm bg-secondary">{totalLearned.toLocaleString()}/{TOTAL_AMUDIM.toLocaleString()} ({pct}%)</span>
            <button className="btn-outline h-9 w-9 p-0 rounded-full" title="צבע סימון" onClick={cycleColor}><Palette className="h-4 w-4" /></button>
            <button className="btn-outline h-9 w-9 p-0 rounded-full" title="ייצוא התקדמות (CSV)" onClick={exportProgress}><Download className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">נלמד</p><p className="font-bold text-gold text-lg">{totalLearned.toLocaleString()}</p></div>
          <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">נשאר לסיום</p><p className="font-bold text-lg">{(TOTAL_AMUDIM - totalLearned).toLocaleString()}</p></div>
          <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">סך חזרות</p><p className="font-bold text-lg">{totalReps.toLocaleString()}</p></div>
          <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">מסכתות הושלמו</p><p className="font-bold text-lg">{completedMasechtot}/{SHAS_BOARD.length}</p></div>
        </div>
      </div>

      {/* טאבי תצוגה */}
      <div className="card-panel p-1.5 flex gap-1.5 flex-wrap">
        {([
          { id: "seders", label: "לפי סדרים", icon: Layers },
          { id: "all", label: "כל המסכתות", icon: LayoutGrid },
          { id: "plan", label: "תכנון לסיום", icon: TrendingUp },
          { id: "calendar", label: "לוח שנה", icon: Calendar },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={
              view === t.id
                ? "flex-1 h-10 rounded-lg bg-gradient-navy text-primary-foreground font-bold flex items-center justify-center gap-1.5 text-sm"
                : "flex-1 h-10 rounded-lg hover:bg-secondary font-medium flex items-center justify-center gap-1.5 text-sm transition-colors"
            }
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* כל המסכתות */}
      {view === "all" && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">{SHAS_BOARD.map(masechetCard)}</div>
      )}

      {/* לפי סדרים */}
      {view === "seders" && (
        <div className="space-y-2.5">
          {BOARD_SEDARIM.map((seder) => {
            const masechtot = SHAS_BOARD.filter((m) => m.seder === seder);
            const total = masechtot.reduce((s, m) => s + amudimOf(m), 0);
            const learned = masechtot.reduce((s, m) => s + (perMasechet.get(m.name)?.learned ?? 0), 0);
            const p = total ? Math.round((learned / total) * 100) : 0;
            const open = openSeder === seder;
            return (
              <div key={seder} className="gold-frame bg-card">
                <button className="w-full p-4 flex items-center justify-between gap-3" onClick={() => setOpenSeder(open ? null : seder)}>
                  <span className="flex items-center gap-2 font-display text-lg font-bold">
                    <span className="h-9 w-9 rounded-full border border-gold/60 flex items-center justify-center"><Layers className="h-4 w-4 text-gold" /></span>
                    סדר {seder}
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    <span className="rounded-full border px-2.5 py-0.5">{masechtot.length} מסכתות</span>
                    <span className="rounded-full border px-2.5 py-0.5 text-gold">{learned}/{total} ({p}%)</span>
                  </span>
                </button>
                {open && <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2.5 animate-slide-in-down">{masechtot.map(masechetCard)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* תכנון לסיום */}
      {view === "plan" && (
        <div className="space-y-3">
          <div className="gold-frame bg-card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5 text-gold" /> תכנון לסיום ש"ס</h3>
              <span className="rounded-full border px-3 py-1 text-sm">נשארו {planStats.remaining.toLocaleString()} עמודים</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              חלון ניתוח קצב:
              {[7, 14, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setPlanWindow(d)}
                  className={planWindow === d ? "h-9 px-3 rounded-lg bg-gradient-gold text-navy font-bold" : "h-9 px-3 rounded-lg border hover:border-gold"}
                >
                  {d} ימים
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">קצב ממוצע</p><p className="font-bold text-gold text-lg">{planStats.rate.toFixed(1)}</p><p className="text-[10px] text-muted-foreground">עמודים / יום</p></div>
              <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">ימי לימוד</p><p className="font-bold text-lg">{planStats.daysLearned}/{planWindow}</p><p className="text-[10px] text-muted-foreground">בחלון</p></div>
              <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">רצף</p><p className="font-bold text-lg">{planStats.streak}</p><p className="text-[10px] text-muted-foreground">ימים רצופים</p></div>
              <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">שיא יומי</p><p className="font-bold text-lg">{planStats.best}</p><p className="text-[10px] text-muted-foreground">בחלון</p></div>
            </div>
            <p className="rounded-lg border px-3 py-2.5 text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gold shrink-0" />
              {planStats.finishAt
                ? <>בקצב הנוכחי תסיים ב־<b>{planStats.finishAt.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}</b> (≈ {planStats.daysToFinish!.toLocaleString()} ימים)</>
                : "סמן עמודים שנלמדו כדי לחשב קצב ותחזית סיום."}
            </p>
          </div>

          <div className="gold-frame bg-card p-4 space-y-3">
            <h3 className="font-bold text-lg">יעד יומי מותאם אישית</h3>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              כמה עמודים ביום?
              <button className="btn-outline h-9 w-9 p-0" onClick={() => setDailyTarget(Math.max(1, dailyTarget - 1))}><Minus className="h-4 w-4" /></button>
              <b className="text-lg w-8 text-center">{dailyTarget}</b>
              <button className="btn-outline h-9 w-9 p-0" onClick={() => setDailyTarget(dailyTarget + 1)}><Plus className="h-4 w-4" /></button>
            </div>
            {planStats.targetFinish && (
              <p className="rounded-lg bg-gold/10 border border-gold/40 px-3 py-2.5 text-sm">
                בקצב של <b>{dailyTarget}</b> עמודים ביום תסיים את הש"ס ב־<b>{planStats.targetFinish.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}</b> (≈ {planStats.targetDays!.toLocaleString()} ימים{planStats.targetDays! > 365 ? `, כ־${(planStats.targetDays! / 365).toFixed(1)} שנים` : ""}).
              </p>
            )}
          </div>
        </div>
      )}

      {/* לוח שנה */}
      {view === "calendar" && (() => {
        const first = new Date(calMonth.y, calMonth.m, 1);
        const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
        const lead = first.getDay(); // 0=ראשון
        const monthTotal = Array.from({ length: daysInMonth }, (_, i) => calDays.get(new Date(calMonth.y, calMonth.m, i + 1).getTime()) ?? 0).reduce((s, v) => s + v, 0);
        return (
          <div className="gold-frame bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <button className="btn-outline h-9 w-9 p-0" onClick={() => setCalMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}>‹</button>
              <h3 className="font-bold text-lg">
                {first.toLocaleDateString("he-IL", { month: "long", year: "numeric" })}
                <span className="text-sm text-gold font-normal mr-2">· {monthTotal} עמודים החודש</span>
              </h3>
              <button className="btn-outline h-9 w-9 p-0" onClick={() => setCalMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}>›</button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
              {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((d) => <span key={d} className="py-1 font-medium">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: lead }).map((_, i) => <span key={`x${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const n = calDays.get(new Date(calMonth.y, calMonth.m, i + 1).getTime()) ?? 0;
                const today = dayStart(Date.now()) === new Date(calMonth.y, calMonth.m, i + 1).getTime();
                return (
                  <div
                    key={i}
                    title={n ? `${n} עמודים` : undefined}
                    className={`h-12 rounded-lg border flex flex-col items-center justify-center text-sm ${
                      n > 0 ? colorCls + " border-transparent font-bold" : "bg-card"
                    } ${today ? "ring-2 ring-gold" : ""}`}
                  >
                    {i + 1}
                    {n > 0 && <span className="text-[10px] opacity-85">{n}</span>}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">כל יום מציג כמה עמודים סומנו בו; היום הנוכחי מוקף זהב.</p>
          </div>
        );
      })()}
    </div>
  );
}
