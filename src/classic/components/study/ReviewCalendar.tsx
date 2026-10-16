import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { useStudy } from "@/lib/study/store";
import { cn } from "@/lib/utils";
import { buildPlanScheduleMap } from "@/lib/study/planSchedule";
import {
  CALENDAR_PLAN_ONLY_SOURCE_LABEL,
  collectPlanSubjectLabelsByDay,
} from "@/lib/study/calendarDataSources";
import {
  computeExpectedShasPosition,
  compactShasCalendarLabel,
  formatShasPosition,
  toHebrewNum,
} from "@/lib/study/shasFormat";
import { DayDetailDialog } from "./DayDetailDialog";
import {
  HDate,
  HebrewCalendar,
  Locale,
  ParshaEvent,
  gematriya,
} from "@hebcal/core";

interface Props {
  deckId?: string;
  showTodayBadge?: boolean;
}

// יום ראשון = א' ... שבת = ש'
const HEB_DAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const GREG_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

// המרת מספר לאותיות עבריות (1-30) לתאריך עברי
const HEB_NUM: Record<number, string> = {
  1: "א",
  2: "ב",
  3: "ג",
  4: "ד",
  5: "ה",
  6: "ו",
  7: "ז",
  8: "ח",
  9: "ט",
  10: "י",
  11: "יא",
  12: "יב",
  13: "יג",
  14: "יד",
  15: "טו",
  16: "טז",
  17: "יז",
  18: "יח",
  19: "יט",
  20: "כ",
  21: "כא",
  22: "כב",
  23: "כג",
  24: "כד",
  25: "כה",
  26: "כו",
  27: "כז",
  28: "כח",
  29: "כט",
  30: "ל",
};
function hebDayLetters(n: number) {
  return HEB_NUM[n] ?? String(n);
}

