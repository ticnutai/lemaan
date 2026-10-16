import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronRight, CheckCircle2, BookOpen, ArrowRight, CalendarCheck2, Bell, BellOff, Clock, RefreshCw, Calendar, Plus, Trash2, Check, X, ChevronDown, ChevronUp, RotateCcw, Pencil, List, CalendarDays, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useStudy } from "@/lib/study/store";
import { cn } from "@/lib/utils";
import { toHebrewDate } from "@/lib/hebrewDate";
import { RequireAuth } from "@/components/RequireAuth";
import { PlanCalendar } from "@/components/study/PlanCalendar";
import type { ReviewScheduleType, PlanReviewQuality, GeneralStudyPlan } from "@/lib/study/types";
import { PLAN_REVIEW_INTERVALS_DAYS } from "@/lib/study/types";

const PLAN_TYPE_LABELS: Record<string, string> = {
  chumash: "חומש",
  rambam: 'רמב"ם',
  shulchan_aruch: "שולחן ערוך",
  tehillim: "תהילים",
  nach: 'נ"ך',
  shas: 'ש"ס בבלי',
  custom: "מותאם אישית",
  masechta_review: "חזרות מסכתות",
  deck_review: "חזרה על מערכות",
};

const QUALITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "שכחתי", color: "text-destructive" },
  2: { label: "קשה",   color: "text-amber-500" },
  3: { label: "טוב",   color: "text-sky-500" },
  4: { label: "קל",    color: "text-emerald-500" },
};

const REVIEW_INDEX_LABELS: Record<number, string> = {
  1: "חזרה ראשונה",
  2: "חזרה שנייה",
  3: "חזרה שלישית",
  4: "חזרה רביעית",
  5: "חזרה חמישית",
};

// ─── Calendar unit helper ─────────────────────────────────────────────────────
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getCalendarUnitForToday(plan: GeneralStudyPlan): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = isoDate(today);

  const planStart = plan.anchorDate
    ? new Date(plan.anchorDate + "T00:00:00")
    : new Date(plan.startDate);
  planStart.setHours(0, 0, 0, 0);
  if (today < planStart) return null;

  const skipW = new Set(plan.skipWeekdays ?? []);
  const skipD = new Set(plan.skipDates ?? []);
  const upd = Math.max(plan.unitsPerDay ?? 1, 0.001);
  let unitIdx = plan.anchorPosition?.unitIndex ?? 0;
  let fractAcc = 0;

  for (let d = new Date(planStart); d <= today; d.setDate(d.getDate() + 1)) {
    const iso = isoDate(new Date(d));
    if (skipW.has(d.getDay()) || skipD.has(iso)) continue;
    fractAcc += upd;
    const unitsThisDay = Math.floor(fractAcc);
    fractAcc -= unitsThisDay;
    if (unitsThisDay === 0) continue;
    if (iso === todayIso) return plan.units[Math.min(unitIdx, plan.units.length - 1)] ?? null;
    unitIdx = Math.min(unitIdx + unitsThisDay, plan.units.length);
  }
  return null;
}

