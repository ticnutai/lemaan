import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, Check, Plus, Trash2, X } from "lucide-react";
import { db } from "../db";
import { uid } from "../lib/utils";
import type { StudyPlan } from "../features/study/types";

/** תבניות מוכנות — המספרים ניתנים לעריכה לפני היצירה. */
const PRESETS: { name: string; unitLabel: string; totalUnits: number; unitsPerDay: number }[] = [
  { name: "דף יומי — ש\"ס", unitLabel: "דף", totalUnits: 2711, unitsPerDay: 1 },
  { name: "חומש — פרק ליום", unitLabel: "פרק", totalUnits: 187, unitsPerDay: 1 },
  { name: "תנ\"ך (929)", unitLabel: "פרק", totalUnits: 929, unitsPerDay: 1 },
  { name: "תהילים חודשי", unitLabel: "פרק", totalUnits: 150, unitsPerDay: 5 },
  { name: "משנה יומית", unitLabel: "פרק", totalUnits: 525, unitsPerDay: 2 },
  { name: "רמב\"ם — ג' פרקים", unitLabel: "פרק", totalUnits: 1017, unitsPerDay: 3 },
];

const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** חישובי מצב תוכנית: מה היום, בקצב/בפיגור, תאריך סיום צפוי. */
function planStatus(p: StudyPlan) {
  const today = dayStart(Date.now());
  const dayIndex = Math.max(0, Math.floor((today - dayStart(p.startDate)) / 86400000));
  const plannedByToday = Math.min(p.totalUnits, (dayIndex + 1) * p.unitsPerDay);
  const behind = Math.max(0, plannedByToday - p.completedUnits);
  const todayFrom = p.completedUnits + 1;
  const todayTo = Math.min(p.totalUnits, p.completedUnits + p.unitsPerDay);
  const remainingDays = Math.ceil((p.totalUnits - p.completedUnits) / p.unitsPerDay);
  const finish = new Date(today + remainingDays * 86400000);
  const pct = Math.round((p.completedUnits / p.totalUnits) * 100);
  const done = p.completedUnits >= p.totalUnits;
  return { behind, todayFrom, todayTo, finish, pct, done };
}

export default function StudyPlansSection() {
  const plans = useLiveQuery(() => db.studyPlans.toArray(), []);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", unitLabel: "פרק", totalUnits: 100, unitsPerDay: 1 });

  const create = async () => {
    if (!form.name.trim() || form.totalUnits < 1 || form.unitsPerDay < 1) return;
    const now = Date.now();
    const plan: StudyPlan = {
      id: uid(),
      name: form.name.trim(),
      unitLabel: form.unitLabel.trim() || "יחידה",
      totalUnits: form.totalUnits,
      unitsPerDay: form.unitsPerDay,
      startDate: dayStart(now),
      completedUnits: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.studyPlans.add(plan);
    setAdding(false);
    setForm({ name: "", unitLabel: "פרק", totalUnits: 100, unitsPerDay: 1 });
  };

  const markToday = async (p: StudyPlan) => {
    await db.studyPlans.update(p.id, {
      completedUnits: Math.min(p.totalUnits, p.completedUnits + p.unitsPerDay),
      updatedAt: Date.now(),
    });
  };

  const undo = async (p: StudyPlan) => {
    await db.studyPlans.update(p.id, {
      completedUnits: Math.max(0, p.completedUnits - p.unitsPerDay),
      updatedAt: Date.now(),
    });
  };

  const remove = async (p: StudyPlan) => {
    if (!confirm(`למחוק את התוכנית "${p.name}"?`)) return;
    await db.studyPlans.delete(p.id);
  };

  return (
    <div className="gold-frame bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-gold" /> תוכניות לימוד
        </h3>
        <button className="btn-gold h-9" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> הוסף תוכנית
        </button>
      </div>

      {adding && (
        <div className="card-panel space-y-2.5 animate-slide-in-down">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((pr) => (
              <button
                key={pr.name}
                className="btn-outline h-8 text-xs rounded-full"
                onClick={() => setForm({ ...pr })}
              >
                {pr.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input className="input col-span-2 md:col-span-1" placeholder="שם התוכנית"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="יחידה (פרק/דף)"
              value={form.unitLabel} onChange={(e) => setForm({ ...form, unitLabel: e.target.value })} />
            <input className="input" type="number" min={1} title="סך יחידות"
              value={form.totalUnits} onChange={(e) => setForm({ ...form, totalUnits: Number(e.target.value) || 1 })} />
            <input className="input" type="number" min={1} title="יחידות ליום"
              value={form.unitsPerDay} onChange={(e) => setForm({ ...form, unitsPerDay: Number(e.target.value) || 1 })} />
          </div>
          <p className="text-xs text-muted-foreground">
            {form.totalUnits} {form.unitLabel} · {form.unitsPerDay} ליום → סיום בעוד {Math.ceil(form.totalUnits / form.unitsPerDay).toLocaleString()} ימים
          </p>
          <div className="flex gap-2">
            <button className="btn-primary h-9" disabled={!form.name.trim()} onClick={create}>צור תוכנית</button>
            <button className="btn-outline h-9" onClick={() => setAdding(false)}>ביטול</button>
          </div>
        </div>
      )}

      {(plans ?? []).length === 0 && !adding ? (
        <p className="text-center text-muted-foreground border border-dashed rounded-lg py-6">
          אין תוכניות לימוד פעילות — הוסף תוכנית לדף יומי, חומש, רמב"ם ועוד.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-2.5">
          {(plans ?? []).map((p) => {
            const st = planStatus(p);
            return (
              <div key={p.id} className="card-panel space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.completedUnits.toLocaleString()}/{p.totalUnits.toLocaleString()} {p.unitLabel}ים · {p.unitsPerDay} ליום
                    </p>
                  </div>
                  <span className={`text-xs font-bold rounded-full px-2 py-0.5 border ${st.done ? "bg-gradient-gold text-navy border-transparent" : "text-gold border-gold/50"}`}>
                    {st.pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-gradient-gold transition-all" style={{ width: `${st.pct}%` }} />
                </div>
                {st.done ? (
                  <p className="text-sm text-gold font-medium">🎉 התוכנית הושלמה!</p>
                ) : (
                  <>
                    <p className="text-sm">
                      היום: {p.unitLabel} {st.todayFrom.toLocaleString()}{st.todayTo > st.todayFrom ? `–${st.todayTo.toLocaleString()}` : ""}
                      {st.behind > p.unitsPerDay && (
                        <span className="text-destructive text-xs font-medium mr-2">בפיגור {st.behind.toLocaleString()} {p.unitLabel}ים</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      סיום צפוי: {st.finish.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </>
                )}
                <div className="flex items-center gap-1.5">
                  {!st.done && (
                    <button className="btn-primary h-8 text-xs" onClick={() => markToday(p)}>
                      <Check className="h-3.5 w-3.5" /> סמן את של היום
                    </button>
                  )}
                  {p.completedUnits > 0 && (
                    <button className="btn-ghost h-8 w-8 p-0" title="ביטול סימון אחרון" onClick={() => undo(p)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button className="btn-ghost h-8 w-8 p-0 text-destructive ms-auto" title="מחיקת התוכנית" onClick={() => remove(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
