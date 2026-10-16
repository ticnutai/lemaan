/**
 * PlanScheduleView — "לוח סילוקין" for a GeneralStudyPlan.
 * Two views:
 *   • by-unit  — rows=units, cols=study+reviews (amortization table)
 *   • by-date  — chronological list of all study/review events
 */
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { buildPlanScheduleMap } from "@/lib/study/planSchedule";
import { PLAN_REVIEW_INTERVALS_DAYS } from "@/lib/study/types";
import type { GeneralStudyPlan, PlanReview } from "@/lib/study/types";
import { useStudy } from "@/lib/study/store";
import { CalendarDays, List } from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Build unit → scheduled ISO-date map for all units in the plan. */
function buildUnitToDateMap(plan: GeneralStudyPlan): Map<string, string> {
  const result = new Map<string, string>();
  if (!plan.units?.length) return result;

  const planStart = plan.anchorDate
    ? new Date(plan.anchorDate + "T00:00:00")
    : new Date(plan.startDate);
  planStart.setHours(0, 0, 0, 0);

  // Far-future end — the loop stops as soon as all units are assigned
  const farFuture = new Date(planStart);
  farFuture.setFullYear(farFuture.getFullYear() + 30);

  const map = buildPlanScheduleMap(plan, planStart, farFuture);
  for (const [date, units] of map.entries()) {
    for (const unit of units) {
      if (!result.has(unit)) result.set(unit, date);
    }
  }
  return result;
}

// ── sub-components ────────────────────────────────────────────────────────────

type StudyEvent = {
  date: string;
  type: "study" | "review";
  unit: string;
  done: boolean;
  overdue: boolean;
  reviewId?: string;
  reviewIndex?: number;
};

// ── main export ───────────────────────────────────────────────────────────────

