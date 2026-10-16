import type { GeneralStudyPlan } from "./types";

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toMonthDay(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Build a day->units schedule map for a plan in the given visible range.
 * Honors anchorDate/anchorPosition, skips and fractional unitsPerDay.
 */
export function buildPlanScheduleMap(
  plan: GeneralStudyPlan,
  visibleStart: Date,
  visibleEnd: Date,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!plan.units?.length) return map;

  const skipWeekdays = new Set(plan.skipWeekdays ?? []);
  const skipDates = new Set(plan.skipDates ?? []);
  const planStart = plan.anchorDate
    ? new Date(plan.anchorDate + "T00:00:00")
    : new Date(plan.startDate);

  planStart.setHours(0, 0, 0, 0);
  const rangeStart = new Date(visibleStart);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(visibleEnd);
  rangeEnd.setHours(0, 0, 0, 0);

  const unitsPerDay = Math.max(plan.unitsPerDay ?? 1, 0.001);
  let unitIdx = plan.anchorPosition?.unitIndex ?? 0;
  let fractionalAccumulator = 0;

  for (let d = new Date(planStart); d <= rangeEnd && unitIdx < plan.units.length; d.setDate(d.getDate() + 1)) {
    const iso = toIsoDate(new Date(d));
    const mmdd = toMonthDay(d);

    if (skipWeekdays.has(d.getDay()) || skipDates.has(iso) || skipDates.has(mmdd)) continue;

    fractionalAccumulator += unitsPerDay;
    const unitsThisDay = Math.floor(fractionalAccumulator);
    fractionalAccumulator -= unitsThisDay;
    if (unitsThisDay === 0) continue;

    const dayUnits: string[] = [];
    for (let i = 0; i < unitsThisDay && unitIdx < plan.units.length; i += 1, unitIdx += 1) {
      dayUnits.push(plan.units[unitIdx]);
    }

    if (dayUnits.length > 0 && d >= rangeStart) {
      map.set(iso, dayUnits);
    }
  }

  return map;
}

export function getPlanUnitsForDate(plan: GeneralStudyPlan, targetDate: Date): string[] {
  const d = new Date(targetDate);
  d.setHours(0, 0, 0, 0);
  const iso = toIsoDate(d);
  return buildPlanScheduleMap(plan, d, d).get(iso) ?? [];
}
