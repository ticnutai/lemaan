import { HDate } from "@hebcal/core";

const HEB_WEEKDAYS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];

/**
 * Formats a date as a Hebrew calendar date string with gematriya
 * (e.g. "כ״ב אייר תשפ״ו"). Pass withWeekday=true to prepend the
 * Hebrew day name (e.g. "יום שלישי, כ״ב אייר תשפ״ו").
 */
export function toHebrewDate(date: Date | number | string, withWeekday = false): string {
  const d =
    typeof date === "number" ? new Date(date)
    : typeof date === "string" ? new Date(date.length === 10 ? date + "T00:00:00" : date)
    : date;
  let core = "";
  try {
    const hd = new HDate(d);
    core = hd.renderGematriya(true);
  } catch {
    core = new Intl.DateTimeFormat("he-u-ca-hebrew", {
      day: "numeric", month: "long", year: "numeric",
    }).format(d);
  }
  return withWeekday ? `${HEB_WEEKDAYS[d.getDay()]}, ${core}` : core;
}

/**
 * Returns a Hebrew year in gematria format, e.g. 5786 → "תשפ״ו".
 */
export function hebrewYearGematriya(year: number): string {
  try {
    const hd = new HDate(1, 7, year);
    const full = hd.renderGematriya(true);
    const parts = full.trim().split(/\s+/);
    return parts[parts.length - 1];
  } catch {
    return String(year);
  }
}

/** Hebrew months ordered from Tishrei (civil new year) */
export const HEB_MONTHS = [
  { num: 7, name: "תשרי" },
  { num: 8, name: "חשון" },
  { num: 9, name: "כסלו" },
  { num: 10, name: "טבת" },
  { num: 11, name: "שבט" },
  { num: 12, name: "אדר א׳" },
  { num: 13, name: "אדר ב׳" },
  { num: 1,  name: "ניסן" },
  { num: 2,  name: "אייר" },
  { num: 3,  name: "סיון" },
  { num: 4,  name: "תמוז" },
  { num: 5,  name: "אב" },
  { num: 6,  name: "אלול" },
] as const;

/**
 * Converts a Hebrew date (day, month, Hebrew year) to a Gregorian YYYY-MM-DD string.
 */
export function fromHebrewDate(day: number, month: number, year: number): string | null {
  try {
    const hd = new HDate(day, month, year);
    const d = hd.greg();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return null;
  }
}

/** Returns synchronized Gregorian and Hebrew values for a date picker. */
export function datePickerValues(date = new Date()): {
  gregorian: string;
  hebrewDay: string;
  hebrewMonth: string;
  hebrewYear: number;
} {
  const gregorian = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const hd = new HDate(date);
  return {
    gregorian,
    hebrewDay: String(hd.getDate()),
    hebrewMonth: String(hd.getMonth()),
    hebrewYear: hd.getFullYear(),
  };
}
