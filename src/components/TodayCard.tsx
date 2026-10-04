import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, GraduationCap, ScrollText } from "lucide-react";
import { db } from "../db";
import { hebDate, hebWeekday, holidaysOn, parashaOf } from "../lib/hebDate";
import { dafLink, loadShasIndex, planUnits, practiceLink, type ShasMeta } from "../features/study/planUnits";

/** "היום": תאריך עברי ולועזי, פרשת השבוע, חג — ומה ללמוד היום לפי תוכניות הלימוד. */
export default function TodayCard() {
  const now = new Date();
  const plans = useLiveQuery(() => db.studyPlans.toArray(), []);
  const [index, setIndex] = useState<ShasMeta[]>([]);
  useEffect(() => { void loadShasIndex().then(setIndex); }, []);

  const parasha = parashaOf(now);
  const holidays = holidaysOn(now);
  const todo = (plans ?? []).filter((p) => p.completedUnits < p.totalUnits);

  return (
    <div className="card-panel flex flex-col md:flex-row md:items-start gap-4" data-testid="today-card">
      <div className="flex items-center gap-3 md:w-64 shrink-0">
        <div className="h-11 w-11 rounded-full bg-gradient-gold shadow-gold flex items-center justify-center">
          <CalendarDays className="h-5 w-5 text-navy" />
        </div>
        <div>
          <div className="font-bold text-lg leading-tight">{hebWeekday(now)}, {hebDate(now)}</div>
          <div className="text-xs text-muted-foreground">
            {now.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
            {parasha ? ` · ${parasha}` : ""}
          </div>
          {holidays.length > 0 && <div className="text-sm text-gold font-medium">{holidays.join(" · ")}</div>}
        </div>
      </div>

      <div className="flex-1 min-w-0 md:border-s md:ps-4">
        <div className="text-sm font-semibold mb-1.5">ללמוד היום</div>
        {todo.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין תוכניות פעילות — אפשר להוסיף תוכנית למטה.</p>
        ) : (
          <ul className="space-y-1.5">
            {todo.map((p) => {
              const units = planUnits(p, index);
              const from = units?.[p.completedUnits];
              const to = units?.[Math.min(p.totalUnits, p.completedUnits + p.unitsPerDay) - 1];
              const label = from
                ? from === to || !to ? from.label : `${from.label} – ${to.label.replace(`${p.shas!.masechta} `, "")}`
                : `${p.name}: ${p.unitLabel} ${p.completedUnits + 1}${p.unitsPerDay > 1 ? `–${Math.min(p.totalUnits, p.completedUnits + p.unitsPerDay)}` : ""}`;
              return (
                <li key={p.id} className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-medium">{label}</span>
                  {p.shas && from && (
                    <span className="flex gap-1 ms-auto">
                      <Link className="btn-ghost h-7 px-2 text-xs" to={dafLink(p, from)} title="פתיחה בדפוס המדויק">
                        <ScrollText className="h-3.5 w-3.5" /> לדף
                      </Link>
                      <Link className="btn-ghost h-7 px-2 text-xs" to={practiceLink(p.shas.masechta, from)} title="תרגול השאלות של העמוד">
                        <GraduationCap className="h-3.5 w-3.5" /> תרגול
                      </Link>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
