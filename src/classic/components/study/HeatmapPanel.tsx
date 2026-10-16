import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalIcon, Activity, AlertTriangle, Clock } from "lucide-react";
import { useStudy } from "@/lib/study/store";
import { dateKey } from "@/lib/study/goals";
import type { ReviewLog, Card as StudyCard, CardType } from "@/lib/study/types";
import { cn } from "@/lib/utils";
import { formatShasPosition } from "@/lib/study/shasFormat";
import { DayDetailDialog } from "./DayDetailDialog";

const DAY = 24 * 60 * 60 * 1000;

type Mode = "activity" | "failures" | "rate";
type ViewType = "calendar" | "hours" | "year";
type Source = "all" | "cards" | "shas" | "plans" | "sessions";

const MODE_LABEL: Record<Mode, string> = {
  activity: "פעילות (חזרות)",
  failures: "כישלונות",
  rate: "אחוז כישלון",
};

const SOURCE_LABEL: Record<Source, string> = {
  all: "כל הפעילות",
  cards: "כרטיסיות בלבד",
  shas: 'ש"ס בלבד',
  plans: "תוכניות בלבד",
  sessions: "סשני לימוד",
};

const TYPE_LABEL: Record<CardType, string> = {
  flashcard: "כרטיסיה",
  multiple: "רב-ברירה",
  boolean: "נכון/לא נכון",
  combo: "משולב",
};

// Unified activity event used for heatmap aggregation
interface ActivityEvent {
  at: number;             // epoch ms
  source: Exclude<Source, "all">;
  success: boolean;       // false counts as "failure"
  label: string;          // for tooltips/details (not used yet)
}

interface Props {
  days?: number;
}

// Parse a yyyy-mm-dd date string to epoch ms (start of day)
function ymdToMs(ymd: string): number {
  const d = new Date(ymd + "T00:00:00");
  return d.getTime();
}

