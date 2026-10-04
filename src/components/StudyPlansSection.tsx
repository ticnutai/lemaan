import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, Check, GraduationCap, Plus, RotateCcw, ScrollText, Trash2, Undo2 } from "lucide-react";
import { db } from "../db";
import { uid } from "../lib/utils";
import { hebDate } from "../lib/hebDate";
import type { Card, StudyPlan } from "../features/study/types";
import {
  dafLink, loadShasIndex, planUnits, practiceLink, retentionOf, unitsOf,
  type PlanUnit, type Retention, type ShasMeta,
} from "../features/study/planUnits";

/** תבניות מוכנות לתוכנית שאינה ש"ס — המספרים ניתנים לעריכה לפני היצירה. */
const PRESETS: { name: string; unitLabel: string; totalUnits: number; unitsPerDay: number }[] = [
  { name: "חומש — פרק ליום", unitLabel: "פרק", totalUnits: 187, unitsPerDay: 1 },
  { name: "תנ\"ך (929)", unitLabel: "פרק", totalUnits: 929, unitsPerDay: 1 },
  { name: "תהילים חודשי", unitLabel: "פרק", totalUnits: 150, unitsPerDay: 5 },
  { name: "משנה יומית", unitLabel: "פרק", totalUnits: 525, unitsPerDay: 2 },
  { name: "רמב\"ם — ג' פרקים", unitLabel: "פרק", totalUnits: 1017, unitsPerDay: 3 },
];

const DAY = 86400000;
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** מצב תוכנית: איפה אמורים להיות לפי הלוח, פיגור, סיום צפוי. */
function planStatus(p: StudyPlan) {
  const today = dayStart(Date.now());
  const dayIndex = Math.max(0, Math.floor((today - dayStart(p.startDate)) / DAY));
  const plannedByToday = Math.min(p.totalUnits, (dayIndex + 1) * p.unitsPerDay);
  const behind = Math.max(0, plannedByToday - p.completedUnits);
  const remainingDays = Math.ceil((p.totalUnits - p.completedUnits) / p.unitsPerDay);
  const finish = new Date(today + remainingDays * DAY);
  const pct = Math.round((p.completedUnits / p.totalUnits) * 100);
  const done = p.completedUnits >= p.totalUnits;
  return { behind, plannedByToday, remainingDays, finish, pct, done };
}

const RET_STYLE: Record<Retention, { cls: string; title: string }> = {
  ok: { cls: "bg-green-500", title: "שמור — אין שאלות שהגיע זמנן" },
  due: { cls: "bg-red-500", title: "פגר — יש שאלות שהגיע זמן לחזור עליהן" },
  new: { cls: "bg-amber-400", title: "עוד לא תורגל" },
  none: { cls: "bg-muted-foreground/30", title: "אין שאלות על היחידה" },
};