export function PlanScheduleView({
  plan,
  planReviews,
}: {
  plan: GeneralStudyPlan;
  planReviews: PlanReview[];
}) {
  const { completeGeneralPlanUnit, markPlanReviewDone } = useStudy();
  const [view, setView] = useState<"unit" | "date">("unit");
  const [showAll, setShowAll] = useState(false);

  const today = toIso(new Date());
  const completedSet = new Set(plan.completedUnits);
  const intervals = plan.reviewIntervals?.length
    ? plan.reviewIntervals
    : [...PLAN_REVIEW_INTERVALS_DAYS];

  const unitToDate = useMemo(
    () => buildUnitToDateMap(plan),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.id, plan.startDate, plan.anchorDate, plan.anchorPosition?.unitIndex,
     plan.unitsPerDay, plan.skipWeekdays?.join(), plan.skipDates?.join()],
  );

  const reviewsByUnit = useMemo(() => {
    const map = new Map<string, PlanReview[]>();
    for (const r of planReviews) {
      if (!map.has(r.unit)) map.set(r.unit, []);
      map.get(r.unit)!.push(r);
    }
    for (const reviews of map.values()) reviews.sort((a, b) => a.reviewIndex - b.reviewIndex);
    return map;
  }, [planReviews]);

  // ── By-unit (amortization) view ───────────────────────────────────────────
  if (view === "unit") {
    return (
      <div dir="rtl" className="space-y-2 mt-1">
        {/* toggle */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">לוח חזרות פרטני</span>
          <button
            onClick={() => setView("date")}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <CalendarDays className="h-3 w-3" /> לפי תאריך
          </button>
        </div>

        {/* legend */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground px-0.5">
          <span className="text-emerald-600">✓ בוצע</span>
          <span className="text-foreground">○ בוצע/לחץ</span>
          <span className="text-destructive">! פגר</span>
          <span className="text-amber-600">● היום</span>
          <span className="opacity-40">· עתידי</span>
        </div>

        {/* table */}
        <div className="overflow-x-auto rounded-lg border border-gold/25">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-gold/20">
                <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground sticky right-0 bg-muted/40 min-w-[88px]">
                  יחידה
                </th>
                <th className="text-center px-1.5 py-1.5 font-semibold min-w-[54px]">לימוד</th>
                {intervals.map((days, i) => (
                  <th key={i} className="text-center px-1.5 py-1.5 font-semibold min-w-[50px]">
                    ח׳ {i + 1}
                    <span className="text-[9px] font-normal text-muted-foreground block leading-tight">
                      {days}י׳
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.units.map((unit, idx) => {
                const scheduledDate = unitToDate.get(unit);
                const isDone = completedSet.has(unit);
                const isPastOrToday = scheduledDate ? scheduledDate <= today : false;
                const unitReviews = reviewsByUnit.get(unit) ?? [];

                return (
                  <tr
                    key={unit}
                    className={cn(
                      "border-b border-gold/10 hover:bg-gold/5 transition-colors",
                      idx % 2 !== 0 && "bg-muted/10",
                    )}
                  >
                    {/* unit name — sticky */}
                    <td
                      className={cn(
                        "px-2 py-1 font-medium text-right sticky right-0 max-w-[110px] truncate",
                        idx % 2 !== 0 ? "bg-muted/10" : "bg-card",
                        "hover:bg-gold/5",
                      )}
                      title={unit}
                    >
                      {unit}
                    </td>

                    {/* initial study cell */}
                    <td className="px-1 py-0.5 text-center">
                      <button
                        onClick={() => !isDone && completeGeneralPlanUnit(plan.id, unit)}
                        disabled={isDone}
                        className={cn(
                          "flex flex-col items-center mx-auto gap-0 rounded px-1 py-0.5 w-full transition-colors",
                          isDone
                            ? "text-emerald-600 cursor-default"
                            : isPastOrToday
                              ? "text-foreground hover:bg-gold/10 cursor-pointer"
                              : "text-muted-foreground/40 cursor-default",
                        )}
                        title={isDone ? "בוצע" : scheduledDate ? `מתוכנן ל-${scheduledDate}` : "ללא תאריך"}
                      >
                        <span className="text-sm leading-none">
                          {isDone ? "✓" : isPastOrToday ? "○" : "·"}
                        </span>
                        {scheduledDate && (
                          <span className="text-[9px] leading-none opacity-80">{fmtDate(scheduledDate)}</span>
                        )}
                      </button>
                    </td>

                    {/* review cells */}
                    {intervals.map((_, i) => {
                      const review = unitReviews.find((r) => r.reviewIndex === i + 1);

                      if (!review) {
                        // Show expected date if unit is done but review slot missing
                        if (isDone && unitReviews[0] && i < intervals.length) {
                          const base = new Date(unitReviews[0].createdAt);
                          base.setDate(base.getDate() + intervals[i]);
                          return (
                            <td key={i} className="px-1 py-0.5 text-center">
                              <span className="text-muted-foreground/30 text-[9px]">{fmtDate(toIso(base))}</span>
                            </td>
                          );
                        }
                        return (
                          <td key={i} className="px-1 py-0.5 text-center">
                            <span className="text-muted-foreground/20 text-sm leading-none">·</span>
                          </td>
                        );
                      }

                      const isReviewDone = !!review.doneAt;
                      const isOverdue = !review.doneAt && review.dueDate < today;
                      const isDueToday = !review.doneAt && review.dueDate === today;

                      return (
                        <td key={i} className="px-1 py-0.5 text-center">
                          <button
                            onClick={() => !isReviewDone && markPlanReviewDone(review.id)}
                            disabled={isReviewDone}
                            className={cn(
                              "flex flex-col items-center mx-auto gap-0 rounded px-1 py-0.5 w-full transition-colors",
                              isReviewDone
                                ? "text-emerald-600 cursor-default"
                                : isOverdue
                                  ? "text-destructive hover:bg-destructive/5 cursor-pointer"
                                  : isDueToday
                                    ? "text-amber-600 hover:bg-amber-50/30 cursor-pointer"
                                    : "text-muted-foreground/40 cursor-default",
                            )}
                            title={
                              isReviewDone
                                ? `בוצע ${review.doneAt}`
                                : isOverdue
                                  ? `פגר — ${review.dueDate}`
                                  : `מתוכנן ל-${review.dueDate}`
                            }
                          >
                            <span className="text-sm leading-none">
                              {isReviewDone ? "✓" : isOverdue ? "!" : isDueToday ? "●" : "○"}
                            </span>
                            <span className="text-[9px] leading-none opacity-80">
                              {fmtDate(isReviewDone ? review.doneAt! : review.dueDate)}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── By-date view ──────────────────────────────────────────────────────────
  const allEvents: StudyEvent[] = [];

  for (const unit of plan.units) {
    const scheduledDate = unitToDate.get(unit);
    const isDone = completedSet.has(unit);
    if (scheduledDate) {
      allEvents.push({
        date: scheduledDate,
        type: "study",
        unit,
        done: isDone,
        overdue: scheduledDate < today && !isDone,
      });
    }
    for (const review of reviewsByUnit.get(unit) ?? []) {
      const doneAt = review.doneAt;
      allEvents.push({
        date: doneAt ?? review.dueDate,
        type: "review",
        unit,
        done: !!doneAt,
        overdue: !doneAt && review.dueDate < today,
        reviewId: review.id,
        reviewIndex: review.reviewIndex,
      });
    }
  }

  allEvents.sort((a, b) => a.date.localeCompare(b.date));

  // Group by date
  const dateGroups: Array<[string, StudyEvent[]]> = [];
  for (const e of allEvents) {
    const last = dateGroups[dateGroups.length - 1];
    if (last && last[0] === e.date) last[1].push(e);
    else dateGroups.push([e.date, [e]]);
  }

  // Limit to show: past + next 60 days, unless showAll
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 60);
  const cutoffStr = toIso(cutoff);
  const visible = showAll ? dateGroups : dateGroups.filter(([d]) => d <= cutoffStr);
  const hidden = dateGroups.length - visible.length;

  return (
    <div dir="rtl" className="space-y-2 mt-1">
      {/* toggle */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">לוח לפי תאריך</span>
        <button
          onClick={() => setView("unit")}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <List className="h-3 w-3" /> לפי יחידה
        </button>
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto pl-1">
        {visible.map(([date, events]) => (
          <div
            key={date}
            className={cn(
              "rounded-lg border px-2 py-1.5",
              date === today
                ? "border-gold/60 bg-gold/5"
                : date < today
                  ? "border-gold/15 opacity-75"
                  : "border-gold/20",
            )}
          >
            {/* date header */}
            <div
              className={cn(
                "text-[11px] font-bold mb-1",
                date === today ? "text-gold" : date < today ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {date === today ? "היום — " : ""}{fmtDate(date)}
            </div>

            {/* event chips */}
            <div className="flex flex-wrap gap-1">
              {events.map((e, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (e.done) return;
                    if (e.type === "study") completeGeneralPlanUnit(plan.id, e.unit);
                    else if (e.reviewId) markPlanReviewDone(e.reviewId);
                  }}
                  disabled={e.done}
                  className={cn(
                    "text-[10px] rounded-full border px-1.5 py-0.5 flex items-center gap-0.5 transition-colors max-w-[140px] truncate",
                    e.done
                      ? "border-emerald-400/40 text-emerald-600 bg-emerald-50/20 cursor-default"
                      : e.overdue
                        ? "border-destructive/50 text-destructive hover:bg-destructive/5 cursor-pointer"
                        : e.type === "review"
                          ? "border-amber-400/40 text-amber-700 hover:bg-amber-50/20 cursor-pointer"
                          : "border-gold/30 text-foreground hover:bg-gold/5 cursor-pointer",
                  )}
                  title={`${e.type === "study" ? "לימוד ראשוני" : `חזרה ${e.reviewIndex}`}: ${e.unit}`}
                >
                  <span className="shrink-0">{e.done ? "✓" : e.type === "study" ? "📖" : "🔄"}</span>
                  <span className="truncate">{e.unit}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {hidden > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-[11px] text-muted-foreground hover:text-foreground border border-gold/20 rounded-lg py-1.5 transition-colors"
          >
            הצג עוד {hidden} תאריכים →
          </button>
        )}
      </div>
    </div>
  );
}
