import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Play, Pencil, Trash2, ChevronDown, ChevronUp, BarChart3, Flame, TrendingUp, FileQuestion, Calendar } from "lucide-react";
import { useStudy } from "@/lib/study/store";
import { cn } from "@/lib/utils";
import { displayCategoryName } from "@/lib/study/shasGen";
import type { QuizPlan } from "@/lib/study/types";
import { calcStreakDays, computeAccuracy, calcCumulativeScore, collectWrongCardIds, filterCardsForPlan, planIsCurrentlyActive } from "@/lib/study/quiz";
import { QuizPlanSetupDialog } from "./QuizPlanSetupDialog";
import { QuizRunnerDialog } from "./QuizRunnerDialog";

export function QuizPlansCard() {
  const { state, deleteQuizPlan, setActiveQuizPlan } = useStudy();
  const plans = state.quizPlans ?? [];
  const attempts = state.quizAttempts ?? [];

  const [setupOpen, setSetupOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<QuizPlan | null>(null);
  const [runnerPlan, setRunnerPlan] = useState<QuizPlan | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const onNewPlan = () => { setEditingPlan(null); setSetupOpen(true); };
  const onEdit = (p: QuizPlan) => { setEditingPlan(p); setSetupOpen(true); };
  const onStart = (p: QuizPlan) => setRunnerPlan(p);

  useEffect(() => {
    const openRequested = (requestedId?: string) => {
      let id = requestedId;
      try { id ??= sessionStorage.getItem("practice-start-quiz-plan-v1") ?? undefined; } catch { /* ignore */ }
      const selected = plans.find((item) => item.id === id);
      if (!selected) return;
      try { sessionStorage.removeItem("practice-start-quiz-plan-v1"); } catch { /* ignore */ }
      setRunnerPlan(selected);
    };
    openRequested();
    const onRequest = (event: Event) => openRequested((event as CustomEvent<{ planId?: string }>).detail?.planId);
    window.addEventListener("deepfocus:start-quiz-plan", onRequest);
    return () => window.removeEventListener("deepfocus:start-quiz-plan", onRequest);
  }, [plans]);

  return (
    <Card className="p-4 border-gold/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileQuestion className="h-5 w-5 text-gold" />
          <h3 className="font-display text-lg font-semibold">תוכניות בחינה</h3>
        </div>
        <Button size="sm" onClick={onNewPlan} className="bg-gradient-navy text-primary-foreground gap-1">
          <Plus className="h-4 w-4" /> הוסף תוכנית
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <p>אין עדיין תוכניות בחינה</p>
          <p className="text-xs mt-1">בנה תוכנית כדי להיבחן בעצמך באופן שיטתי על קטגוריות שתבחר.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              expanded={expandedId === plan.id}
              onToggle={() => setExpandedId(expandedId === plan.id ? null : plan.id)}
              onEdit={() => onEdit(plan)}
              onStart={() => onStart(plan)}
              onDelete={() => deleteQuizPlan(plan.id)}
              onSetActive={(v) => setActiveQuizPlan(plan.id, v)}
              attempts={attempts}
              cards={state.cards}
            />
          ))}
        </div>
      )}

      <QuizPlanSetupDialog open={setupOpen} onOpenChange={setSetupOpen} editingPlan={editingPlan} />
      <QuizRunnerDialog open={!!runnerPlan} onOpenChange={(o) => { if (!o) setRunnerPlan(null); }} plan={runnerPlan} />
    </Card>
  );
}

interface PlanRowProps {
  plan: QuizPlan;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onStart: () => void;
  onDelete: () => void;
  onSetActive: (v: boolean) => void;
  attempts: ReturnType<typeof useStudy>["state"]["quizAttempts"];
  cards: ReturnType<typeof useStudy>["state"]["cards"];
}