export default function StudyPlansSection() {
  const plans = useLiveQuery(() => db.studyPlans.toArray(), []);
  const [index, setIndex] = useState<ShasMeta[]>([]);
  useEffect(() => { void loadShasIndex().then(setIndex); }, []);

  // שאלות המסכתות של תוכניות הש"ס — ל"שמירת חומר"
  const masechtot = useMemo(() => [...new Set((plans ?? []).filter((p) => p.shas).map((p) => p.shas!.masechta))], [plans]);
  const cards = useLiveQuery(
    async (): Promise<Card[]> => (masechtot.length ? db.cards.where("masechta").anyOf(masechtot).toArray() : []),
    [masechtot.join("|")]
  );

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"shas" | "other">("shas");
  const [form, setForm] = useState({ name: "", unitLabel: "פרק", totalUnits: 100, unitsPerDay: 1 });
  const [shasForm, setShasForm] = useState({ masechta: "", unit: "amud" as "amud" | "daf", perDay: 1, startIndex: 0, done: 0 });
  const meta = index.find((m) => m.he === shasForm.masechta);
  const formUnits = useMemo(() => (meta ? unitsOf(meta, shasForm.unit) : []), [meta, shasForm.unit]);

  const create = async () => {
    const now = Date.now();
    let plan: StudyPlan;
    if (kind === "shas") {
      if (!meta) return;
      const total = formUnits.length - shasForm.startIndex;
      const done = Math.min(total, Math.max(0, shasForm.done));
      plan = {
        id: uid(),
        name: `ש"ס בבלי — ${meta.he}`,
        unitLabel: shasForm.unit === "amud" ? "עמוד" : "דף",
        totalUnits: total,
        unitsPerDay: shasForm.perDay,
        // כשכבר נלמדו יחידות — הלוח מתחיל כאילו התחלנו לפני כמה ימים, כדי ש"לפי לוח" יתאים
        startDate: dayStart(now) - Math.floor(done / shasForm.perDay) * DAY,
        completedUnits: done,
        createdAt: now,
        updatedAt: now,
        shas: { masechta: meta.he, slug: meta.slug, unit: shasForm.unit, startIndex: shasForm.startIndex },
      };
    } else {
      if (!form.name.trim() || form.totalUnits < 1 || form.unitsPerDay < 1) return;
      plan = {
        id: uid(), name: form.name.trim(), unitLabel: form.unitLabel.trim() || "יחידה",
        totalUnits: form.totalUnits, unitsPerDay: form.unitsPerDay, startDate: dayStart(now),
        completedUnits: 0, createdAt: now, updatedAt: now,
      };
    }
    await db.studyPlans.add(plan);
    setAdding(false);
    setForm({ name: "", unitLabel: "פרק", totalUnits: 100, unitsPerDay: 1 });
    setShasForm({ masechta: "", unit: "amud", perDay: 1, startIndex: 0, done: 0 });
  };

  const markToday = (p: StudyPlan) =>
    db.studyPlans.update(p.id, { completedUnits: Math.min(p.totalUnits, p.completedUnits + p.unitsPerDay), updatedAt: Date.now() });
  const undo = (p: StudyPlan) =>
    db.studyPlans.update(p.id, { completedUnits: Math.max(0, p.completedUnits - p.unitsPerDay), updatedAt: Date.now() });
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
          <div className="flex gap-1.5" role="group" aria-label="סוג התוכנית">
            <button className={`btn-outline h-8 text-xs rounded-full ${kind === "shas" ? "border-gold text-gold bg-gold/10" : ""}`} onClick={() => setKind("shas")}>ש"ס בבלי</button>
            <button className={`btn-outline h-8 text-xs rounded-full ${kind === "other" ? "border-gold text-gold bg-gold/10" : ""}`} onClick={() => setKind("other")}>חומש, תנ"ך, משנה ועוד</button>
          </div>

          {kind === "shas" ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <label className="text-xs text-muted-foreground col-span-2 md:col-span-1">מסכת
                  <select className="input mt-1" aria-label="מסכת" value={shasForm.masechta}
                    onChange={(e) => setShasForm({ ...shasForm, masechta: e.target.value, startIndex: 0, done: 0 })}>
                    <option value="">בחר מסכת…</option>
                    {index.map((m) => <option key={m.slug} value={m.he}>{m.he}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">יחידה
                  <select className="input mt-1" value={shasForm.unit}
                    onChange={(e) => setShasForm({ ...shasForm, unit: e.target.value as "amud" | "daf", startIndex: 0, done: 0 })}>
                    <option value="amud">עמוד</option>
                    <option value="daf">דף</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">ליום
                  <input className="input mt-1" type="number" min={1} value={shasForm.perDay}
                    onChange={(e) => setShasForm({ ...shasForm, perDay: Math.max(1, Number(e.target.value) || 1) })} />
                </label>
                <label className="text-xs text-muted-foreground">מתחילים מ
                  <select className="input mt-1" value={shasForm.startIndex} disabled={!meta}
                    onChange={(e) => setShasForm({ ...shasForm, startIndex: Number(e.target.value), done: 0 })}>
                    {formUnits.map((u, i) => <option key={u.key + i} value={i}>{u.label.replace(`${meta?.he} `, "")}</option>)}
                  </select>
                </label>
              </div>
              {meta && (
                <label className="text-xs text-muted-foreground block">כבר למדתי (יחידות מתוך התוכנית)
                  <input className="input mt-1 w-32" type="number" min={0} max={formUnits.length - shasForm.startIndex} value={shasForm.done}
                    onChange={(e) => setShasForm({ ...shasForm, done: Math.max(0, Number(e.target.value) || 0) })} />
                </label>
              )}
              {meta && (
                <p className="text-xs text-muted-foreground">
                  {formUnits.length - shasForm.startIndex} {shasForm.unit === "amud" ? "עמודים" : "דפים"} · {shasForm.perDay} ליום →
                  סיום בעוד {Math.ceil((formUnits.length - shasForm.startIndex - shasForm.done) / shasForm.perDay)} ימים
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((pr) => (
                  <button key={pr.name} className="btn-outline h-8 text-xs rounded-full" onClick={() => setForm({ ...pr })}>{pr.name}</button>
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
            </>
          )}
          <div className="flex gap-2">
            <button className="btn-primary h-9" disabled={kind === "shas" ? !meta : !form.name.trim()} onClick={create}>צור תוכנית</button>
            <button className="btn-outline h-9" onClick={() => setAdding(false)}>ביטול</button>
          </div>
        </div>
      )}

      {(plans ?? []).length === 0 && !adding ? (
        <p className="text-center text-muted-foreground border border-dashed rounded-lg py-6">
          אין תוכניות לימוד פעילות — הוסף תוכנית למסכת בש"ס, חומש, רמב"ם ועוד.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-2.5">
          {(plans ?? []).map((p) => (
            <PlanCard key={p.id} plan={p} index={index} cards={cards ?? []} onMark={markToday} onUndo={undo} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan: p, index, cards, onMark, onUndo, onRemove }: {
  plan: StudyPlan; index: ShasMeta[]; cards: Card[];
  onMark: (p: StudyPlan) => void; onUndo: (p: StudyPlan) => void; onRemove: (p: StudyPlan) => void;
}) {
  const st = planStatus(p);
  const units = planUnits(p, index);
  const next: PlanUnit | undefined = units?.[p.completedUnits];
  const bySchedule: PlanUnit | undefined = units?.[Math.max(0, st.plannedByToday - 1)];
  const learned = units ? units.slice(0, p.completedUnits) : [];
  const masechtaCards = useMemo(() => (p.shas ? cards.filter((c) => c.masechta === p.shas!.masechta) : []), [cards, p.shas]);
  const retention = useMemo(() => retentionOf(learned, masechtaCards), [learned, masechtaCards]);
  const dueCount = retention.filter((r) => r === "due").length;
  const shown = 48; // העיגולים האחרונים; הקודמים מסוכמים במספר
  const firstLearned = learned[0];
  const lastLearned = learned[learned.length - 1];

  return (
    <div className="card-panel space-y-2" data-testid="plan-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold truncate">{p.name}</p>
          <p className="text-xs text-muted-foreground">
            {p.completedUnits.toLocaleString()}/{p.totalUnits.toLocaleString()} {p.unitLabel === "עמוד" ? "עמודים" : p.unitLabel === "דף" ? "דפים" : `${p.unitLabel}ים`} · {p.unitsPerDay} ליום
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
        <div className="text-sm space-y-0.5">
          {next ? (
            <>
              <p>
                <span className="text-muted-foreground">הבאה לסימון: </span>
                <b>{next.label}</b>
              </p>
              {bySchedule && st.behind > p.unitsPerDay && (
                <p className="text-xs">
                  <span className="text-muted-foreground">לפי לוח: </span>{bySchedule.label}
                  <span className="text-destructive font-medium me-1"> · בפיגור {st.behind.toLocaleString()}</span>
                </p>
              )}
            </>
          ) : (
            <p>
              היום: {p.unitLabel} {(p.completedUnits + 1).toLocaleString()}
              {p.unitsPerDay > 1 ? `–${Math.min(p.totalUnits, p.completedUnits + p.unitsPerDay).toLocaleString()}` : ""}
              {st.behind > p.unitsPerDay && <span className="text-destructive text-xs font-medium me-2"> · בפיגור {st.behind.toLocaleString()}</span>}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            סיום משוער: {hebDate(st.finish)} ({st.remainingDays.toLocaleString()} ימים)
          </p>
        </div>
      )}

      {/* שמירת חומר: עיגול לכל יחידה שנלמדה — לחיצה מתרגלת אותה */}
      {p.shas && learned.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>שמירת חומר{dueCount ? <span className="text-red-600 font-medium"> · {dueCount} לחזרה</span> : ""}</span>
            {learned.length > shown && <span>+{learned.length - shown} קודמים</span>}
          </div>
          <div className="flex flex-wrap gap-1" aria-label="שמירת חומר">
            {learned.slice(-shown).map((u, i) => {
              const r = retention[learned.length - Math.min(shown, learned.length) + i];
              return (
                <Link key={u.key + i} to={practiceLink(p.shas!.masechta, u)} title={`${u.label} — ${RET_STYLE[r].title}`}
                  className={`h-3 w-3 rounded-full ${RET_STYLE[r].cls} hover:ring-2 hover:ring-gold`} data-retention={r} />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {!st.done && (
          <button className="btn-primary h-8 text-xs" onClick={() => onMark(p)}>
            <Check className="h-3.5 w-3.5" /> סיימתי
          </button>
        )}
        {p.shas && next && !st.done && (
          <>
            <Link className="btn-outline h-8 text-xs" to={dafLink(p, next)} title={`פתיחת ${next.label} בדפוס המדויק`}>
              <ScrollText className="h-3.5 w-3.5" /> לדף
            </Link>
            <Link className="btn-outline h-8 text-xs" to={practiceLink(p.shas.masechta, next)} title={`תרגול השאלות של ${next.label}`}>
              <GraduationCap className="h-3.5 w-3.5" /> תרגול
            </Link>
          </>
        )}
        {p.shas && firstLearned && lastLearned && (
          <Link className="btn-outline h-8 text-xs" title="חזרה מהירה על מה שנלמד — השאלות שהגיע זמנן"
            to={`/study?m=${encodeURIComponent(p.shas.masechta)}&from=${firstLearned.daf}&to=${lastLearned.daf}&due=1`}>
            <RotateCcw className="h-3.5 w-3.5" /> חזרה מהירה
          </Link>
        )}
        {p.completedUnits > 0 && (
          <button className="btn-ghost h-8 w-8 p-0" title="ביטול סימון אחרון" onClick={() => onUndo(p)}>
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button className="btn-ghost h-8 w-8 p-0 text-destructive ms-auto" title="מחיקת התוכנית" onClick={() => onRemove(p)}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