// Compact label for cell display: "יומא ד." / first 12 chars.
function shortenLabel(label: string, max = 14): string {
  const trimmed = label.trim();
  const compactShas = compactShasCalendarLabel(trimmed);
  if (compactShas) return compactShas;
  // Try to extract "<masechta> דף X" → "<masechta> X."
  const m = trimmed.match(/^(.{1,8}?)\s*דף\s*([א-ת]+)['’]?/);
  if (m) return `${m[1]} ${m[2]}.`;
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + "…";
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isoKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatExpectedShasLabel(pos: {
  masechta: string;
  daf: number;
  amud: 1 | 2;
}) {
  const full = formatShasPosition(pos.masechta, pos.daf, pos.amud, null);
  return compactShasCalendarLabel(full) ?? full;
}

function formatPopupUnitLabel(unit: string) {
  const trimmed = unit.trim();
  const m = trimmed.match(/^([^\s]+)\s+([א-ת]+['׳])\s+(ע"[אב])$/);
  if (m) return `${m[1]} דף ${m[2]} עמוד ${m[3] === 'ע"א' ? "א'" : "ב'"}`;
  return trimmed;
}

export function ReviewCalendar({ deckId, showTodayBadge = true }: Props) {
  const {
    state,
    setUiPref,
    completeGeneralPlanUnit,
    uncompleteSpecificUnit,
    markPlanReviewDone,
    undoPlanReviewDone,
    markShasReviewDone,
    unmarkShasReviewDone,
  } = useStudy();
  const showSubjects = state.uiPrefs?.showCalendarSubjects ?? false;
  const showCompleted = state.uiPrefs?.calShowCompleted ?? true;
  const showHoliday = state.uiPrefs?.calShowHoliday ?? true;
  const [cursor, setCursor] = useState<{ hYear: number; hMonth: number }>(
    () => {
      const hd = new HDate(new Date());
      return { hYear: hd.getFullYear(), hMonth: hd.getMonth() };
    },
  );
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const {
    subjectsByDay,
    planReviewsDueByDay,
    reviewUnitsByDay,
    reviewDoneUnitsByDay,
    reviewCountByDay,
    reviewPendingIdsByDay,
    reviewDoneIdsByDay,
  } = useMemo(() => {
    // Plan reviews (general_plan_reviews) due by day
    const planReviewsDueByDay = new Map<string, number>();
    const reviewUnitsByDay = new Map<string, string[]>();
    const reviewDoneUnitsByDay = new Map<string, string[]>();
    const reviewCountByDay = new Map<string, number>();
    const reviewPendingIdsByDay = new Map<
      string,
      Array<{ type: "plan" | "shas"; id: string }>
    >();
    const reviewDoneIdsByDay = new Map<
      string,
      Array<{ type: "plan" | "shas"; id: string }>
    >();
    (state.planReviews ?? []).forEach((r) => {
      const iso = r.dueDate;
      if (!r.doneAt) {
        planReviewsDueByDay.set(iso, (planReviewsDueByDay.get(iso) ?? 0) + 1);
        reviewCountByDay.set(iso, (reviewCountByDay.get(iso) ?? 0) + 1);
        const units = reviewUnitsByDay.get(iso) ?? [];
        units.push(r.unit);
        reviewUnitsByDay.set(iso, units);
        const ids = reviewPendingIdsByDay.get(iso) ?? [];
        ids.push({ type: "plan", id: r.id });
        reviewPendingIdsByDay.set(iso, ids);
      } else {
        const units = reviewDoneUnitsByDay.get(iso) ?? [];
        units.push(r.unit);
        reviewDoneUnitsByDay.set(iso, units);
        const ids = reviewDoneIdsByDay.get(iso) ?? [];
        ids.push({ type: "plan", id: r.id });
        reviewDoneIdsByDay.set(iso, ids);
      }
    });

    (state.shasReviews ?? []).forEach((r) => {
      if (r.isInitial) return;
      const iso = r.dueDate;
      if (!r.doneAt) {
        reviewCountByDay.set(iso, (reviewCountByDay.get(iso) ?? 0) + 1);
        const units = reviewUnitsByDay.get(iso) ?? [];
        units.push(
          formatShasPosition(r.masechta, r.daf, r.amud, r.half ?? null),
        );
        reviewUnitsByDay.set(iso, units);
        const ids = reviewPendingIdsByDay.get(iso) ?? [];
        ids.push({ type: "shas", id: r.id });
        reviewPendingIdsByDay.set(iso, ids);
      } else {
        const units = reviewDoneUnitsByDay.get(iso) ?? [];
        units.push(
          formatShasPosition(r.masechta, r.daf, r.amud, r.half ?? null),
        );
        reviewDoneUnitsByDay.set(iso, units);
        const ids = reviewDoneIdsByDay.get(iso) ?? [];
        ids.push({ type: "shas", id: r.id });
        reviewDoneIdsByDay.set(iso, ids);
      }
    });

    reviewUnitsByDay.forEach((units, iso) => {
      const unique = Array.from(
        new Set(units.map((u) => formatPopupUnitLabel(u))),
      );
      reviewUnitsByDay.set(iso, unique);
    });
    reviewDoneUnitsByDay.forEach((units, iso) => {
      const unique = Array.from(
        new Set(units.map((u) => formatPopupUnitLabel(u))),
      );
      reviewDoneUnitsByDay.set(iso, unique);
    });

    // Collected study labels per ISO day (newest first within a day)
    const subjectsByDay = collectPlanSubjectLabelsByDay(
      state.learningSessions,
      state.generalPlans,
    );
    return {
      subjectsByDay,
      planReviewsDueByDay,
      reviewUnitsByDay,
      reviewDoneUnitsByDay,
      reviewCountByDay,
      reviewPendingIdsByDay,
      reviewDoneIdsByDay,
    };
  }, [
    state.generalPlans,
    state.learningSessions,
    state.planReviews,
    state.shasReviews,
  ]);

  const { hYear, hMonth } = cursor;
  const gregStart = new HDate(1, hMonth, hYear).greg();
  const gregEnd = new HDate(
    HDate.daysInMonth(hMonth, hYear),
    hMonth,
    hYear,
  ).greg();

  // General study plans: scheduled units by day (all non-masechta_review plans)
  const generalPlansByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        pending: number;
        done: number;
        firstUnit: string;
        pendingUnits: Array<{ planId: string; unit: string }>;
        doneUnits: Array<{ planId: string; unit: string }>;
      }
    >();
    const visibleStart = new HDate(1, hMonth, hYear).greg();
    const visibleEnd = new HDate(
      HDate.daysInMonth(hMonth, hYear),
      hMonth,
      hYear,
    ).greg();
    (state.generalPlans ?? []).forEach((plan) => {
      if (plan.planType === "masechta_review") return;
      if (!plan.units?.length) return;
      const doneSet = new Set(plan.completedUnits);
      const scheduleMap = buildPlanScheduleMap(plan, visibleStart, visibleEnd);
      scheduleMap.forEach((dayUnits, iso) => {
        const pending = dayUnits.filter((u) => !doneSet.has(u));
        const done = dayUnits.filter((u) => doneSet.has(u));
        const cur = map.get(iso) ?? {
          pending: 0,
          done: 0,
          firstUnit: dayUnits[0],
          pendingUnits: [],
          doneUnits: [],
        };
        cur.pending += pending.length;
        cur.done += done.length;
        if (!cur.firstUnit) cur.firstUnit = dayUnits[0];
        pending.forEach((u) =>
          cur.pendingUnits.push({ planId: plan.id, unit: u }),
        );
        done.forEach((u) => cur.doneUnits.push({ planId: plan.id, unit: u }));
        map.set(iso, cur);
      });
    });
    return map;
  }, [state.generalPlans, hYear, hMonth]);

  const firstDay = gregStart.getDay();
  const daysInHebMonth = HDate.daysInMonth(hMonth, hYear);
  const today = new Date();
  const todayKey = dayKey(today);
  const activeShasPlan = useMemo(() => {
    const plans = state.shasPlans ?? [];
    if (plans.length > 0) {
      if (state.activeShasPlanId) {
        const active = plans.find((p) => p.id === state.activeShasPlanId);
        if (active) return active;
      }
      return plans[0];
    }
    return state.shasPlan ?? null;
  }, [state.shasPlans, state.activeShasPlanId, state.shasPlan]);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInHebMonth; d++)
    cells.push(new HDate(d, hMonth, hYear).greg());

  // === לוח עברי: כותרת מרכזית + מיפוי תאריכים עבריים, פרשות וחגים ===
  const hebrewInfo = useMemo(() => {
    // טווח החודש העברי המוצג
    const start = new HDate(1, hMonth, hYear).greg();
    const end = new HDate(
      HDate.daysInMonth(hMonth, hYear),
      hMonth,
      hYear,
    ).greg();
    const events = HebrewCalendar.calendar({
      start,
      end,
      sedrot: true,
      il: true,
      noMinorFast: false,
      noRoshChodesh: false,
      noSpecialShabbat: true,
      locale: "he",
    });

    const parshaByIso = new Map<string, string>();
    const holidayByIso = new Map<string, string>();
    events.forEach((ev) => {
      const d = ev.getDate().greg();
      const k = isoKey(d);
      if (ev instanceof ParshaEvent) {
        parshaByIso.set(k, ev.render("he").replace(/^פרשת\s*/, ""));
      } else {
        const desc = ev.render("he");
        // לא להציג ראש חודש כ"חג" אם רוצים — נשאיר; ניתן לסנן בעתיד
        if (!holidayByIso.has(k)) holidayByIso.set(k, desc);
      }
    });

    // כותרת חודש עברי: לוקחים את ההתחלה והסוף של החודש הלועזי וממפים לחודשים עבריים
    const hStart = new HDate(start);
    const hEnd = new HDate(end);
    const hStartName = Locale.gettext(hStart.getMonthName(), "he");
    const hEndName = Locale.gettext(hEnd.getMonthName(), "he");
    const hStartYear = hStart.getFullYear();
    const hEndYear = hEnd.getFullYear();
    const toHebYear = (y: number) => `ה'${gematriya(y % 1000)}`;
    const hebYearStr =
      hStartYear === hEndYear
        ? toHebYear(hStartYear)
        : `${toHebYear(hStartYear)}–${toHebYear(hEndYear)}`;
    const hebMonthLabel =
      hStartName === hEndName ? hStartName : `${hStartName} – ${hEndName}`;

    // פרשת השבוע הקרובה (היום)
    const todayEvents = HebrewCalendar.calendar({
      start: today,
      end: today,
      sedrot: true,
      il: true,
      locale: "he",
    });
    const todayParsha = todayEvents.find((e) => e instanceof ParshaEvent);
    // אם אין היום — חפש את פרשת השבת הקרובה
    let upcomingParsha: string | null = todayParsha
      ? todayParsha.render("he").replace(/^פרשת\s*/, "")
      : null;
    if (!upcomingParsha) {
      const weekAhead = new Date(today);
      weekAhead.setDate(today.getDate() + 7);
      const evs = HebrewCalendar.calendar({
        start: today,
        end: weekAhead,
        sedrot: true,
        il: true,
        locale: "he",
      });
      const p = evs.find((e) => e instanceof ParshaEvent);
      if (p) upcomingParsha = p.render("he").replace(/^פרשת\s*/, "");
    }

    return {
      parshaByIso,
      holidayByIso,
      hebMonthLabel,
      hebYearStr,
      upcomingParsha,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hYear, hMonth]);

  return (
    <Card className="gold-frame p-5 space-y-4" dir="rtl">
      {/* כותרת: עברי במרכז ובולט; לועזי קטן מתחת */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {/* RTL: ימינה=הקודם */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setCursor(({ hYear: y, hMonth: m }) => {
                let nm = m - 1,
                  ny = y;
                if (nm < 1) {
                  ny--;
                  nm = HDate.isLeapYear(ny) ? 13 : 12;
                }
                return { hYear: ny, hMonth: nm };
              })
            }
            aria-label="חודש קודם"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setCursor(({ hYear: y, hMonth: m }) => {
                let nm = m + 1,
                  ny = y;
                if (nm > (HDate.isLeapYear(ny) ? 13 : 12)) {
                  ny++;
                  nm = 1;
                }
                return { hYear: ny, hMonth: nm };
              })
            }
            aria-label="חודש הבא"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 text-center">
          <h3 className="font-display text-2xl font-bold tracking-tight">
            {hebrewInfo.hebMonthLabel}{" "}
            <span className="text-gold">{hebrewInfo.hebYearStr}</span>
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {gregStart.getMonth() === gregEnd.getMonth()
              ? `${GREG_MONTHS[gregStart.getMonth()]} ${gregStart.getFullYear()}`
              : `${GREG_MONTHS[gregStart.getMonth()]}–${GREG_MONTHS[gregEnd.getMonth()]} ${gregEnd.getFullYear()}`}{" "}
            · לוח חזרות
            {hebrewInfo.upcomingParsha && (
              <>
                {" "}
                · פרשת{" "}
                <span className="text-foreground font-medium">
                  {hebrewInfo.upcomingParsha}
                </span>
              </>
            )}
          </p>
        </div>

        <span className="gold-icon-circle shrink-0">
          <CalendarDays className="h-4 w-4" />
        </span>
      </div>

      {/* Toolbar: subjects toggle */}
      <div className="flex items-center justify-end gap-2 -mt-1">
        <Badge variant="outline" className="h-7 border-gold/60 text-[10px]">
          {CALENDAR_PLAN_ONLY_SOURCE_LABEL}
        </Badge>
        <Button
          variant={showSubjects ? "default" : "outline"}
          size="sm"
          onClick={() => setUiPref("showCalendarSubjects", !showSubjects)}
          title={
            showSubjects
              ? "הסתר את שמות הלימודים על תאי לוח השנה"
              : "הצג את שמות הלימודים על תאי לוח השנה"
          }
          className={cn(
            "h-7 gap-1.5 text-[11px]",
            showSubjects
              ? "bg-gradient-navy text-primary-foreground"
              : "border-gold/60 text-muted-foreground hover:text-foreground",
          )}
        >
          {showSubjects ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          {showSubjects ? "מציג נושאי לימוד" : "הצג נושאי לימוד"}
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {HEB_DAYS.map((d) => (
          <div
            key={d}
            className="text-xs font-semibold text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const k = dayKey(date);
          const iso = isoKey(date);
          const planReviewsDue = planReviewsDueByDay.get(iso) ?? 0;
          const isToday = k === todayKey;
          const hebDate = new HDate(date);
          const hebDay = hebDayLetters(hebDate.getDate());
          const parsha = hebrewInfo.parshaByIso.get(iso);
          const holiday = hebrewInfo.holidayByIso.get(iso);
          const gpDay = generalPlansByDay.get(iso);
          const dayLabels = subjectsByDay.get(iso) ?? [];
          const rawCompleted = (gpDay?.done ?? 0) > 0 || dayLabels.length > 0;
          const firstLabel = dayLabels[0];
          const moreCount = Math.max(0, dayLabels.length - 1);
          const plannedPos = activeShasPlan
            ? computeExpectedShasPosition(activeShasPlan, iso)
            : null;
          const plannedLabel = plannedPos
            ? formatExpectedShasLabel(plannedPos)
            : null;
          const reviewPendingUnits = reviewUnitsByDay.get(iso) ?? [];
          const reviewDoneUnits = reviewDoneUnitsByDay.get(iso) ?? [];
          const reviewUnits =
            reviewPendingUnits.length > 0
              ? reviewPendingUnits
              : reviewDoneUnits;
          const reviewPendingActions = reviewPendingIdsByDay.get(iso) ?? [];
          const reviewDoneActions = reviewDoneIdsByDay.get(iso) ?? [];
          const reviewDone =
            reviewPendingActions.length === 0 && reviewDoneActions.length > 0;
          const reviewCount = reviewCountByDay.get(iso) ?? reviewUnits.length;
          const plannedDone = false;

          // יש משימות מתוכננות היום (מתוכניות כלליות או ש"ס)
          const hasScheduledTasks =
            (gpDay && gpDay.pending + gpDay.done > 0) || !!plannedPos;
          // כל המשימות המתוכננות הושלמו
          const allScheduledDone =
            hasScheduledTasks &&
            (!gpDay || gpDay.pending === 0) &&
            (!plannedPos || plannedDone);
          // ירוק: כל המשימות המתוכננות הושלמו, או (אין תוכנית + יש לוגים/סשן)
          const completed =
            (allScheduledDone || (!hasScheduledTasks && rawCompleted)) &&
            showCompleted;
          // תצוגה: כותרת היחידה הראשונה בתא
          const cellTaskLabel = gpDay?.firstUnit
            ? shortenLabel(gpDay.firstUnit)
            : plannedLabel
              ? shortenLabel(plannedLabel)
              : null;

          return (
            <HoverCard key={i} openDelay={250} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  onClick={() => setSelectedIso(iso)}
                  className={cn(
                    "relative aspect-square rounded-md border text-xs flex flex-col items-center justify-center transition-all hover:ring-2 hover:ring-gold/60 overflow-hidden p-0.5",
                    isToday &&
                      "!border-emerald-600 border-[1.5px] font-bold",
                    !isToday && "border-gold/30",
                    completed
                      ? isToday
                        ? "bg-[rgba(52,178,104,0.30)] text-foreground"
                        : "bg-[rgba(52,178,104,0.30)] border-[rgba(52,178,104,0.40)] text-foreground"
                      : "text-foreground bg-card",
                    holiday && !completed && showHoliday && "bg-gold/10",
                    !completed &&
                      ((gpDay && gpDay.pending > 0) ||
                        (!!plannedPos && !plannedDone)) &&
                      "bg-sky-400/15 border-sky-400/50",
                  )}
                >
                  <div
                    className={cn(
                      "relative z-10 h-full w-full",
                      completed
                        ? "grid grid-rows-[1fr_auto_1fr] items-center gap-y-1 py-1"
                        : "flex flex-col items-center justify-center",
                    )}
                  >
                    <div
                      className={cn(
                        "flex w-full flex-col items-center",
                        completed ? "self-end pb-0.5" : "",
                      )}
                    >
                      {/* תאריך עברי גדול במרכז */}
                      <span
                        className={cn(
                          "font-display leading-none",
                          completed
                            ? "text-base font-extrabold text-[rgb(52,178,104)]"
                            : "text-sm font-bold",
                        )}
                      >
                        {hebDay}
                      </span>
                      {/* תאריך לועזי קטן */}
                      <span className="text-[8px] leading-none text-muted-foreground mt-0.5">
                        {date.getDate()}
                      </span>
                      {/* פרשה / חג בטקסט בלבד, ללא אייקונים */}
                      {showHoliday && (parsha || holiday) && !completed && (
                        <span className="text-[7px] leading-tight text-gold font-semibold truncate max-w-full px-0.5 mt-0.5">
                          {holiday ?? parsha}
                        </span>
                      )}
                    </div>

                    {completed && (
                      <span className="pointer-events-none z-0 mx-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(255,255,255)] border-[1.5px] border-[rgb(198,154,42)] shadow-sm">
                        <Check
                          className="h-3.5 w-3.5 text-[rgb(29,73,135)]"
                          strokeWidth={2.6}
                        />
                      </span>
                    )}

                    <div
                      className={cn(
                        "flex w-full flex-col items-center",
                        completed ? "self-start pt-0.5" : "",
                      )}
                    >
                      {/* חג/פרשה מתחת לוי במצב הושלם */}
                      {showHoliday && (parsha || holiday) && completed && (
                        <span className="text-[7px] leading-tight text-gold font-semibold truncate max-w-full px-0.5 mt-0.5">
                          {holiday ?? parsha}
                        </span>
                      )}
                      {/* שמות לימודים שנלמדו ביום זה — מופיע רק כשהמתג דלוק */}
                      {showSubjects && firstLabel && (
                        <span className="text-[7.5px] leading-tight text-emerald-700 dark:text-emerald-300 font-semibold truncate max-w-full px-0.5 mt-0.5">
                          {shortenLabel(firstLabel)}
                          {moreCount > 0 && (
                            <span className="text-muted-foreground">
                              {" "}
                              +{moreCount}
                            </span>
                          )}
                        </span>
                      )}
                      {/* שם המשימה המתוכננת ליום זה — תוכניות כלליות + ש"ס */}
                      {cellTaskLabel && !completed && (
                        <span
                          className={cn(
                            "text-[7px] leading-tight font-semibold truncate max-w-full px-0.5 mt-0.5",
                            allScheduledDone
                              ? "text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.9)]"
                              : "text-navy/70 dark:text-blue-300/80",
                          )}
                        >
                          {cellTaskLabel}
                        </span>
                      )}
                      {/* תכנון ש"ס לפי עוגן (legacy plan) — כשאין תוכנית כללית */}
                      {plannedLabel && !gpDay && completed && (
                        <span className="text-[7px] leading-tight font-semibold truncate max-w-full px-0.5 mt-0.5 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.9)]">
                          {shortenLabel(plannedLabel)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* מונה חזרות תוכנית */}
                  {planReviewsDue > 0 && (
                    <span className="absolute bottom-0.5 left-2 h-1.5 w-1.5 rounded-full bg-violet-500" />
                  )}
                </button>
              </HoverCardTrigger>
              <HoverCardContent
                side="top"
                align="center"
                sideOffset={6}
                collisionPadding={12}
                className="w-72 p-0 border-2 border-gold/40 shadow-elegant overflow-hidden"
                dir="rtl"
              >
                <div className="bg-gradient-to-l from-gold/15 via-secondary/40 to-transparent px-3 py-2 border-b border-gold/30">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-right">
                      <div className="font-display font-bold text-base text-foreground">
                        {hebDay} {hebrewInfo.hebMonthLabel.split(" ")[0]}
                      </div>
                      {(parsha || holiday) && (
                        <div className="text-[11px] text-gold font-semibold">
                          {holiday ? holiday : `פרשת ${parsha}`}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {date.getDate()}/{date.getMonth() + 1}/
                      {date.getFullYear()}
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-2 text-right text-xs">
                  {gpDay && gpDay.pending > 0 && (
                    <div className="rounded-md bg-sky-500/10 border border-sky-500/30 px-2 py-1.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            gpDay.pendingUnits.forEach(({ planId, unit }) =>
                              completeGeneralPlanUnit(planId, unit, iso),
                            );
                          }}
                          title="סמן כבוצע"
                          className="h-6 w-6 transition-all flex items-center justify-center shrink-0"
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/35 bg-muted/70 hover:border-muted-foreground/55">
                            <Check className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.6} />
                          </span>
                        </button>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-[10px] text-muted-foreground">
                            לימוד:
                          </div>
                          <div className="font-semibold truncate">
                            {formatPopupUnitLabel(
                              gpDay.pendingUnits[0]?.unit ?? gpDay.firstUnit,
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-sky-500 text-sky-600 dark:text-sky-400"
                        >
                          {gpDay.pending} יח'
                        </Badge>
                      </div>
                      <div className="space-y-0.5">
                        {gpDay.pendingUnits
                          .slice(1, 7)
                          .map(({ planId, unit }, idx) => (
                            <div
                              key={`${planId}-${idx}`}
                              className="text-[11px] text-foreground/90 truncate"
                            >
                              {formatPopupUnitLabel(unit)}
                            </div>
                          ))}
                        {gpDay.pendingUnits.length > 7 && (
                          <div className="text-[10px] text-muted-foreground">
                            +{gpDay.pendingUnits.length - 7} יחידות נוספות
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {gpDay && gpDay.done > 0 && gpDay.pending === 0 && (
                    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-1.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            gpDay.doneUnits.forEach(({ planId, unit }) =>
                              uncompleteSpecificUnit(planId, unit),
                            );
                          }}
                          title="בטל סימון"
                          className="h-6 w-6 transition-all flex items-center justify-center shrink-0"
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(255,255,255)] border-[1.5px] border-[rgb(198,154,42)] shadow-sm">
                            <Check
                              className="h-3.5 w-3.5 text-[rgb(29,73,135)]"
                              strokeWidth={2.6}
                            />
                          </span>
                        </button>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-[10px] text-muted-foreground">
                            לימוד:
                          </div>
                          <div className="font-semibold truncate">
                            {formatPopupUnitLabel(
                              gpDay.doneUnits[0]?.unit ?? gpDay.firstUnit,
                            )}
                          </div>
                        </div>
                        <Badge className="text-[10px] bg-emerald-600 text-primary-foreground">
                          {gpDay.done} יח'
                        </Badge>
                      </div>
                    </div>
                  )}
                  {plannedLabel && (
                    <div className="rounded-md bg-sky-500/10 border border-sky-500/30 px-2 py-1.5">
                      <div className="text-[10px] text-muted-foreground mb-1">
                        לימוד:
                      </div>
                      <div className="font-semibold text-foreground">
                        {plannedLabel}
                      </div>
                    </div>
                  )}
                  {reviewUnits.length > 0 && (
                    <div
                      className={cn(
                        "rounded-md px-2 py-1.5 space-y-0.5 border",
                        reviewDone
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-violet-500/10 border-violet-500/30",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!reviewDone) {
                              reviewPendingActions.forEach((r) => {
                                if (r.type === "plan") markPlanReviewDone(r.id);
                                else markShasReviewDone(r.id, iso);
                              });
                            } else {
                              reviewDoneActions.forEach((r) => {
                                if (r.type === "plan") undoPlanReviewDone(r.id);
                                else unmarkShasReviewDone(r.id);
                              });
                            }
                          }}
                          title={reviewDone ? "בטל סימון" : "סמן כבוצע"}
                          className="h-6 w-6 transition-all flex items-center justify-center shrink-0"
                        >
                          {reviewDone ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(255,255,255)] border-[1.5px] border-[rgb(198,154,42)] shadow-sm">
                              <Check
                                className="h-3.5 w-3.5 text-[rgb(29,73,135)]"
                                strokeWidth={2.6}
                              />
                            </span>
                          ) : (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/35 bg-muted/70 hover:border-muted-foreground/55">
                              <Check className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.6} />
                            </span>
                          )}
                        </button>
                        <div className="text-[10px] text-muted-foreground">
                          חזרה:
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-violet-500 text-violet-600 dark:text-violet-400"
                        >
                          {reviewCount}
                        </Badge>
                      </div>
                      {reviewUnits.slice(0, 4).map((unit, idx) => (
                        <div
                          key={idx}
                          className="font-semibold text-foreground truncate"
                        >
                          {unit}
                        </div>
                      ))}
                      {reviewUnits.length > 4 && (
                        <div className="text-[10px] text-muted-foreground">
                          +{reviewUnits.length - 4} יחידות נוספות
                        </div>
                      )}
                    </div>
                  )}
                  {dayLabels.length > 0 && (
                    <div className="rounded-md bg-secondary/50 border border-gold/20 px-2 py-1.5">
                      <div className="text-[10px] text-muted-foreground mb-1">
                        נלמד ביום זה:
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {dayLabels.slice(0, 8).map((l, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-[10px] border-gold/40"
                          >
                            {l}
                          </Badge>
                        ))}
                        {dayLabels.length > 8 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-gold/40"
                          >
                            +{dayLabels.length - 8}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  {planReviewsDue === 0 &&
                    dayLabels.length === 0 &&
                    !plannedPos &&
                    !gpDay &&
                    reviewUnits.length === 0 && (
                      <div className="text-muted-foreground text-center py-2">
                        אין נתוני לימוד ביום זה
                      </div>
                    )}
                  <div className="text-[10px] text-muted-foreground text-center pt-1 border-t border-gold/15">
                    לחץ לפתיחת פרטי היום המלאים
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-gold/20">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setUiPref("calShowCompleted", !showCompleted)}
            title={showCompleted ? "לחץ להסתיר הושלם" : "לחץ להציג הושלם"}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-all select-none cursor-pointer",
              showCompleted ? "opacity-100" : "opacity-30 line-through",
            )}
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" /> הושלם
          </button>
          <button
            type="button"
            onClick={() => setUiPref("calShowHoliday", !showHoliday)}
            title={showHoliday ? "לחץ להסתיר חג / מועד" : "לחץ להציג חג / מועד"}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-all select-none cursor-pointer",
              showHoliday ? "opacity-100" : "opacity-30 line-through",
            )}
          >
            <span className="h-3 w-3 rounded-sm bg-gold/20 border border-gold/40 shrink-0" />{" "}
            חג / מועד
          </button>
        </div>
      </div>
      <DayDetailDialog
        open={selectedIso !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedIso(null);
        }}
        dateKeyStr={selectedIso}
      />
    </Card>
  );
}