export function HeatmapPanel({ days = 35 }: Props) {
  const { state, setUiPref } = useStudy();
  const [mode, setMode] = useState<Mode>("activity");
  const [view, setView] = useState<ViewType>("calendar");
  const [source, setSource] = useState<Source>("all");
  const [deckId, setDeckId] = useState<string>("all");
  const [cardType, setCardType] = useState<string>("all");
  const [tag, setTag] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // ─── Cloud sync: one-time init from cloud prefs ────────────────────────────
  const cloudInitRef = useRef(false);
  useEffect(() => {
    if (cloudInitRef.current) return;
    const p = state.uiPrefs?.heatmapPrefs;
    if (!p) return;
    cloudInitRef.current = true;
    if (p.mode) setMode(p.mode as Mode);
    if (p.view) setView(p.view as ViewType);
    if (p.source) setSource(p.source as Source);
    if (p.deckId) setDeckId(p.deckId);
    if (p.cardType) setCardType(p.cardType);
    if (p.tag) setTag(p.tag);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state.uiPrefs?.heatmapPrefs]);

  const syncToCloud = useCallback((prefs: { mode: string; view: string; source: string; deckId: string; cardType: string; tag: string }) => {
    setUiPref("heatmapPrefs", prefs);
  }, [setUiPref]);

  // Wrapped setters that also sync to cloud
  const handleSetMode = (v: Mode) => { cloudInitRef.current = true; setMode(v); syncToCloud({ mode: v, view, source, deckId, cardType, tag }); };
  const handleSetView = (v: ViewType) => { cloudInitRef.current = true; setView(v); syncToCloud({ mode, view: v, source, deckId, cardType, tag }); };
  const handleSetSource = (v: Source) => { cloudInitRef.current = true; setSource(v); syncToCloud({ mode, view, source: v, deckId, cardType, tag }); };
  const handleSetDeckId = (v: string) => { cloudInitRef.current = true; setDeckId(v); syncToCloud({ mode, view, source, deckId: v, cardType, tag }); };
  const handleSetCardType = (v: string) => { cloudInitRef.current = true; setCardType(v); syncToCloud({ mode, view, source, deckId, cardType: v, tag }); };
  const handleSetTag = (v: string) => { cloudInitRef.current = true; setTag(v); syncToCloud({ mode, view, source, deckId, cardType, tag: v }); };

  const noteDates = useMemo(() => {
    return new Set((state.dayNotes ?? []).map((n) => n.date));
  }, [state.dayNotes]);

  const cardsById = useMemo(() => {
    const m = new Map<string, StudyCard>();
    state.cards.forEach((c) => m.set(c.id, c));
    return m;
  }, [state.cards]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    state.cards.forEach((c) => c.tags?.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [state.cards]);

  // ─── Build unified activity events from ALL sources ──────────────────────
  const events = useMemo<ActivityEvent[]>(() => {
    const out: ActivityEvent[] = [];

    // 1) SRS card review logs (filtered by deck/type/tag)
    if (source === "all" || source === "cards") {
      state.logs.forEach((l) => {
        if (deckId !== "all" && l.deckId !== deckId) return;
        if (cardType !== "all" || tag !== "all") {
          const c = cardsById.get(l.cardId);
          if (!c) return;
          if (cardType !== "all" && c.type !== cardType) return;
          if (tag !== "all" && !(c.tags ?? []).includes(tag)) return;
        }
        out.push({ at: l.at, source: "cards", success: l.correct, label: "כרטיסיה" });
      });
    }

    // 2) Shas reviews — only doneAt entries count as activity
    if (source === "all" || source === "shas") {
      (state.shasReviews ?? []).forEach((r) => {
        if (!r.doneAt) return;
        out.push({
          at: ymdToMs(r.doneAt),
          source: "shas",
          success: true,
          label: formatShasPosition(r.masechta, r.daf, r.amud, null),
        });
      });
    }

    // 3) Plan reviews — completed entries
    if (source === "all" || source === "plans") {
      (state.planReviews ?? []).forEach((r) => {
        if (!r.doneAt) return;
        out.push({
          at: ymdToMs(r.doneAt),
          source: "plans",
          success: true,
          label: `${r.planTitle} — ${r.unit}`,
        });
      });
    }

    // 4) Learning sessions — quality < 3 counts as a struggle/failure
    if (source === "all" || source === "sessions") {
      (state.learningSessions ?? []).forEach((s) => {
        out.push({
          at: ymdToMs(s.date),
          source: "sessions",
          success: s.quality >= 3,
          label: s.subject,
        });
      });
    }

    return out;
  }, [state.logs, state.shasReviews, state.planReviews, state.learningSessions,
      source, deckId, cardType, tag, cardsById]);

  const valueOfEvents = useCallback((evts: ActivityEvent[]) => {
    if (evts.length === 0) return 0;
    if (mode === "activity") return evts.length;
    if (mode === "failures") return evts.filter((e) => !e.success).length;
    // rate
    const fails = evts.filter((e) => !e.success).length;
    return Math.round((fails / evts.length) * 100);
  }, [mode]);

  // Calendar view: last N days
  const calendarCells = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const grouped = new Map<string, ActivityEvent[]>();
    events.forEach((e) => {
      const k = dateKey(e.at);
      const arr = grouped.get(k) ?? [];
      arr.push(e);
      grouped.set(k, arr);
    });
    const cells: { key: string; date: Date; events: ActivityEvent[]; value: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY);
      const k = dateKey(d.getTime());
      const evts = grouped.get(k) ?? [];
      cells.push({ key: k, date: d, events: evts, value: valueOfEvents(evts) });
    }
    return cells;
  }, [events, days, valueOfEvents]);

  // Hours view: 7 days × 24 hours within last N days
  const hoursMatrix = useMemo(() => {
    const grid: { events: ActivityEvent[] }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ events: [] as ActivityEvent[] }))
    );
    const since = Date.now() - days * DAY;
    events.forEach((e) => {
      if (e.at < since) return;
      const d = new Date(e.at);
      grid[d.getDay()][d.getHours()].events.push(e);
    });
    return grid.map((row) => row.map((cell) => ({ events: cell.events, value: valueOfEvents(cell.events) })));
  }, [events, days, valueOfEvents]);

  // Year view: 53 weeks × 7 days (GitHub style)
  const yearCells = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Start 364 days ago, then back-shift to a Sunday so weeks align
    const start = new Date(today.getTime() - 364 * DAY);
    const startDay = start.getDay(); // 0=Sunday
    start.setDate(start.getDate() - startDay);
    const grouped = new Map<string, ActivityEvent[]>();
    events.forEach((e) => {
      const k = dateKey(e.at);
      const arr = grouped.get(k) ?? [];
      arr.push(e);
      grouped.set(k, arr);
    });
    // Build 53 weeks (columns) of 7 days (rows)
    const weeks: { key: string; date: Date; events: ActivityEvent[]; value: number; future: boolean }[][] = [];
    for (let w = 0; w < 53; w++) {
      const week: typeof weeks[number] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + (w * 7 + d) * DAY);
        const k = dateKey(date.getTime());
        const evts = grouped.get(k) ?? [];
        week.push({ key: k, date, events: evts, value: valueOfEvents(evts), future: date.getTime() > today.getTime() });
      }
      weeks.push(week);
    }
    return weeks;
  }, [events, valueOfEvents]);

  const maxYear = Math.max(1, ...yearCells.flat().map((c) => c.value));

  const maxCal = Math.max(1, ...calendarCells.map((c) => c.value));
  const maxHr = Math.max(1, ...hoursMatrix.flat().map((c) => c.value));

  const cellColor = (value: number, hasData: boolean, max: number) => {
    if (!hasData || value === 0) return "hsl(var(--secondary))";
    const intensity = mode === "rate" ? Math.min(1, value / 100) : Math.min(1, value / max);
    if (mode === "activity") {
      return `hsl(var(--gold) / ${0.25 + intensity * 0.75})`;
    }
    return `hsl(var(--destructive) / ${0.2 + intensity * 0.75})`;
  };

  const tooltip = (date: Date, evts: ActivityEvent[]) => {
    if (evts.length === 0) return `${dateKey(date.getTime())} · אין נתונים`;
    const fails = evts.filter((e) => !e.success).length;
    const rate = Math.round((fails / evts.length) * 100);
    // Breakdown by source
    const bySource = evts.reduce<Record<string, number>>((acc, e) => {
      acc[e.source] = (acc[e.source] ?? 0) + 1;
      return acc;
    }, {});
    const breakdown = Object.entries(bySource)
      .map(([s, c]) => `${SOURCE_LABEL[s as Source] ?? s}: ${c}`)
      .join(", ");
    return `${dateKey(date.getTime())} · ${evts.length} פעילויות · ${fails} שגיאות (${rate}%)\n${breakdown}`;
  };

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const DAY_NAMES = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

  const totalEvents = events.length;
  const totalFails = events.filter((e) => !e.success).length;
  const overallRate = totalEvents > 0 ? Math.round((totalFails / totalEvents) * 100) : 0;
  const cardsOnly = source === "cards" || source === "all";

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="gold-icon-circle">
            {mode === "activity" ? <Activity className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </span>
          <h4 className="font-display text-base font-semibold">מפת חום</h4>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {totalEvents} פעילויות · {totalFails} שגיאות · {overallRate}% כישלון
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Select value={mode} onValueChange={(v) => handleSetMode(v as Mode)}>
          <SelectTrigger className="border-2 border-gold/40 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={source} onValueChange={(v) => handleSetSource(v as Source)}>
          <SelectTrigger className="border-2 border-gold/40 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
              <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={view} onValueChange={(v) => handleSetView(v as ViewType)}>
          <SelectTrigger className="border-2 border-gold/40 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="calendar">תצוגת לוח שנה</SelectItem>
            <SelectItem value="year">שנה מלאה (GitHub)</SelectItem>
            <SelectItem value="hours">יום × שעה</SelectItem>
          </SelectContent>
        </Select>

        <Select value={deckId} onValueChange={handleSetDeckId} disabled={!cardsOnly}>
          <SelectTrigger className="border-2 border-gold/40 h-9 text-xs"><SelectValue placeholder="מערכת" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל המערכות</SelectItem>
            {state.decks.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={cardType} onValueChange={handleSetCardType} disabled={!cardsOnly}>
          <SelectTrigger className="border-2 border-gold/40 h-9 text-xs"><SelectValue placeholder="סוג שאלה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסוגים</SelectItem>
            {(Object.keys(TYPE_LABEL) as CardType[]).map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tag} onValueChange={handleSetTag} disabled={!cardsOnly}>
          <SelectTrigger className="border-2 border-gold/40 h-9 text-xs"><SelectValue placeholder="נושא/תגית" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הנושאים</SelectItem>
            {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          {view === "hours" ? <Clock className="h-3 w-3" /> : <CalIcon className="h-3 w-3" />}
          {view === "hours" ? `יום × שעה · ${days} ימים אחרונים` : view === "year" ? `שנה מלאה (365 ימים)` : `${days} ימים אחרונים`}
        </span>
        <div className="flex items-center gap-1">
          <span>פחות</span>
          {[0.2, 0.4, 0.6, 0.8, 1].map((a) => (
            <div
              key={a}
              className="w-3 h-3 rounded-sm border border-gold/30"
              style={{
                background: mode === "activity"
                  ? `hsl(var(--gold) / ${a})`
                  : `hsl(var(--destructive) / ${a})`,
              }}
            />
          ))}
          <span>יותר</span>
        </div>
      </div>

      {/* Calendar grid */}
      {view === "calendar" && (
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSelectedDate(c.key)}
              title={tooltip(c.date, c.events) + (noteDates.has(c.key) ? " · יש הערה" : "")}
              className="relative aspect-square rounded-sm border border-gold/30 transition-transform hover:scale-110 hover:border-gold focus:outline-none focus:ring-2 focus:ring-gold cursor-pointer"
              style={{ background: cellColor(c.value, c.events.length > 0, maxCal) }}
            >
              {noteDates.has(c.key) && (
                <span
                  aria-hidden
                  className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-gold border border-background"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Hours grid */}
      {view === "hours" && (
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            {/* hour header */}
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: "20px repeat(24, minmax(14px, 1fr))" }}>
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-[8px] text-muted-foreground text-center">
                  {h % 3 === 0 ? h : ""}
                </div>
              ))}
            </div>
            {hoursMatrix.map((row, di) => (
              <div
                key={di}
                className="grid gap-[2px] mt-[2px]"
                style={{ gridTemplateColumns: "20px repeat(24, minmax(14px, 1fr))" }}
              >
                <div className="text-[10px] text-muted-foreground text-center self-center">
                  {DAY_NAMES[di]}
                </div>
                {row.map((cell, hi) => (
                    <div
                      key={hi}
                      title={
                        cell.events.length === 0
                          ? `${DAY_NAMES[di]} ${hi}:00 · אין נתונים`
                          : `${DAY_NAMES[di]} ${hi}:00 · ${cell.events.length} פעילויות · ${cell.events.filter((e) => !e.success).length} שגיאות`
                      }
                      className={cn("aspect-square rounded-sm border border-gold/20")}
                      style={{ background: cellColor(cell.value, cell.events.length > 0, maxHr) }}
                    />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Year grid (GitHub-style: 53 columns × 7 rows) */}
      {view === "year" && (
        <div className="overflow-x-auto" dir="ltr">
          <div className="inline-flex flex-col gap-[2px] min-w-full">
            <div className="flex gap-[3px]">
              <div className="flex flex-col gap-[2px] text-[8px] text-muted-foreground pr-1 justify-around">
                <span>Sun</span>
                <span></span>
                <span>Tue</span>
                <span></span>
                <span>Thu</span>
                <span></span>
                <span>Sat</span>
              </div>
              <div className="flex gap-[2px]">
                {yearCells.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {week.map((cell) => (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => !cell.future && setSelectedDate(cell.key)}
                        disabled={cell.future}
                        title={cell.future ? cell.key : tooltip(cell.date, cell.events) + (noteDates.has(cell.key) ? " · יש הערה" : "")}
                        className={cn(
                          "w-2.5 h-2.5 rounded-[2px] border border-gold/20 transition-transform",
                          !cell.future && "hover:scale-150 hover:border-gold cursor-pointer",
                          cell.future && "opacity-30",
                        )}
                        style={{ background: cell.future ? "transparent" : cellColor(cell.value, cell.events.length > 0, maxYear) }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {totalEvents === 0 && (
        <div className="text-center text-xs text-muted-foreground py-4">
          אין נתונים להצגה עם הפילטרים שנבחרו.
        </div>
      )}

      <DayDetailDialog
        open={selectedDate !== null}
        onOpenChange={(o) => { if (!o) setSelectedDate(null); }}
        dateKeyStr={selectedDate}
      />
    </div>
  );
}
