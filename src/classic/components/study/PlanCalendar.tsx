import { useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  CalendarDays,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  HDate,
  HebrewCalendar,
  Locale,
  ParshaEvent,
  gematriya,
} from "@hebcal/core";
import { cn } from "@/lib/utils";
import type { GeneralStudyPlan, PlanReview } from "@/lib/study/types";
import { buildPlanScheduleMap } from "@/lib/study/planSchedule";
import { compactShasCalendarLabel } from "@/lib/study/shasFormat";
import { DayDetailDialog } from "./DayDetailDialog";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function isoKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function shortenUnit(label: string, max = 13): string {
  const compactShas = compactShasCalendarLabel(label);
  if (compactShas) return compactShas;
  if (label.length <= max) return label;
  // "ברכות ב' ע\"א" → "ברכות ב'."
  const m = label.match(/^(.{1,8}?)\s+([\u05d0-\u05ea]+['׳]?)/);
  if (m) return `${m[1]} ${m[2]}.`;
  return label.slice(0, max - 1) + "…";
}

// ─── Types ────────────────────────────────────────────────────────────────

interface DayData {
  unit: string; // the unit scheduled for this day
  done: boolean; // is the unit completed?
}

interface Props {
  plan: GeneralStudyPlan;
  reviews?: PlanReview[];
  onToggle?: (unit: string, currentlyDone: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlanCalendar({ plan, reviews, onToggle }: Props) {
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ hYear: number; hMonth: number }>(
    () => {
      const hd = new HDate(new Date());
      return { hYear: hd.getFullYear(), hMonth: hd.getMonth() };
    },
  );

  const { hYear, hMonth } = cursor;
  const gregStart = new HDate(1, hMonth, hYear).greg();
  const gregEnd = new HDate(
    HDate.daysInMonth(hMonth, hYear),
    hMonth,
    hYear,
  ).greg();

  // Build map: iso → { unit, done }
  const dayMap = useMemo<Map<string, DayData>>(() => {
    const map = new Map<string, DayData>();
    if (!plan.units?.length) return map;

    const doneSet = new Set(plan.completedUnits);
    const visibleStart = new HDate(1, hMonth, hYear).greg();
    const visibleEnd = new HDate(
      HDate.daysInMonth(hMonth, hYear),
      hMonth,
      hYear,
    ).greg();

    const scheduleMap = buildPlanScheduleMap(plan, visibleStart, visibleEnd);
    scheduleMap.forEach((dayUnits, iso) => {
      const firstUnit = dayUnits[0];
      const dayDone = dayUnits.every((u) => doneSet.has(u));
      if (firstUnit) map.set(iso, { unit: firstUnit, done: dayDone });
    });

    return map;
  }, [plan, hYear, hMonth]);

  // Hebrew calendar info
  const hebrewInfo = useMemo(() => {
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
      } else if (!holidayByIso.has(k)) {
        holidayByIso.set(k, ev.render("he"));
      }
    });

    const hStart = new HDate(start);
    const hEnd = new HDate(end);
    const hStartName = Locale.gettext(hStart.getMonthName(), "he");
    const hEndName = Locale.gettext(hEnd.getMonthName(), "he");
    const hYearStart = hStart.getFullYear();
    const toHebYear = (y: number) => `ה'${gematriya(y % 1000)}`;
    const hebYearStr = toHebYear(hYearStart);
    const hebMonthLabel =
      hStartName === hEndName ? hStartName : `${hStartName} – ${hEndName}`;

    return { parshaByIso, holidayByIso, hebMonthLabel, hebYearStr };
  }, [hYear, hMonth]);

  // Build review map: iso → { pending, done }
  const reviewMap = useMemo(() => {
    const m = new Map<string, { pending: number; done: number }>();
    for (const r of reviews ?? []) {
      const cur = m.get(r.dueDate) ?? { pending: 0, done: 0 };
      if (r.doneAt) cur.done++;
      else cur.pending++;
      m.set(r.dueDate, cur);
    }
    return m;
  }, [reviews]);

  const firstDay = gregStart.getDay();
  const daysInHebMonth = HDate.daysInMonth(hMonth, hYear);
  const today = new Date();
  const todayKey = dayKey(today);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInHebMonth; d++)
    cells.push(new HDate(d, hMonth, hYear).greg());

  // Stats for the visible month
  const monthStats = useMemo(() => {
    let scheduled = 0;
    let done = 0;
    dayMap.forEach((v) => {
      scheduled++;
      if (v.done) done++;
    });
    return { scheduled, done };
  }, [dayMap]);

  return (
    <Card className="gold-frame p-4 space-y-3" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
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
          <h3 className="font-display text-lg font-bold">
            {hebrewInfo.hebMonthLabel}{" "}
            <span className="text-gold">{hebrewInfo.hebYearStr}</span>
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {gregStart.getMonth() === gregEnd.getMonth()
              ? `${GREG_MONTHS[gregStart.getMonth()]} ${gregStart.getFullYear()}`
              : `${GREG_MONTHS[gregStart.getMonth()]}–${GREG_MONTHS[gregEnd.getMonth()]} ${gregEnd.getFullYear()}`}
            {monthStats.scheduled > 0 && (
              <>
                {" "}
                · {monthStats.done}/{monthStats.scheduled} ימים הושלמו
              </>
            )}
          </p>
        </div>

        <span className="gold-icon-circle shrink-0">
          <CalendarDays className="h-4 w-4" />
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground justify-center flex-wrap">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400/30 border border-sky-400/50" />
          מתוכנן
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/30 border border-emerald-500" />
          הושלם
        </span>
        {(reviews?.length ?? 0) > 0 && (
          <>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
              חזרה ממתינה
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400/70" />
              חזרה בוצעה
            </span>
          </>
        )}
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {HEB_DAYS.map((d) => (
          <div
            key={d}
            className="text-xs font-semibold text-muted-foreground py-0.5"
          >
            {d}
          </div>
        ))}

        {cells.map((date, i) => {
          if (!date) return <div key={i} />;

          const iso = isoKey(date);
          const k = dayKey(date);
          const isToday = k === todayKey;
          const dayData = dayMap.get(iso);
          const hebDate = new HDate(date);
          const hebDay = hebDayLetters(hebDate.getDate());
          const holiday = hebrewInfo.holidayByIso.get(iso);
          const parsha = hebrewInfo.parshaByIso.get(iso);

          const hasTask = !!dayData;
          const isDone = dayData?.done ?? false;
          const reviewInfo = reviewMap.get(iso);

          const cell = (
            <div
              className={cn(
                "relative aspect-square rounded-md border text-xs flex flex-col items-center justify-center overflow-hidden p-0.5 select-none transition-all hover:ring-2 hover:ring-gold/60",
                isToday && "!border-gold border-2 font-bold ring-2 ring-gold ring-offset-2 ring-offset-background",
                !isToday && "border-gold/20",
                !hasTask && "text-muted-foreground/60 bg-card",
                hasTask &&
                  !isDone &&
                  "bg-sky-400/15 border-sky-400/50 text-foreground",
                hasTask &&
                  isDone &&
                  "bg-[rgba(52,178,104,0.30)] border-[rgba(52,178,104,0.40)] text-foreground",
              )}
            >
              <div
                className={cn(
                  "relative z-10 h-full w-full",
                  isDone
                    ? "grid grid-rows-[1fr_auto_1fr] items-center py-0.5"
                    : "flex flex-col items-center justify-center",
                )}
              >
                <div
                  className={cn(
                    "flex w-full flex-col items-center",
                    isDone ? "self-end" : "",
                  )}
                >
                  <span
                    className={cn(
                      "font-display leading-none",
                      isDone
                        ? "text-sm font-extrabold text-[rgb(52,178,104)]"
                        : "text-sm font-bold",
                      !hasTask && "text-muted-foreground/50",
                    )}
                  >
                    {hebDay}
                  </span>
                  <span className="text-[8px] leading-none text-muted-foreground mt-0.5">
                    {date.getDate()}
                  </span>

                  {/* Holiday / parsha label */}
                  {(holiday || parsha) && (
                    <span className="text-[6px] leading-tight text-gold font-semibold truncate max-w-full px-0.5 mt-0.5">
                      {holiday ?? parsha}
                    </span>
                  )}
                </div>

                {/* Done checkmark - centered for all completed cells */}
                {isDone && (
                  <span className="mx-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(255,255,255)] border-[1.5px] border-[rgb(198,154,42)] shadow-sm">
                    <Check
                      className="h-3.5 w-3.5 text-[rgb(29,73,135)]"
                      strokeWidth={2.6}
                    />
                  </span>
                )}

                <div
                  className={cn(
                    "flex w-full flex-col items-center",
                    isDone ? "self-start" : "",
                  )}
                >
                  {/* Unit name */}
                  {dayData && !isDone && (
                    <span className="text-[6.5px] leading-tight text-navy/70 dark:text-sky-300/80 font-semibold truncate max-w-full px-0.5 mt-0.5">
                      {shortenUnit(dayData.unit)}
                    </span>
                  )}
                </div>
              </div>
              {/* Review dots */}
              {reviewInfo && (
                <span className="absolute bottom-0.5 left-0.5 flex gap-0.5">
                  {reviewInfo.pending > 0 && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-violet-500"
                      title={`${reviewInfo.pending} חזרות ממתינות`}
                    />
                  )}
                  {reviewInfo.done > 0 && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-emerald-400/80"
                      title={`${reviewInfo.done} חזרות בוצעו`}
                    />
                  )}
                </span>
              )}
            </div>
          );

          // Cells without tasks: plain div; cells with tasks: HoverCard + click to open DayDetailDialog
          if (!dayData && !reviewInfo) return <div key={i}>{cell}</div>;

          return (
            <HoverCard key={i} openDelay={300} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  onClick={() => setSelectedIso(iso)}
                  className="w-full"
                >
                  {cell}
                </button>
              </HoverCardTrigger>
              <HoverCardContent
                side="top"
                align="center"
                sideOffset={6}
                collisionPadding={12}
                className="w-56 p-3 border border-gold/40 shadow-md"
                dir="rtl"
              >
                <p className="text-[11px] text-muted-foreground mb-1">
                  {date.getDate()}/{date.getMonth() + 1}/{date.getFullYear()} ·{" "}
                  {hebDay} {Locale.gettext(hebDate.getMonthName(), "he")}
                </p>
                {dayData && (
                  <p className="text-sm font-semibold">{dayData.unit}</p>
                )}
                {dayData &&
                  (isDone ? (
                    <p className="text-[11px] text-emerald-500 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> הושלם
                    </p>
                  ) : (
                    <p className="text-[11px] text-sky-500 mt-1">
                      ממתין להשלמה
                    </p>
                  ))}
                {reviewInfo && reviewInfo.pending > 0 && (
                  <p className="text-[11px] text-violet-500 mt-1">
                    {reviewInfo.pending} חזרות ממתינות
                  </p>
                )}
                {reviewInfo && reviewInfo.done > 0 && (
                  <p className="text-[11px] text-emerald-500 mt-1">
                    {reviewInfo.done} חזרות בוצעו
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-2">
                  לחץ לפרטים ופעולות
                </p>
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>
      <DayDetailDialog
        open={!!selectedIso}
        onOpenChange={(o) => {
          if (!o) setSelectedIso(null);
        }}
        dateKeyStr={selectedIso}
      />
    </Card>
  );
}