// ─── Edit Plan Dialog ─────────────────────────────────────────────────────────
function EditPlanDialog({ plan, onClose }: { plan: GeneralStudyPlan; onClose: () => void }) {
  const { updateGeneralPlan } = useStudy();
  const [title, setTitle] = useState(plan.title);
  const [paceInput, setPaceInput] = useState(String(plan.unitsPerDay));
  const [anchorDate, setAnchorDate] = useState(plan.anchorDate ?? "");
  const [anchorUnitSearch, setAnchorUnitSearch] = useState(plan.units[plan.anchorPosition?.unitIndex ?? 0] ?? "");
  const [showUnitDrop, setShowUnitDrop] = useState(false);
  const [skipWeekdays, setSkipWeekdays] = useState<number[]>(plan.skipWeekdays ?? []);

  const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  const toggleSkip = (day: number) =>
    setSkipWeekdays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);

  const anchorUnitIdx = plan.units.indexOf(anchorUnitSearch);
  const validAnchorIdx = anchorUnitIdx >= 0 ? anchorUnitIdx : 0;
  const filteredUnits = anchorUnitSearch
    ? plan.units.filter((u) => u.includes(anchorUnitSearch)).slice(0, 15)
    : plan.units.slice(0, 15);

  const PACE_PRESETS: { label: string; val: number }[] = [
    { label: "2/יום",  val: 2 },
    { label: "1/יום",  val: 1 },
    { label: "2/שבוע", val: 2 / 7 },
    { label: "1/שבוע", val: 1 / 7 },
    { label: "1/חודש", val: 1 / 30 },
  ];

  const handleSave = () => {
    if (!title.trim()) return;
    const pace = Math.max(parseFloat(paceInput) || 1, 0.001);
    updateGeneralPlan(plan.id, {
      title: title.trim(),
      unitsPerDay: pace,
      skipWeekdays: skipWeekdays.length ? skipWeekdays : undefined,
      ...(anchorDate
        ? { anchorDate, anchorPosition: { unitIndex: validAnchorIdx } }
        : { anchorDate: undefined, anchorPosition: undefined }),
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="gold-frame max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-right">עריכת תוכנית</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* שם */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">שם התוכנית</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              className="border-2 border-gold/40 text-right" dir="rtl" />
          </div>

          {/* קצב */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">קצב לימוד</label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0.01} step={0.5} value={paceInput}
                onChange={(e) => setPaceInput(e.target.value)}
                className="border-2 border-gold/40 w-28 text-center" />
              <span className="text-sm text-muted-foreground">יחידות ביום</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {PACE_PRESETS.map(({ label, val }) => (
                <button key={label}
                  onClick={() => setPaceInput(String(val))}
                  className={cn(
                    "text-xs border-2 rounded-full px-3 py-1 transition-colors",
                    Math.abs(parseFloat(paceInput) - val) < 0.001
                      ? "border-gold bg-gold/10 font-semibold"
                      : "border-border hover:border-gold/50",
                  )}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* עוגן */}
          <div className="space-y-2 rounded-xl border-2 border-gold/30 p-3 bg-muted/20">
            <label className="text-xs font-semibold text-muted-foreground">עוגן — תאריך ויחידה</label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              אם ידוע שבתאריך מסוים היית ביחידה מסוימת — הזן כאן.
              הלוח יחשב קדימה מנקודה זו.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)}
                  className="border-2 border-gold/40 text-left flex-1" dir="ltr" />
                {anchorDate && (
                  <span className="text-sm font-semibold text-gold shrink-0">{toHebrewDate(anchorDate)}</span>
                )}
              </div>
              <div>
                <Input
                  value={anchorUnitSearch}
                  onChange={(e) => { setAnchorUnitSearch(e.target.value); setShowUnitDrop(true); }}
                  onFocus={() => setShowUnitDrop(true)}
                  onBlur={() => setTimeout(() => setShowUnitDrop(false), 150)}
                  placeholder="חפש יחידה... (מגילה ב' ע&quot;א)"
                  className="border-2 border-gold/40 text-right"
                  dir="rtl"
                />
                {showUnitDrop && filteredUnits.length > 0 && (
                  <div className="w-full bg-muted border border-border rounded-lg max-h-40 overflow-y-auto mt-1">
                    {filteredUnits.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setAnchorUnitSearch(u); setShowUnitDrop(false); }}
                        className={cn(
                          "w-full text-right px-3 py-1.5 text-sm hover:bg-accent transition-colors",
                          u === anchorUnitSearch && "bg-gold/10 font-semibold",
                        )}
                      >{u}</button>
                    ))}
                  </div>
                )}
                {anchorUnitSearch && anchorUnitIdx < 0 && (
                  <p className="text-[11px] text-destructive mt-1">לא נמצאה יחידה תואמת</p>
                )}
                {anchorUnitIdx >= 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">יחידה {anchorUnitIdx + 1} / {plan.units.length}</p>
                )}
              </div>
              {anchorDate && (
                <button onClick={() => { setAnchorDate(""); setAnchorUnitSearch(""); }}
                  className="text-[11px] text-destructive hover:underline">הסר עוגן</button>
              )}
            </div>
          </div>

          {/* ימי דילוג */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">ימי דילוג</label>
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAY_NAMES.map((name, i) => (
                <button key={i} onClick={() => toggleSkip(i)}
                  className={cn(
                    "text-xs border-2 rounded-full px-2.5 py-1 transition-colors",
                    skipWeekdays.includes(i)
                      ? "border-gold bg-gold/10 font-semibold"
                      : "border-border text-muted-foreground hover:border-gold/50",
                  )}
                >{name}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t border-border mt-4">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSave} className="bg-gradient-navy text-primary-foreground gap-1.5">
            <Check className="h-3.5 w-3.5" /> שמור שינויים
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mini plan-review calendar ───────────────────────────────────────────────
const GREG_MONTHS_CAL = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר",
];
const HEB_DAYS_SHORT = ["א'","ב'","ג'","ד'","ה'","ו'","ש'"];

function PlanReviewMiniCalendar({
  reviews, onMarkDone, onMarkUndone, onPostpone,
}: {
  reviews: import("@/lib/study/types").PlanReview[];
  onMarkDone: (id: string, q: import("@/lib/study/types").PlanReviewQuality) => void;
  onMarkUndone: (id: string) => void;
  onPostpone: (id: string, days: number) => void;
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const byDay = useMemo(() => {
    const m = new Map<string, typeof reviews>();
    reviews.forEach((r) => {
      const list = m.get(r.dueDate) ?? [];
      list.push(r);
      m.set(r.dueDate, list);
    });
    return m;
  }, [reviews]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const selectedDayReviews = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1 rounded hover:bg-secondary">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="font-semibold text-sm">{GREG_MONTHS_CAL[month]} {year}</span>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1 rounded hover:bg-secondary">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground font-semibold mb-1">
        {HEB_DAYS_SHORT.map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayReviews = byDay.get(iso) ?? [];
          const hasDone = dayReviews.some((r) => r.doneAt);
          const hasPending = dayReviews.some((r) => !r.doneAt);
          const hasOverdue = hasPending && iso < today;
          const isToday = iso === today;
          const isSelected = selected === iso;

          return (
            <button
              key={iso}
              onClick={() => setSelected(isSelected ? null : iso)}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg h-9 text-xs font-medium transition-all",
                isSelected ? "bg-gold/20 ring-2 ring-gold" : isToday ? "bg-sky-500/10 ring-2 ring-gold ring-offset-2 ring-offset-background border border-gold" : "hover:bg-secondary",
                dayReviews.length === 0 && "text-muted-foreground/60",
              )}
            >
              <span className={cn(isToday && "font-bold text-sky-600 dark:text-sky-400")}>{day}</span>
              {dayReviews.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {hasOverdue && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
                  {hasPending && !hasOverdue && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
                  {hasDone && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 text-[10px] text-muted-foreground pt-1">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive inline-block" /> פגר</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500 inline-block" /> ממתין</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> בוצע</span>
      </div>

      {selected && selectedDayReviews.length > 0 && (
        <div className="rounded-xl border-2 border-gold/30 bg-card p-3 space-y-2 mt-2">
          <p className="text-xs font-bold text-gold">{selected}</p>
          {selectedDayReviews.map((r) => (
            <ReviewRow key={r.id} r={r} today={today} onMarkDone={onMarkDone} onMarkUndone={onMarkUndone} onPostpone={onPostpone} />
          ))}
        </div>
      )}
      {selected && selectedDayReviews.length === 0 && (
        <p className="text-xs text-muted-foreground text-center pt-2">אין חזרות ביום זה</p>
      )}
    </div>
  );
}

// ─── Shared review row ───────────────────────────────────────────────────────
function ReviewRow({
  r, today, onMarkDone, onMarkUndone, onPostpone,
}: {
  r: import("@/lib/study/types").PlanReview;
  today: string;
  onMarkDone: (id: string, q: import("@/lib/study/types").PlanReviewQuality) => void;
  onMarkUndone: (id: string) => void;
  onPostpone: (id: string, days: number) => void;
}) {
  const [showQuality, setShowQuality] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const overdue = !r.doneAt && r.dueDate < today;
  const dueToday = !r.doneAt && r.dueDate === today;

  const formatDate = (iso: string) => {
    try { return toHebrewDate(new Date(iso + "T00:00:00")); } catch { return iso; }
  };

  return (
    <div className={cn("rounded-lg border px-3 py-2.5 space-y-2 transition-colors",
      r.doneAt ? "border-emerald-500/20 bg-emerald-500/5" : overdue ? "border-destructive/30 bg-destructive/5" : "border-border bg-background",
    )}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{r.unit}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className={cn("text-[11px] font-medium",
              r.doneAt ? "text-emerald-600 dark:text-emerald-400"
              : overdue ? "text-destructive" : dueToday ? "text-amber-500" : "text-muted-foreground",
            )}>
              {r.doneAt ? `✓ בוצע ${formatDate(r.doneAt)}` : overdue ? `⚠ פגר · ${formatDate(r.dueDate)}` : dueToday ? `היום · ${formatDate(r.dueDate)}` : formatDate(r.dueDate)}
            </span>
            <span className="text-[10px] border border-border rounded-full px-1.5 py-0 text-muted-foreground">
              {REVIEW_INDEX_LABELS[r.reviewIndex] ?? `חזרה ${r.reviewIndex}`}
            </span>
          </div>
        </div>

        {r.doneAt ? (
          <button onClick={() => onMarkUndone(r.id)} title="בטל סימון"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onMarkDone(r.id, 3)}
              className="h-7 w-7 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
              title="בוצע ✓"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowQuality((v) => !v)}
              className={cn("h-7 px-1.5 rounded text-[10px] font-semibold border transition-colors",
                showQuality ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/50")}
              title="סמן עם איכות"
            >
              ★
            </button>
            <button onClick={() => setExpanded((v) => !v)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      {!r.doneAt && showQuality && (
        <div className="flex gap-1.5 flex-wrap">
          {([
            { q: 1 as const, label: "שכחתי", cls: "border-destructive/50 text-destructive hover:bg-destructive/10" },
            { q: 2 as const, label: "קשה",   cls: "border-amber-400/60 text-amber-600 hover:bg-amber-50/30" },
            { q: 3 as const, label: "טוב",   cls: "border-sky-400/60 text-sky-600 hover:bg-sky-50/30" },
            { q: 4 as const, label: "קל",    cls: "border-emerald-400/60 text-emerald-600 hover:bg-emerald-50/30" },
          ]).map(({ q, label, cls }) => (
            <button key={q} onClick={() => { onMarkDone(r.id, q); setShowQuality(false); }}
              className={cn("text-xs border-2 rounded-lg px-2.5 py-1 font-semibold transition-colors", cls)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {!r.doneAt && expanded && (
        <div className="flex gap-1.5 flex-wrap">
          {[1, 2, 7, 14].map((d) => (
            <button key={d} onClick={() => { onPostpone(r.id, d); setExpanded(false); }}
              className="text-[11px] border border-border rounded-lg px-2 py-0.5 text-muted-foreground hover:border-gold/50 transition-colors">
              +{d === 1 ? "יום" : d === 7 ? "שבוע" : d === 14 ? "שבועיים" : `${d} ימים`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Review Schedule Tab ──────────────────────────────────────────────────────
function ReviewScheduleTab({ planId }: { planId: string }) {
  const {
    state,
    updateGeneralPlan,
    markPlanReviewDone,
    undoPlanReviewDone,
    postponePlanReview,
    reschedulePlanReviews,
  } = useStudy();

  const plan = (state.generalPlans ?? []).find((p) => p.id === planId);
  const planReviews = useMemo(
    () => (state.planReviews ?? []).filter((r) => r.planId === planId),
    [state.planReviews, planId],
  );

  const globalIntervals: number[] =
    state.planReviewIntervals?.length
      ? state.planReviewIntervals
      : [...PLAN_REVIEW_INTERVALS_DAYS];

  const scheduleType: ReviewScheduleType = plan?.reviewScheduleType ?? "srs";
  const fixedDays = plan?.fixedIntervalDays ?? 30;
  const [localFixed, setLocalFixed] = useState(String(fixedDays));
  const [localManualDate, setLocalManualDate] = useState("");
  const [localCustomReps, setLocalCustomReps] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [rescheduling, setRescheduling] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const { pending, done } = useMemo(() => {
    const p = planReviews.filter((r) => !r.doneAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const d = planReviews.filter((r) => r.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!));
    return { pending: p, done: d };
  }, [planReviews]);

  if (!plan) return null;

  const setType = (t: ReviewScheduleType) => updateGeneralPlan(planId, { reviewScheduleType: t });

  const saveFixed = () => {
    const n = parseInt(localFixed);
    if (n > 0) updateGeneralPlan(planId, { fixedIntervalDays: n });
  };

  const addManualDate = () => {
    if (!localManualDate) return;
    const existing = plan.manualReviewDates ?? [];
    if (existing.includes(localManualDate)) return;
    updateGeneralPlan(planId, { manualReviewDates: [...existing, localManualDate].sort() });
    setLocalManualDate("");
  };

  const removeManualDate = (d: string) =>
    updateGeneralPlan(planId, { manualReviewDates: (plan.manualReviewDates ?? []).filter((x) => x !== d) });

  const setReps = (n: number) => {
    updateGeneralPlan(planId, { reviewRepetitions: n });
    setLocalCustomReps("");
  };

  const currentReps = plan.reviewRepetitions;
  const REP_PRESETS = [1, 2, 3, 5, 7, 10];

  const handleReschedule = () => {
    if (!rescheduling) { setRescheduling(true); return; }
    reschedulePlanReviews(planId);
    setRescheduling(false);
  };

  const formatDate = (iso: string) => {
    try { return toHebrewDate(new Date(iso + "T00:00:00")); } catch { return iso; }
  };

  return (
    <div className="space-y-5">

      {/* ── Repetitions per unit ── */}
      <Card className="gold-frame p-5 space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-gold" />
          <h2 className="font-semibold text-sm">כמה פעמים לחזור על כל יחידה?</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          לאחר שתסמן יחידה כ"סיימתי", יקבעו חזרות עתידיות. כמה חזרות תרצה לכל יחידה?
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          {REP_PRESETS.map((n) => (
            <button
              key={n}
              onClick={() => setReps(n)}
              className={cn(
                "text-sm border-2 rounded-full px-4 py-1.5 font-semibold transition-colors",
                currentReps === n
                  ? "border-gold bg-gold/15 text-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:border-gold/50 hover:text-foreground",
              )}
            >
              {n}×
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              max={50}
              placeholder="אחר"
              value={localCustomReps}
              onChange={(e) => setLocalCustomReps(e.target.value)}
              className="w-20 h-9 text-center border-2 border-gold/30 text-sm"
            />
            {localCustomReps && (
              <Button size="sm" onClick={() => { const n = parseInt(localCustomReps); if (n > 0) setReps(n); }}
                className="bg-gradient-navy text-primary-foreground h-9 px-3">
                <Check className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {currentReps != null && (
          <p className="text-xs text-muted-foreground">
            מוגדר: <span className="text-gold font-bold">{currentReps} חזרות</span> לכל יחידה
          </p>
        )}

        {/* ── Reschedule existing reviews ── */}
        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs font-semibold">סדר מחדש את החזרות הקיימות</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                מחשב מחדש את תאריכי כל החזרות הממתינות לפי ההגדרות הנוכחיות ותאריך הלימוד של כל יחידה.
              </p>
            </div>
            {rescheduling ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" onClick={handleReschedule} className="bg-destructive text-destructive-foreground gap-1 h-8 px-3 text-xs">
                  <Check className="h-3 w-3" /> אישור
                </Button>
                <button onClick={() => setRescheduling(false)} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 h-8">
                  ביטול
                </button>
              </div>
            ) : (
              <Button size="sm" onClick={handleReschedule} variant="outline" className="gap-1 h-8 px-3 text-xs border-2 shrink-0">
                <RefreshCw className="h-3 w-3" /> סדר מחדש
              </Button>
            )}
          </div>
          {rescheduling && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
              ⚠ כל החזרות הממתינות יימחקו ויחושבו מחדש. חזרות שכבר בוצעו ישמרו.
            </p>
          )}
        </div>
      </Card>

      {/* ── Schedule type ── */}
      <Card className="gold-frame p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-gold" />
          <h2 className="font-semibold text-sm">סוג לוח חזרות</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          קבע איך יתוזמנו החזרות לאחר שתסמן כל יחידה כ"סיימתי".
          <br />
          <span className="text-[11px]">שינוי ישפיע רק על יחידות שיסתיימו מכאן ואילך.</span>
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            { id: "srs",            label: "SRS חכם",        icon: <RefreshCw className="h-4 w-4" />, desc: "מרווחים משתנים לפי ביצועים" },
            { id: "fixed_interval", label: "מרווח קבוע",     icon: <Clock className="h-4 w-4" />,     desc: "חזרה כל X ימים" },
            { id: "manual",         label: "תאריכים ידניים", icon: <Calendar className="h-4 w-4" />,  desc: "בחר תאריכים בעצמך" },
            { id: "none",           label: "ללא חזרות",      icon: <BellOff className="h-4 w-4" />,   desc: "ללא תזכורות" },
          ] as { id: string; label: string; icon: React.ReactNode; desc: string }[]).map(({ id, label, icon, desc }) => (
            <button
              key={id}
              onClick={() => setType(id as ReviewScheduleType)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center transition-all",
                scheduleType === id
                  ? "border-gold bg-gold/10 text-foreground shadow-sm"
                  : "border-border hover:border-gold/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={scheduleType === id ? "text-gold" : ""}>{icon}</span>
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{desc}</span>
            </button>
          ))}
        </div>

        {scheduleType === "srs" && (
          <div className="rounded-xl bg-muted/40 p-4 space-y-2 border border-border">
            <p className="text-xs font-semibold">מרווחים ברירת מחדל:</p>
            <div className="flex flex-wrap gap-2">
              {globalIntervals.map((d, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-navy/10 border border-navy/20 px-3 py-1 text-xs font-semibold text-navy dark:text-sky-300">
                  {d === 1 ? "מחר" : d < 7 ? `${d} ימים` : d === 7 ? "שבוע" : d === 30 ? "חודש" : d === 90 ? "רבעון" : `${d} ימים`}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              ניתן לשנות מרווחים אלה בהגדרות → "מרווחי חזרה לתוכניות לימוד"
            </p>
          </div>
        )}

        {scheduleType === "fixed_interval" && (
          <div className="rounded-xl bg-muted/40 p-4 space-y-3 border border-border">
            <p className="text-xs font-semibold">חזרה כל כמה ימים?</p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={365}
                value={localFixed}
                onChange={(e) => setLocalFixed(e.target.value)}
                className="w-24 h-9 text-center border-2 border-gold/40 font-semibold"
              />
              <span className="text-sm text-muted-foreground">ימים</span>
              <Button size="sm" onClick={saveFixed} className="bg-gradient-navy text-primary-foreground gap-1">
                <Check className="h-3.5 w-3.5" /> שמור
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[7, 14, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => { setLocalFixed(String(d)); updateGeneralPlan(planId, { fixedIntervalDays: d }); }}
                  className={cn(
                    "text-xs border-2 rounded-full px-3 py-1 transition-colors",
                    fixedDays === d ? "border-gold bg-gold/10 font-semibold" : "border-border hover:border-gold/50",
                  )}
                >
                  {d === 7 ? "שבוע" : d === 14 ? "שבועיים" : d === 30 ? "חודש" : d === 60 ? "חודשיים" : "רבעון"}
                </button>
              ))}
            </div>
          </div>
        )}

        {scheduleType === "manual" && (
          <div className="rounded-xl bg-muted/40 p-4 space-y-3 border border-border">
            <p className="text-xs font-semibold">תאריכי חזרה קבועים:</p>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={localManualDate}
                onChange={(e) => setLocalManualDate(e.target.value)}
                min={today}
                className="h-9 border-2 border-gold/40 flex-1"
              />
              <Button size="sm" onClick={addManualDate} className="bg-gradient-navy text-primary-foreground gap-1 shrink-0">
                <Plus className="h-3.5 w-3.5" /> הוסף
              </Button>
            </div>
            {(plan.manualReviewDates ?? []).length > 0 ? (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {(plan.manualReviewDates ?? []).map((d) => (
                  <div key={d} className="flex items-center justify-between rounded-lg bg-background border border-border px-3 py-1.5">
                    <span className="text-xs font-semibold">{formatDate(d)}</span>
                    <button onClick={() => removeManualDate(d)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">לא הוגדרו תאריכים עדיין.</p>
            )}
          </div>
        )}

        {scheduleType === ("none" as ReviewScheduleType) && (
          <div className="rounded-xl bg-muted/40 p-4 border border-border text-center text-sm text-muted-foreground">
            לא יתוזמנו חזרות לאחר סיום יחידות.
          </div>
        )}
      </Card>

      {/* ── Review board ── */}
      {planReviews.length > 0 && (
        <Card className="gold-frame overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">לוח חזרות</h2>
              {pending.length > 0 && (
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
                  pending.some((r) => r.dueDate < today) ? "bg-destructive/10 text-destructive" : "bg-sky-500/10 text-sky-600"
                )}>
                  {pending.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors",
                  viewMode === "list" ? "bg-gradient-navy text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <List className="h-3.5 w-3.5" /> רשימה
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors",
                  viewMode === "calendar" ? "bg-gradient-navy text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <CalendarDays className="h-3.5 w-3.5" /> לוח
              </button>
            </div>
          </div>

          {viewMode === "calendar" && (
            <div className="p-4">
              <PlanReviewMiniCalendar
                reviews={planReviews}
                onMarkDone={markPlanReviewDone}
                onMarkUndone={undoPlanReviewDone}
                onPostpone={postponePlanReview}
              />
            </div>
          )}

          {viewMode === "list" && (
            <div className="p-4 space-y-4">
              {pending.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">אין חזרות ממתינות 🎉</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">ממתינות ({pending.length})</p>
                  {pending.map((r) => (
                    <ReviewRow key={r.id} r={r} today={today}
                      onMarkDone={markPlanReviewDone}
                      onMarkUndone={undoPlanReviewDone}
                      onPostpone={postponePlanReview}
                    />
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">בוצעו ({done.length})</p>
                  {done.map((r) => (
                    <ReviewRow key={r.id} r={r} today={today}
                      onMarkDone={markPlanReviewDone}
                      onMarkUndone={undoPlanReviewDone}
                      onPostpone={postponePlanReview}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {planReviews.length === 0 && (
        <Card className="gold-frame p-8 text-center text-sm text-muted-foreground space-y-1">
          <p>אין חזרות ממתינות 🎉</p>
          <p className="text-xs">חזרות יוצרו אוטומטית לאחר סיום יחידות</p>
        </Card>
      )}
    </div>
  );
}

// ─── Main Plan Detail ─────────────────────────────────────────────────────────
function PlanDetailInner() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { state, completeGeneralPlanUnit, undoLastGeneralPlanUnit, uncompleteSpecificUnit, setPlanUnitNote, setGeneralPlanProgressTo } = useStudy();
  const plans = state.generalPlans ?? [];
  const plan = plans.find((p) => p.id === planId);

  const [showEdit, setShowEdit] = useState(false);
  const [noteUnit, setNoteUnit] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const todayScheduledUnit = useMemo(
    () => (plan ? getCalendarUnitForToday(plan) : null),
    [plan],
  );

  const stats = useMemo(() => {
    if (!plan) return null;
    const done = plan.completedUnits.length;
    const total = plan.units.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const nextUnit = plan.units[done];
    const remaining = total - done;
    const etaDays = plan.unitsPerDay > 0 ? Math.ceil(remaining / plan.unitsPerDay) : null;
    return { done, total, pct, nextUnit, remaining, etaDays };
  }, [plan]);

  if (!plan || !stats) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" dir="rtl">
        <p className="text-muted-foreground">תוכנית לא נמצאה</p>
        <Button variant="outline" onClick={() => navigate("/")}>חזרה לדף הבית</Button>
      </div>
    );
  }

  const doneSet = new Set(plan.completedUnits);
  const typeLabel = PLAN_TYPE_LABELS[plan.planType] ?? plan.planType;
  const startDateStr = new Date(plan.startDate).toLocaleDateString("he-IL", {
    day: "numeric", month: "long", year: "numeric",
  });
  const pace = plan.unitsPerDay >= 1
    ? `${plan.unitsPerDay} יח'/יום`
    : `יח' ל-${Math.round(1 / plan.unitsPerDay)} ימים`;

  // Pending reviews count for badge
  const today = new Date().toISOString().slice(0, 10);
  const planReviews = (state.planReviews ?? []).filter((r) => r.planId === plan.id);
  const pendingReviews = planReviews.filter((r) => !r.doneAt);
  const overdueReviews = pendingReviews.filter((r) => r.dueDate < today);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Sticky header */}
      <div className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="חזרה">
            <ChevronRight className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg font-bold truncate">{plan.title}</h1>
            <p className="text-xs text-muted-foreground">{typeLabel} · החל {startDateStr}</p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 font-semibold",
              stats.pct === 100 && "border-emerald-500 text-emerald-600 dark:text-emerald-400",
              stats.pct > 0 && stats.pct < 100 && "border-sky-400 text-sky-600 dark:text-sky-400",
            )}
          >
            {stats.pct}% הושלם
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => setShowEdit(true)} aria-label="עריכה">
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <Tabs defaultValue="study" dir="rtl">
          <TabsList className="w-full mb-6 grid grid-cols-2 h-11">
            <TabsTrigger value="study" className="text-sm font-semibold gap-1.5">
              <BookOpen className="h-4 w-4" /> לימוד
            </TabsTrigger>
            <TabsTrigger value="reviews" className="text-sm font-semibold gap-1.5 relative">
              <Bell className="h-4 w-4" /> חזרות
              {(overdueReviews.length > 0 || pendingReviews.length > 0) && (
                <span className={cn(
                  "absolute -top-1 -left-1 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center",
                  overdueReviews.length > 0 ? "bg-destructive" : "bg-sky-500",
                )}>
                  {pendingReviews.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Study ── */}
          <TabsContent value="study" className="space-y-5 mt-0">
            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "הושלמו",   value: stats.done,     color: "text-emerald-600 dark:text-emerald-400" },
                { label: "נותרו",    value: stats.remaining, color: "text-sky-600 dark:text-sky-400" },
                { label: "ימים נותרו", value: stats.etaDays ?? "–", color: "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <Card key={label} className="gold-frame p-3 text-center">
                  <p className={cn("text-xl font-bold font-display", color)}>{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
                </Card>
              ))}
            </div>

            {/* Progress + next action */}
            <Card className="gold-frame p-5 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">התקדמות כללית</span>
                {(() => {
                  const upd = plan.shasUnit === "amud" ? 2 : plan.shasUnit === "half" ? 4 : 1;
                  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
                  return (
                    <span className="font-semibold">
                      {stats.done} / {stats.total} עמודים
                      <span className="text-muted-foreground font-normal"> · {fmt(stats.done / upd)} / {fmt(stats.total / upd)} דפים</span>
                    </span>
                  );
                })()}
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-navy to-sky-500 transition-all duration-700"
                  style={{ width: `${stats.pct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">קצב: {pace}</p>

              {stats.nextUnit && (
                <div className="pt-3 border-t border-border space-y-3">
                  {/* Calendar-based today unit (if differs from manual next) */}
                  {todayScheduledUnit && todayScheduledUnit !== stats.nextUnit && (
                    <div className="flex items-center gap-2 rounded-xl bg-sky-500/8 border border-sky-400/30 px-3 py-2">
                      <CalendarCheck2 className="h-4 w-4 text-sky-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold">לפי לוח — הלימוד להיום</p>
                        <p className="text-sm font-bold truncate">{todayScheduledUnit}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">
                        {todayScheduledUnit && todayScheduledUnit === stats.nextUnit ? "הלימוד להיום" : "הבאה לסימון"}
                      </p>
                      <p className="font-semibold">{stats.nextUnit}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {plan.completedUnits.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => undoLastGeneralPlanUnit(plan.id)} className="text-muted-foreground">
                          ביטול אחרון
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => completeGeneralPlanUnit(plan.id, stats.nextUnit!)}
                        className="bg-gradient-navy text-primary-foreground gap-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        סיימתי
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {stats.done === stats.total && stats.total > 0 && (
                <div className="pt-3 border-t border-border text-center">
                  <p className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    🎉 כל היחידות הושלמו! כל הכבוד!
                  </p>
                </div>
              )}
            </Card>

            {/* Calendar */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <CalendarCheck2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">לוח ביצוע</h2>
              </div>
              <PlanCalendar
                plan={plan}
                reviews={planReviews}
                onToggle={(unit, currentlyDone) => {
                  const idx = plan.units.indexOf(unit);
                  if (idx < 0) {
                    // fallback to previous behavior
                    return currentlyDone
                      ? uncompleteSpecificUnit(plan.id, unit)
                      : completeGeneralPlanUnit(plan.id, unit);
                  }
                  setGeneralPlanProgressTo(plan.id, currentlyDone ? idx : idx + 1);
                }}
              />
            </div>

            {/* Units list */}
            <Card className="gold-frame overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold text-sm">כל היחידות</h2>
                </div>
                <span className="text-xs text-muted-foreground">{stats.total} יחידות</span>
              </div>
              <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
                {plan.units.map((unit, idx) => {
                  const isDone = doneSet.has(unit);
                  const isNext = !isDone && idx === stats.done;
                  const noteText = plan.unitNotes?.[unit] ?? "";
                  const hasNote = noteText.length > 0;
                  const toggle = () => setGeneralPlanProgressTo(plan.id, isDone ? idx : idx + 1);
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-3 px-5 py-2.5 text-sm transition-colors select-none",
                        "hover:bg-muted/50",
                        isDone && "bg-emerald-500/5 hover:bg-emerald-500/10",
                        isNext && "bg-sky-400/8 font-semibold hover:bg-sky-400/15",
                      )}
                    >
                      <button
                        type="button"
                        onClick={toggle}
                        title={isDone ? "הסר סימון" : "סמן כהושלם"}
                        className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[10px] border transition-colors cursor-pointer",
                          isDone ? "bg-emerald-500 border-emerald-500 text-white hover:bg-destructive hover:border-destructive"
                            : isNext ? "border-sky-400 text-sky-500 hover:bg-sky-400/10"
                              : "border-muted-foreground/30 text-muted-foreground/50 hover:border-foreground/50",
                        )}
                      >
                        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                      </button>
                      <button
                        type="button"
                        onClick={toggle}
                        className={cn("flex-1 text-right cursor-pointer", isDone ? "line-through text-muted-foreground" : undefined)}
                      >
                        {unit}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteUnit(unit);
                          setNoteDraft(noteText);
                        }}
                        title={hasNote ? `הערה: ${noteText}` : "הוסף הערה"}
                        className={cn(
                          "shrink-0 h-7 w-7 rounded-md flex items-center justify-center transition-colors",
                          hasNote
                            ? "text-amber-500 hover:bg-amber-500/10"
                            : "text-muted-foreground/40 hover:text-foreground hover:bg-muted",
                        )}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {isDone
                        ? <button type="button" onClick={toggle} className="text-[10px] text-muted-foreground/60 hover:text-destructive shrink-0">הסר סימון</button>
                        : isNext
                          ? <ArrowRight className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                          : <button type="button" onClick={toggle} className="text-[10px] text-muted-foreground/40 hover:text-foreground shrink-0">סמן</button>
                      }
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>

          {/* ── Tab: Reviews ── */}
          <TabsContent value="reviews" className="mt-0">
            <ReviewScheduleTab planId={plan.id} />
          </TabsContent>
        </Tabs>
      </div>

      {showEdit && <EditPlanDialog plan={plan} onClose={() => setShowEdit(false)} />}

      <Dialog open={noteUnit !== null} onOpenChange={(o) => { if (!o) setNoteUnit(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>הערה ליחידה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{noteUnit}</div>
            <textarea
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="כתוב כאן הערה, תגית או סיבה לסימון…"
              className="w-full min-h-[120px] rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
            <div className="flex justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  if (noteUnit) setPlanUnitNote(plan.id, noteUnit, "");
                  setNoteUnit(null);
                }}
                disabled={!(plan.unitNotes?.[noteUnit ?? ""])}
              >
                מחק הערה
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setNoteUnit(null)}>ביטול</Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (noteUnit) setPlanUnitNote(plan.id, noteUnit, noteDraft);
                    setNoteUnit(null);
                  }}
                >
                  שמור
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PlanDetail() {
  return (
    <RequireAuth>
      <PlanDetailInner />
    </RequireAuth>
  );
}