function PlanRow({ plan, expanded, onToggle, onEdit, onStart, onDelete, onSetActive, attempts, cards }: PlanRowProps) {
  const att = attempts ?? [];
  const accuracy = useMemo(() => computeAccuracy(att, plan.id), [att, plan.id]);
  const streak = useMemo(() => calcStreakDays(att, plan.id), [att, plan.id]);
  const score = useMemo(() => calcCumulativeScore(att, plan.id), [att, plan.id]);
  const wrongIds = useMemo(() => collectWrongCardIds(att, plan.id), [att, plan.id]);
  const planAttempts = useMemo(() => att.filter((a) => a.planId === plan.id && a.finishedAt).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0)), [att, plan.id]);
  const lastAttempts = planAttempts.slice(0, 5);
  const availableCount = useMemo(() => filterCardsForPlan(cards, plan).length, [cards, plan]);
  const wrongCards = useMemo(() => cards.filter((c) => wrongIds.has(c.id)), [cards, wrongIds]);
  const isCurrentlyActive = planIsCurrentlyActive(plan);

  return (
    <div className={cn("rounded-xl border-2 p-3 transition-colors", isCurrentlyActive ? "border-gold/40 bg-card" : "border-muted bg-muted/30")}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onToggle} className="flex-1 text-right">
          <div className="font-semibold text-sm flex items-center gap-1.5">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {plan.name}
            {!plan.isActive && <Badge variant="outline" className="text-[10px]">מושבתת</Badge>}
            {plan.isActive && !isCurrentlyActive && <Badge variant="outline" className="text-[10px]">הסתיימה</Badge>}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {plan.scopes.length === 0 ? "—" : plan.scopes.length === 1 && !plan.scopes[0].path
              ? "כל הקטגוריות"
              : plan.scopes.slice(0, 3).map((s) => s.path ? displayCategoryName(s.path) : "הכל").join(" • ")
                + (plan.scopes.length > 3 ? ` +${plan.scopes.length - 3}` : "")}
            {" • "}
            {availableCount} שאלות זמינות
          </div>
        </button>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={onStart} disabled={!availableCount || !plan.isActive}
            className="bg-gold text-navy hover:bg-gold/90 gap-1 h-8">
            <Play className="h-3.5 w-3.5" /> התחל
          </Button>
          <Button size="icon" variant="ghost" onClick={onEdit} className="h-8 w-8" title="ערוך">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="מחק">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>למחוק את התוכנית?</AlertDialogTitle>
                <AlertDialogDescription>
                  התוכנית "{plan.name}" תימחק. ההיסטוריה של המבחנים תישמר.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>מחק</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-gold/30 pt-2">
          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2 text-xs">
            <StatBox icon={<TrendingUp className="h-3.5 w-3.5" />} label="אחוז" value={`${accuracy.pct}%`} />
            <StatBox icon={<Flame className="h-3.5 w-3.5" />} label="רצף" value={`${streak}י`} />
            <StatBox icon={<BarChart3 className="h-3.5 w-3.5" />} label="ציון" value={`${score}`} />
            <StatBox icon={<FileQuestion className="h-3.5 w-3.5" />} label="מבחנים" value={`${planAttempts.length}`} />
          </div>

          {accuracy.total > 0 && (
            <div className="space-y-1">
              <Progress value={accuracy.pct} className="h-1.5" />
              <div className="text-[10px] text-muted-foreground">
                {accuracy.correct}/{accuracy.total} שאלות נכונות בכלל המבחנים
              </div>
            </div>
          )}

          {/* Big exam dates */}
          {plan.frequency.bigExamDates.length > 0 && (
            <div className="text-[11px]">
              <div className="text-muted-foreground inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> תאריכי בחינה:</div>{" "}
              {plan.frequency.bigExamDates.map((d) => (
                <Badge key={d} variant="secondary" className="mx-0.5 text-[10px]">{d}</Badge>
              ))}
            </div>
          )}

          {/* Last attempts comparison */}
          {lastAttempts.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold mb-1">מבחנים אחרונים:</div>
              <div className="flex flex-wrap gap-1">
                {lastAttempts.map((a) => (
                  <div key={a.id} className="rounded-md border border-gold/30 px-2 py-0.5 text-[10px] bg-card"
                    title={new Date(a.finishedAt ?? 0).toLocaleString("he-IL")}>
                    {a.correct}/{a.total} ({a.score}%)
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Wrong questions */}
          {wrongCards.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold mb-1">שאלות שטעיתי בהן ({wrongCards.length}):</div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {wrongCards.slice(0, 20).map((c) => (
                  <div key={c.id} className="text-[10px] text-muted-foreground truncate p-1 rounded bg-secondary/30">
                    • {c.question.slice(0, 100)}
                  </div>
                ))}
                {wrongCards.length > 20 && (
                  <div className="text-[10px] text-muted-foreground">+ {wrongCards.length - 20} נוספות</div>
                )}
              </div>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between pt-1 border-t border-gold/20">
            <button onClick={() => onSetActive(!plan.isActive)} className="text-[11px] text-muted-foreground hover:text-foreground">
              {plan.isActive ? "השבת תוכנית" : "הפעל מחדש"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/40 p-2 text-center">
      <div className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px]">{icon}{label}</div>
      <div className="font-bold text-sm">{value}</div>
    </div>
  );
}
