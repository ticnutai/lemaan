import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Flame, Plus, Target, Trash2, Trophy } from "lucide-react";
import { db } from "../db";
import { uid } from "../lib/utils";
import PageBanner from "../components/PageBanner";
import type { Goal, GoalType } from "../features/study/types";

const GOAL_TYPES: { type: GoalType; label: string; unit: string; defaultTarget: number }[] = [
  { type: "daily_reviews", label: "חזרות ביום", unit: "חזרות", defaultTarget: 50 },
  { type: "daily_cards", label: "שאלות שונות ביום", unit: "שאלות", defaultTarget: 30 },
  { type: "success_rate", label: "אחוז הצלחה יומי", unit: "%", defaultTarget: 80 },
  { type: "streak", label: "רצף ימים", unit: "ימים", defaultTarget: 7 },
];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function GoalsPage() {
  const [type, setType] = useState<GoalType>("daily_reviews");
  const [target, setTarget] = useState(50);

  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const todayLogs = useLiveQuery(() => db.reviewLogs.where("at").aboveOrEqual(startOfDay(Date.now())).toArray(), []);
  const streak = useLiveQuery(async () => {
    const all = await db.reviewLogs.toArray();
    const days = new Set(all.map((l) => startOfDay(l.at)));
    let s = 0;
    let day = startOfDay(Date.now());
    if (!days.has(day)) day -= 86400000;
    while (days.has(day)) {
      s += 1;
      day -= 86400000;
    }
    return s;
  }, []);

  const progressOf = (goal: Goal): number => {
    if (!todayLogs) return 0;
    switch (goal.type) {
      case "daily_reviews":
        return todayLogs.length;
      case "daily_cards":
        return new Set(todayLogs.map((l) => l.cardId)).size;
      case "success_rate":
        return todayLogs.length ? Math.round((todayLogs.filter((l) => l.correct).length / todayLogs.length) * 100) : 0;
      case "streak":
        return streak ?? 0;
    }
  };

  const addGoal = async () => {
    const meta = GOAL_TYPES.find((g) => g.type === type)!;
    await db.goals.add({
      id: uid(),
      type,
      target,
      title: `${meta.label}: ${target} ${meta.unit}`,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <PageBanner icon={Target} title="יעדים והישגים" subtitle="קבע יעד יומי ורצף — ועקוב אחר העמידה בו." />

      <div className="card-panel flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-gradient-gold shadow-gold flex items-center justify-center shrink-0">
          <Flame className="h-6 w-6 text-navy" />
        </div>
        <div>
          <div className="text-2xl font-bold">{streak ?? "…"} ימים</div>
          <div className="text-sm text-muted-foreground">רצף הלמידה הנוכחי שלך</div>
        </div>
      </div>

      <div className="card-panel py-3 flex flex-wrap gap-2 items-center">
        <select
          className="input w-52"
          value={type}
          onChange={(e) => {
            const t = e.target.value as GoalType;
            setType(t);
            setTarget(GOAL_TYPES.find((g) => g.type === t)!.defaultTarget);
          }}
        >
          {GOAL_TYPES.map((g) => (
            <option key={g.type} value={g.type}>{g.label}</option>
          ))}
        </select>
        <input type="number" min={1} className="input w-28" value={target} onChange={(e) => setTarget(Number(e.target.value) || 1)} />
        <button className="btn-gold" onClick={addGoal}>
          <Plus className="h-4 w-4" /> הוסף יעד
        </button>
      </div>

      <div className="space-y-3">
        {goals?.map((goal) => {
          const progress = progressOf(goal);
          const pct = Math.min(100, Math.round((progress / goal.target) * 100));
          const met = progress >= goal.target;
          return (
            <div key={goal.id} className={`card-panel ${met ? "gold-frame" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium flex items-center gap-2">
                  {met && <Trophy className="h-4 w-4 text-gold" />}
                  {goal.title}
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{progress.toLocaleString()} / {goal.target.toLocaleString()}</span>
                  <button className="btn-ghost h-7 w-7 p-0 text-destructive" title="מחיקה"
                    onClick={async () => { if (confirm("למחוק את היעד?")) await db.goals.delete(goal.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full transition-all ${met ? "bg-gradient-gold" : "bg-gradient-navy"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {goals?.length === 0 && (
          <div className="card-panel border-dashed text-center py-8 text-muted-foreground">
            אין יעדים עדיין — הוסף יעד ראשון למעלה.
          </div>
        )}
      </div>
    </div>
  );
}
