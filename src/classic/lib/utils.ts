import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calculates the calendar date after `daysNeeded` active study days,
 * skipping the specified weekdays (0=Sun…6=Sat) and recurring MM-DD dates.
 */
export function calcEtaDate(
  daysNeeded: number,
  skipWeekdays: number[] = [],
  skipDates: string[] = [],
): Date {
  if (daysNeeded <= 0) return new Date();
  const d = new Date();
  let remaining = daysNeeded;
  let safety = 0;
  while (remaining > 0 && safety < 3650) {
    d.setDate(d.getDate() + 1);
    safety++;
    if (skipWeekdays.includes(d.getDay())) continue;
    const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (skipDates.includes(mmdd)) continue;
    remaining--;
  }
  return d;
}
