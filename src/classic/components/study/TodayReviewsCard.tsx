import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell, BookOpen, Brain, Check, ChevronDown, ChevronUp, RotateCcw,
} from "lucide-react";
import { useStudy } from "@/lib/study/store";
import { isDue } from "@/lib/study/srs";
import { cn } from "@/lib/utils";
import { formatShasPosition } from "@/lib/study/shasFormat";
import { QualityButtons } from "./QualityButtons";

const REVIEW_INDEX_LABELS = ["", "חזרה א׳", "חזרה ב׳", "חזרה ג׳", "חזרה ד׳"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TodayReviewsCard() {
  const { state, markPlanReviewDone, undoPlanReviewDone, postponePlanReview, markShasReviewDone, unmarkShasReviewDone } = useStudy();
  const today = todayStr();
  const [expanded, setExpanded] = useState(true);

  const srsDueCount = useMemo(() => state.cards.filter(isDue).length, [state.cards]);

  const shasReviewsDueToday = useMemo(() =>
    (state.shasReviews ?? []).filter((r) => !r.isInitial && r.dueDate <= today && !r.doneAt),
    [state.shasReviews, today]
  );

  const planReviewsDueToday = useMemo(() =>
    (state.planReviews ?? []).filter((r) => r.dueDate <= today && !r.doneAt),
    [state.planReviews, today]
  );

  const planReviewsDoneToday = useMemo(() =>
    (state.planReviews ?? []).filter((r) => r.doneAt === today),
    [state.planReviews, today]
  );

  const totalDue = srsDueCount + shasReviewsDueToday.length + planReviewsDueToday.length;
  const totalDone = planReviewsDoneToday.length;

  // Group plan reviews by plan title
  const planReviewsByPlan = useMemo(() => {
    const map = new Map<string, typeof planReviewsDueToday>();
    planReviewsDueToday.forEach((r) => {
      const key = r.planTitle;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries());
  }, [planReviewsDueToday]);

  return (
    <Card className="gold-frame p-5 space-y-4 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <span className="gold-icon-circle">
            <Bell className="h-4 w-4" />
          </span>
          <h3 className="font-display text-lg font-semibold">לוח חזרות יומי</h3>
          {totalDue > 0 && (
            <Badge className="bg-gradient-navy text-primary-foreground text-xs px-2">
              {totalDue} ממתין
            </Badge>
          )}
          {totalDone > 0 && (
            <Badge variant="outline" className="border-gold/50 text-gold text-xs px-2">
              {totalDone} הושלם היום
            </Badge>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3">
          {/* Empty state */}
          {totalDue === 0 && totalDone === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6 border-2 border-dashed border-gold/30 rounded-xl">
              <Check className="h-8 w-8 mx-auto text-gold/40 mb-2" />
              <p>כל החזרות הושלמו להיום 🎉</p>
            </div>
          )}

          {/* Interleaving suggestion: when multiple plans + cards are due, recommend alternating */}
          {(planReviewsByPlan.length >= 2 || (planReviewsByPlan.length >= 1 && srsDueCount >= 5)) && (
            <div className="rounded-xl border border-blue-400/40 bg-blue-500/5 p-2.5 text-[11px] text-right" dir="rtl">
              <div className="flex items-start gap-1.5 justify-end">
                <span className="text-blue-700 dark:text-blue-300 leading-snug">
                  💡 <b>טיפ:</b> מחקרים מראים שזכירה משתפרת ב-25% כשמחליפים בין נושאים במקום לסיים אחד. נסה לחזור על תוכנית אחת, ואז לעבור לאחרת לפני שתסיים את הראשונה.
                </span>
              </div>
            </div>
          )}

          {/* SRS cards */}
          {srsDueCount > 0 && (
            <div className="rounded-xl border-2 border-gold/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Brain className="h-4 w-4 text-gold" />
                  <span className="text-sm font-semibold">כרטיסיות לחזרה</span>
                </div>
                <Badge className="bg-gradient-navy text-primary-foreground text-xs">
                  {srsDueCount}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground text-right">
                עבור לטאב &quot;חזרות לימוד&quot; להתחיל
              </p>
            </div>
          )}

          {/* Shas reviews */}
          {shasReviewsDueToday.length > 0 && (
            <div className="rounded-xl border-2 border-gold/40 p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-gold" />
                  <span className="text-sm font-semibold">חזרות ש&quot;ס</span>
                </div>
                <Badge variant="outline" className="border-amber-500/60 text-amber-600 text-xs">
                  {shasReviewsDueToday.length}
                </Badge>
              </div>
              {shasReviewsDueToday.slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => markShasReviewDone(r.id, today)}
                      className="h-6 w-6 flex items-center justify-center rounded border-2 border-gold/40 hover:bg-gold/10 transition-colors"
                      title="סיימתי"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-muted-foreground flex-1 text-right">
                    {formatShasPosition(r.masechta, r.daf, r.amud, null)}
                    {r.dueDate < today && (
                      <span className="text-destructive mr-1">
                        (פגר {Math.ceil((Date.now() - new Date(r.dueDate + "T00:00:00").getTime()) / 86400000)} ימים)
                      </span>
                    )}
                  </span>
                </div>
              ))}
              {shasReviewsDueToday.length > 3 && (
                <p className="text-[11px] text-muted-foreground text-right">
                  ועוד {shasReviewsDueToday.length - 3}...
                </p>
              )}
            </div>
          )}

          {/* Plan reviews grouped by plan */}
          {planReviewsByPlan.map(([planTitle, reviews]) => (
            <div key={planTitle} className="rounded-xl border-2 border-gold/40 p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-semibold">{planTitle}</span>
                </div>
                <Badge variant="outline" className="border-emerald-500/60 text-emerald-600 text-xs">
                  {reviews.length}
                </Badge>
              </div>
              {reviews.map((r) => (
                <div key={r.id} className={cn(
                  "rounded-lg px-2 py-1.5 border space-y-1.5",
                  r.dueDate < today ? "border-destructive/40 bg-destructive/5" : "border-gold/20"
                )}>
                  <div className="text-right space-y-0.5">
                    <span className="text-xs font-medium">{r.unit}</span>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-[11px] text-muted-foreground">
                        {REVIEW_INDEX_LABELS[r.reviewIndex] ?? `חזרה ${r.reviewIndex}`}
                      </span>
                      {r.dueDate < today && (
                        <span className="text-[11px] text-destructive">
                          (פגר {Math.ceil((Date.now() - new Date(r.dueDate + "T00:00:00").getTime()) / 86400000)} ימים)
                        </span>
                      )}
                    </div>
                  </div>
                  <QualityButtons onGrade={(q) => markPlanReviewDone(r.id, q)} size="xs" />
                  <button
                    onClick={() => postponePlanReview(r.id, 1)}
                    className="w-full text-[10px] text-muted-foreground hover:text-foreground py-0.5 rounded border border-dashed border-muted-foreground/20 hover:bg-muted/40 transition-colors"
                    title="דחה ביום"
                  >
                    ⏭ דחה למחר
                  </button>
                </div>
              ))}
            </div>
          ))}

          {/* Done today (with undo) */}
          {planReviewsDoneToday.length > 0 && (
            <div className="rounded-xl border-2 border-gold/20 bg-gold/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-gold text-right">
                הושלמו היום ({planReviewsDoneToday.length})
              </p>
              {planReviewsDoneToday.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => undoPlanReviewDone(r.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="בטל"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                  <span className="text-muted-foreground line-through text-right flex-1">
                    {r.planTitle} — {r.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
