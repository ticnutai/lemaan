import { HDate, HebrewCalendar, Locale, Sedra } from "@hebcal/core";

/** תאריך עברי, פרשת השבוע וחגים — מקומי לגמרי (hebcal), בלי ניקוד. */

const noNikud = (s: string) => s.replace(/[֑-ׇ]/g, "");

/** "י״ג שבט תשפ״ז" */
export function hebDate(d: Date): string {
  return new HDate(d).renderGematriya(true);
}

/** "יום רביעי" */
export function hebWeekday(d: Date): string {
  return new Intl.DateTimeFormat("he", { weekday: "long" }).format(d);
}

/** פרשת השבוע של השבת הקרובה (בארץ ישראל): "פרשת בראשית"; ריק בשבת של חג. */
export function parashaOf(d: Date): string {
  const sat = new HDate(d).onOrAfter(6);
  const r = new Sedra(sat.getFullYear(), true).lookup(sat);
  if (r.chag || !r.parsha?.length) return "";
  return "פרשת " + noNikud(r.parsha.map((p) => Locale.gettext(p, "he")).join("-"));
}

/** חגים ומועדים של היום (בארץ ישראל). */
export function holidaysOn(d: Date): string[] {
  const ev = HebrewCalendar.getHolidaysOnDate(new HDate(d), true) ?? [];
  return ev.map((e) => noNikud(e.render("he")));
}
