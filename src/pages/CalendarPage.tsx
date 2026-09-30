import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { HDate, gematriya } from "@hebcal/core";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "../db";
import PageBanner from "../components/PageBanner";

const HEB_MONTHS: Record<string, string> = {
  Nisan: "נִיסָן", Iyyar: "אִיָּיר", Sivan: "סִיוָן", Tamuz: "תַּמּוּז", Av: "אָב", Elul: "אֱלוּל",
  Tishrei: "תִּשְׁרֵי", Cheshvan: "חֶשְׁוָן", Kislev: "כִּסְלֵו", Tevet: "טֵבֵת", "Sh'vat": "שְׁבָט",
  "Adar I": "אֲדָר א׳", "Adar II": "אֲדָר ב׳", Adar: "אֲדָר",
};

const WEEKDAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

const GREG_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarPage() {
  const today = useMemo(() => new HDate(new Date()), []);
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  const first = useMemo(() => new HDate(1, month, year), [month, year]);
  const daysInMonth = first.daysInMonth();

  const days = useMemo(() => {
    const out: HDate[] = [];
    for (let d = 1; d <= daysInMonth; d++) out.push(new HDate(d, month, year));
    return out;
  }, [month, year, daysInMonth]);

  const gregRange = useMemo(() => {
    const a = days[0].greg();
    const b = days[days.length - 1].greg();
    const am = GREG_MONTHS[a.getMonth()];
    const bm = GREG_MONTHS[b.getMonth()];
    const years = a.getFullYear() === b.getFullYear() ? `${a.getFullYear()}` : `${a.getFullYear()}–${b.getFullYear()}`;
    return am === bm ? `${am} ${years}` : `${am}–${bm} ${years}`;
  }, [days]);

  // Due cards and completed reviews per gregorian day of the shown month.
  const stats = useLiveQuery(async () => {
    const start = days[0].greg();
    start.setHours(0, 0, 0, 0);
    const end = days[days.length - 1].greg();
    end.setHours(23, 59, 59, 999);

    const due = new Map<string, number>();
    await db.cards.where("srs.dueAt").between(start.getTime(), end.getTime()).each((c) => {
      const k = dayKey(new Date(c.srs.dueAt));
      due.set(k, (due.get(k) ?? 0) + 1);
    });
    // Overdue cards land on today.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (todayStart.getTime() >= start.getTime() && todayStart.getTime() <= end.getTime()) {
      const overdue = await db.cards.where("srs.dueAt").below(todayStart.getTime()).count();
      if (overdue) {
        const k = dayKey(todayStart);
        due.set(k, (due.get(k) ?? 0) + overdue);
      }
    }

    const done = new Map<string, number>();
    await db.reviewLogs.where("at").between(start.getTime(), end.getTime()).each((l) => {
      const k = dayKey(new Date(l.at));
      done.set(k, (done.get(k) ?? 0) + 1);
    });
    return { due, done };
  }, [days]);

  const move = (dir: 1 | -1) => {
    const anchor = dir === 1 ? new HDate(first.abs() + daysInMonth) : new HDate(first.abs() - 1);
    setMonth(anchor.getMonth());
    setYear(anchor.getFullYear());
  };

  const monthName = HEB_MONTHS[first.getMonthName()] ?? first.getMonthName();
  const leadingBlanks = days[0].greg().getDay(); // Sunday=0 → column א'

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fade-in">
      <PageBanner icon={CalendarDays} title="לוח חזרות" subtitle="מתי חוזרים על מה — לפי הלוח העברי." />

      <div className="card-panel">
        <div className="flex items-center justify-between mb-4">
          <button className="btn-ghost h-9 w-9 p-0" onClick={() => move(-1)} title="חודש קודם">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="text-center">
            <h3 className="font-display text-2xl font-bold">
              {monthName} <span className="text-gold">{gematriya(year)}</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{gregRange} · לוח חזרות</p>
          </div>
          <button className="btn-ghost h-9 w-9 p-0" onClick={() => move(1)} title="חודש הבא">
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground mb-1.5">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {days.map((hd) => {
            const g = hd.greg();
            const k = dayKey(g);
            const dueCount = stats?.due.get(k) ?? 0;
            const doneCount = stats?.done.get(k) ?? 0;
            const isToday = hd.abs() === today.abs();
            return (
              <div
                key={hd.getDate()}
                className={`rounded-lg border p-1.5 min-h-[72px] flex flex-col items-center text-center bg-card ${
                  isToday ? "border-2 border-gold shadow-gold" : dueCount ? "border-gold/40 bg-secondary/60" : "border-border/40"
                }`}
              >
                <span className="font-bold text-lg leading-none mt-0.5">{gematriya(hd.getDate())}</span>
                <span className="text-[10px] text-muted-foreground">{g.getDate()}</span>
                {dueCount > 0 && (
                  <span className="text-[10px] font-medium text-gold mt-auto">{dueCount.toLocaleString()} לחזרה</span>
                )}
                {doneCount > 0 && (
                  <span className="text-[10px] font-medium text-accent">{doneCount.toLocaleString()} בוצעו</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
