import { useLiveQuery } from "dexie-react-hooks";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { db } from "../db";
import PageBanner from "../components/PageBanner";

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StatsPage() {
  const data = useLiveQuery(async () => {
    const since = Date.now() - 30 * 86400000;
    const logs = await db.reviewLogs.where("at").aboveOrEqual(since).toArray();
    const byDay = new Map<string, { reviews: number; correct: number }>();
    for (let i = 29; i >= 0; i--) {
      byDay.set(dayKey(Date.now() - i * 86400000), { reviews: 0, correct: 0 });
    }
    for (const log of logs) {
      const key = dayKey(log.at);
      const row = byDay.get(key);
      if (row) {
        row.reviews += 1;
        if (log.correct) row.correct += 1;
      }
    }
    const chart = [...byDay.entries()].map(([day, v]) => ({
      day: day.slice(5).replace("-", "/"),
      חזרות: v.reviews,
      נכונות: v.correct,
    }));
    const total = logs.length;
    const correct = logs.filter((l) => l.correct).length;
    return { chart, total, correct };
  }, []);

  const perMasechta = useLiveQuery(async () => {
    const cards = await db.cards.toArray();
    const map = new Map<string, { total: number; reviewed: number; correct: number; reviews: number }>();
    for (const c of cards) {
      const key = c.masechta ?? "ללא מסכת";
      const row = map.get(key) ?? { total: 0, reviewed: 0, correct: 0, reviews: 0 };
      row.total += 1;
      if (c.stats.totalReviews > 0) row.reviewed += 1;
      row.correct += c.stats.correct;
      row.reviews += c.stats.totalReviews;
      map.set(key, row);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v, accuracy: v.reviews ? Math.round((v.correct / v.reviews) * 100) : null }))
      .sort((a, b) => b.reviews - a.reviews)
      .slice(0, 15);
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <PageBanner icon={TrendingUp} title="התקדמות" subtitle="עקוב אחר ההתקדמות שלך וקבל תובנות מתקדמות." />

      <div className="grid grid-cols-2 gap-4">
        <div className="card-panel text-center">
          <p className="text-3xl font-bold">{data?.total ?? "…"}</p>
          <p className="text-sm text-muted-foreground">חזרות ב־30 הימים האחרונים</p>
        </div>
        <div className="card-panel text-center">
          <p className="text-3xl font-bold">{data && data.total ? Math.round((data.correct / data.total) * 100) : 0}%</p>
          <p className="text-sm text-muted-foreground">אחוז הצלחה</p>
        </div>
      </div>

      <div className="card-panel">
        <h3 className="font-semibold mb-4">חזרות לפי יום</h3>
        <div className="h-64" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.chart ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="חזרות" fill="hsl(220 65% 25%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="נכונות" fill="hsl(42 70% 50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-panel">
        <h3 className="font-semibold mb-3">התקדמות לפי מסכת</h3>
        <div className="space-y-2">
          {perMasechta?.map((m) => (
            <div key={m.name} className="flex items-center gap-3 text-sm">
              <span className="w-32 truncate font-medium">{m.name}</span>
              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-gradient-gold" style={{ width: `${m.total ? (m.reviewed / m.total) * 100 : 0}%` }} />
              </div>
              <span className="w-24 text-muted-foreground text-xs">{m.reviewed}/{m.total} נלמדו</span>
              <span className="w-14 text-xs text-left" dir="ltr">{m.accuracy !== null ? `${m.accuracy}%` : "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
