import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Flame, TrendingUp } from "lucide-react";
import { db } from "../db";

const DAY = 86400000;
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const DAY_NAMES = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

/**
 * סיכום 7 ימים + מפת חום 35 ימים — כמו ב"כללי" של המערכת המקורית,
 * מחושבים מיומן החזרות המקומי.
 */
export default function ActivityInsights() {
  const logs = useLiveQuery(() => db.reviewLogs.toArray(), []);

  // הצלחה לפי מסכת ב-7 הימים האחרונים — החלשות קודם
  const byMasechta = useLiveQuery(async () => {
    const since = dayStart(Date.now()) - 6 * DAY;
    const recent = await db.reviewLogs.where("at").aboveOrEqual(since).toArray();
    if (!recent.length) return [];
    const ids = [...new Set(recent.map((l) => l.cardId))];
    const cards = await db.cards.bulkGet(ids);
    const mOf = new Map(ids.map((id, i) => [id, cards[i]?.masechta ?? null]));
    const agg = new Map<string, { total: number; correct: number }>();
    for (const l of recent) {
      const m = mOf.get(l.cardId);
      if (!m) continue;
      const e = agg.get(m) ?? { total: 0, correct: 0 };
      e.total++; if (l.correct) e.correct++;
      agg.set(m, e);
    }
    return [...agg.entries()]
      .map(([m, e]) => ({ m, ...e, pct: Math.round((e.correct / e.total) * 100) }))
      .sort((a, b) => a.pct - b.pct || b.total - a.total)
      .slice(0, 5);
  }, []);

  const { week, heat } = useMemo(() => {
    const today = dayStart(Date.now());
    const perDay = new Map<number, { total: number; correct: number }>();
    for (const l of logs ?? []) {
      const d = dayStart(l.at);
      let e = perDay.get(d);
      if (!e) perDay.set(d, (e = { total: 0, correct: 0 }));
      e.total++;
      if (l.correct) e.correct++;
    }

    // שבעה ימים אחרונים
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = today - (6 - i) * DAY;
      const e = perDay.get(d) ?? { total: 0, correct: 0 };
      return { date: d, ...e };
    });
    const total = days.reduce((s, d) => s + d.total, 0);
    const correct = days.reduce((s, d) => s + d.correct, 0);

    // מפת חום — 5 שבועות אחורה, מיושרת לשבוע שמתחיל בראשון
    const heatDays: { date: number; total: number; errors: number }[] = [];
    const end = today;
    const start = end - 34 * DAY;
    for (let d = start; d <= end; d += DAY) {
      const e = perDay.get(d) ?? { total: 0, correct: 0 };
      heatDays.push({ date: d, total: e.total, errors: e.total - e.correct });
    }
    const hTotal = heatDays.reduce((s, d) => s + d.total, 0);
    const hErrors = heatDays.reduce((s, d) => s + d.errors, 0);
    const max = Math.max(1, ...heatDays.map((d) => d.total));

    return {
      week: { days, total, correct, pct: total ? Math.round((correct / total) * 100) : 0 },
      heat: { days: heatDays, total: hTotal, errors: hErrors, failPct: hTotal ? Math.round((hErrors / hTotal) * 100) : 0, max },
    };
  }, [logs]);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* סיכום 7 ימים */}
      <div className="gold-frame bg-card p-4 space-y-3">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gold" /> סיכום 7 ימים
        </h3>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-secondary py-2.5">
            <p className="text-xs text-muted-foreground">הצלחה</p>
            <p className="font-bold text-gold text-xl">{week.pct}%</p>
          </div>
          <div className="rounded-lg bg-secondary py-2.5">
            <p className="text-xs text-muted-foreground">חזרות</p>
            <p className="font-bold text-xl">{week.total.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1.5 h-20">
          {week.days.map((d) => {
            const h = week.total ? Math.max(4, Math.round((d.total / Math.max(1, ...week.days.map((x) => x.total))) * 56)) : 4;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.total} חזרות${d.total ? ` · ${Math.round((d.correct / d.total) * 100)}% הצלחה` : ""}`}>
                {d.total > 0 && <span className="text-[9px] text-gold font-bold">{d.total}</span>}
                <div className={`w-full rounded-t ${d.total ? "bg-gradient-gold" : "bg-muted"}`} style={{ height: `${h}px` }} />
                <span className="text-[9px] text-muted-foreground">{DAY_NAMES[new Date(d.date).getDay()]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* הצלחה לפי מסכת (7 ימים) */}
      {(byMasechta ?? []).length > 0 && (
        <div className="gold-frame bg-card p-4 space-y-2 md:col-span-2 order-last" data-testid="by-masechta">
          <h3 className="font-bold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-gold" /> הצלחה לפי מסכת · 7 ימים
            <span className="text-xs text-muted-foreground font-normal">(החלשות קודם)</span>
          </h3>
          <ul className="space-y-1.5">
            {byMasechta!.map((r) => (
              <li key={r.m} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 font-medium truncate">{r.m}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${r.pct >= 80 ? "bg-green-500" : r.pct >= 60 ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${r.pct}%` }} />
                </div>
                <span className="w-24 shrink-0 text-xs text-muted-foreground text-left">{r.pct}% ({r.correct}/{r.total})</span>
                <Link className="text-xs text-gold hover:underline shrink-0" to={`/study?m=${encodeURIComponent(r.m)}&from=1&to=999&due=1`}>חזרה</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* מפת חום */}
      <div className="gold-frame bg-card p-4 space-y-3">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Flame className="h-5 w-5 text-gold" /> מפת חום
        </h3>
        <p className="text-sm text-muted-foreground">
          {heat.total.toLocaleString()} פעילויות · {heat.errors.toLocaleString()} שגיאות · {heat.failPct}% כישלון · 35 ימים אחרונים
        </p>
        <div className="grid grid-cols-7 gap-1" dir="rtl">
          {heat.days.map((d) => {
            const level = d.total === 0 ? 0 : Math.ceil((d.total / heat.max) * 4);
            return (
              <div
                key={d.date}
                title={`${new Date(d.date).toLocaleDateString("he-IL")} · ${d.total} חזרות${d.errors ? ` · ${d.errors} שגיאות` : ""}`}
                className={`h-7 rounded ${
                  level === 0 ? "bg-muted" :
                  level === 1 ? "bg-gold/25" :
                  level === 2 ? "bg-gold/45" :
                  level === 3 ? "bg-gold/70" : "bg-gradient-gold"
                }`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground justify-end">
          פחות
          <span className="h-3 w-3 rounded bg-muted" />
          <span className="h-3 w-3 rounded bg-gold/25" />
          <span className="h-3 w-3 rounded bg-gold/45" />
          <span className="h-3 w-3 rounded bg-gold/70" />
          <span className="h-3 w-3 rounded bg-gradient-gold" />
          יותר
        </div>
      </div>
    </div>
  );
}
