import { useMemo } from "react";
import { Activity, CalendarDays, LineChart, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStudy } from "@/lib/study/store";
import { dafLabel } from "@/lib/study/shasGen";
import {
  buildShasPracticeProgress,
  summarizePageAttempts,
  type ShasMasechtaProgress,
  type ShasPageAttempt,
} from "@/lib/study/shasPracticeProgress";
import { cn } from "@/lib/utils";

function Trend({ attempts, compact = false }: { attempts: ShasPageAttempt[]; compact?: boolean }) {
  const summary = summarizePageAttempts(attempts);
  const improving = summary.delta != null && summary.delta >= 5;
  const regressing = summary.delta != null && summary.delta <= -5;
  const Icon = improving ? TrendingUp : regressing ? TrendingDown : Activity;
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold", compact ? "text-xs" : "text-sm", improving && "text-emerald-600", regressing && "text-destructive")}>
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {summary.trend}{summary.delta != null ? ` ${summary.delta > 0 ? "+" : ""}${summary.delta} נק׳` : ""}
    </span>
  );
}

function PageAttemptRow({ attempt, previous }: { attempt: ShasPageAttempt; previous?: ShasPageAttempt }) {
  const date = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(attempt.result.completedAt);
  const delta = previous ? attempt.score - previous.score : null;
  return (
    <div className="grid gap-2 rounded-xl border border-gold/30 bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center" data-testid="page-progress-attempt">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{attempt.result.sourceExamName || "תרגול כללי"}</span>
          <Badge variant="outline">{attempt.result.kind === "exam" ? "מבחן" : "תרגול כללי"}</Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{date}</div>
      </div>
      <span className="text-sm">{attempt.correct}/{attempt.total} נכונות בעמוד</span>
      {delta == null ? <span className="text-xs text-muted-foreground">ניסיון ראשון</span> : (
        <span className={cn("text-xs font-semibold", delta >= 5 ? "text-emerald-600" : delta <= -5 ? "text-destructive" : "text-muted-foreground")}>
          {Math.abs(delta) < 5 ? "ללא שינוי" : delta > 0 ? `שיפור +${delta}` : `נסיגה ${delta}`}
        </span>
      )}
      <strong className={cn("text-lg", attempt.score >= 80 ? "text-emerald-600" : attempt.score < 60 ? "text-destructive" : "text-foreground")}>{attempt.score}%</strong>
    </div>
  );
}

function PageSummary({ attempts }: { attempts: ShasPageAttempt[] }) {
  const summary = summarizePageAttempts(attempts);
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Card className="p-3"><span className="text-xs text-muted-foreground">חזרות בעמוד</span><strong className="mt-1 block text-2xl">{summary.attempts}</strong></Card>
      <Card className="p-3"><span className="text-xs text-muted-foreground">הצלחה כוללת</span><strong className="mt-1 block text-2xl">{summary.total ? `${summary.average}%` : "—"}</strong><span className="text-xs text-muted-foreground">{summary.correct}/{summary.total} תשובות נכונות</span></Card>
      <Card className="p-3"><span className="text-xs text-muted-foreground">מגמה</span><div className="mt-2"><Trend attempts={attempts} /></div></Card>
    </div>
  );
}

export function ShasProgressTree({ tree }: { tree: ShasMasechtaProgress[] }) {
  if (!tree.length) return null;
  return (
    <div className="space-y-3" data-testid="shas-progress-tree">
      {tree.map((masechta, masechtaIndex) => {
        const masechtaAttempts = masechta.dapim.flatMap((daf) => daf.amudim.flatMap((amud) => amud.attempts));
        return (
          <details key={masechta.masechta} className="rounded-2xl border-2 border-gold/35 bg-card p-3" open={masechtaIndex === 0}>
            <summary className="cursor-pointer list-none rounded-xl px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><strong className="text-lg">מסכת {masechta.masechta}</strong><p className="text-xs text-muted-foreground">{masechta.dapim.length} דפים עם תוצאות · {masechtaAttempts.length} חזרות לפי עמוד</p></div>
                <Trend attempts={masechtaAttempts} compact />
              </div>
            </summary>
            <div className="mt-2 space-y-2 border-t border-gold/20 pt-3">
              {masechta.dapim.map((daf, dafIndex) => {
                const dafAttempts = daf.amudim.flatMap((amud) => amud.attempts);
                return (
                  <details key={daf.daf} className="rounded-xl border border-gold/30 bg-muted/15 p-2" open={masechtaIndex === 0 && dafIndex === 0}>
                    <summary className="cursor-pointer list-none rounded-lg px-2 py-2">
                      <div className="flex items-center justify-between gap-2"><strong>דף {dafLabel(daf.daf).replace(".", "")}</strong><span className="text-xs text-muted-foreground">{dafAttempts.length} חזרות</span></div>
                    </summary>
                    <div className="mt-2 grid gap-3 xl:grid-cols-2">
                      {daf.amudim.map((amud) => (
                        <section key={amud.amud} className="space-y-2 rounded-xl border border-gold/30 bg-background p-3" aria-label={`${masechta.masechta} דף ${dafLabel(daf.daf)} עמוד ${amud.amud === 1 ? "א׳" : "ב׳"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">עמוד {amud.amud === 1 ? "א׳" : "ב׳"}</h4><Trend attempts={amud.attempts} compact /></div>
                          <PageSummary attempts={amud.attempts} />
                          <div className="space-y-2">{amud.attempts.map((attempt, index) => <PageAttemptRow key={`${attempt.result.id}:${amud.amud}`} attempt={attempt} previous={amud.attempts[index + 1]} />)}</div>
                        </section>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function PageProgressDialog({
  open,
  onOpenChange,
  masechta,
  daf,
  amud,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masechta: string;
  daf: number;
  amud: 1 | 2;
}) {
  const { state } = useStudy();
  const tree = useMemo(
    () => buildShasPracticeProgress(state.practiceResults ?? [], state.cards ?? [], state.categories ?? []),
    [state.practiceResults, state.cards, state.categories],
  );
  const attempts = tree
    .find((item) => item.masechta === masechta)?.dapim.find((item) => item.daf === daf)?.amudim.find((item) => item.amud === amud)?.attempts ?? [];
  const title = `${masechta} · דף ${dafLabel(daf).replace(".", "")} · עמוד ${amud === 1 ? "א׳" : "ב׳"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto" dir="rtl" data-testid="page-progress-dialog">
        <DialogHeader><DialogTitle className="flex items-center justify-end gap-2 text-right"><LineChart className="h-5 w-5 text-gold" />התקדמות — {title}</DialogTitle></DialogHeader>
        {attempts.length ? (
          <div className="space-y-4">
            <PageSummary attempts={attempts} />
            <div className="space-y-2"><h3 className="font-bold">כל המבחנים והתרגולים לפי תאריך</h3>{attempts.map((attempt, index) => <PageAttemptRow key={attempt.result.id} attempt={attempt} previous={attempts[index + 1]} />)}</div>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-gold/30 p-10 text-center text-sm text-muted-foreground"><CalendarDays className="mx-auto mb-2 h-8 w-8 text-gold" />עדיין אין תוצאות עבור {title}. לאחר סיום תרגול או מבחן הן יופיעו כאן.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
