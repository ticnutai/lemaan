import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, TrendingUp, AlertTriangle, Zap, BarChart3, Target } from "lucide-react";
import { useStudy } from "@/lib/study/store";
import { dateKey } from "@/lib/study/goals";
import { cn } from "@/lib/utils";

const DAY = 24 * 60 * 60 * 1000;
const FORECAST_DAYS = 14;

function todayKey() {
  return dateKey(Date.now());
}

/**
 * Compute consecutive-day streak from any activity.
 * Counts back from today; first day without ANY activity ends the streak.
 */
function computeStreak(activeDates: Set<string>): number {
  let streak = 0;
  const cur = new Date();
  cur.setHours(0, 0, 0, 0);
  // If no activity today, streak still continues from yesterday (grace day)
  // — but we only count active days. So check today first; if missing,
  // start checking from yesterday (don't count today but allow streak from yesterday).
  let allowToday = true;
  while (true) {
    const k = dateKey(cur.getTime());
    if (activeDates.has(k)) {
      streak += 1;
    } else if (!allowToday) {
      break;
    }
    allowToday = false;
    cur.setDate(cur.getDate() - 1);
    if (streak > 365) break; // safety
  }
  return streak;
}

export function InsightsCard() {
  const { state } = useStudy();

  // ─── Build set of dates with ANY activity (streak source of truth) ─────
  const activeDates = useMemo(() => {
    const s = new Set<string>();
    state.logs.forEach((l) => s.add(dateKey(l.at)));
    (state.shasReviews ?? []).forEach((r) => { if (r.doneAt) s.add(r.doneAt); });
    (state.planReviews ?? []).forEach((r) => { if (r.doneAt) s.add(r.doneAt); });
    (state.learningSessions ?? []).forEach((sess) => s.add(sess.date));
    return s;
  }, [state.logs, state.shasReviews, state.planReviews, state.learningSessions]);

  const streak = useMemo(() => computeStreak(activeDates), [activeDates]);

  // ─── Stats: today + this week ───────────────────────────────────────────
  const today = todayKey();
  const todayCount = useMemo(() => {
    let n = 0;
    state.logs.forEach((l) => { if (dateKey(l.at) === today) n++; });
    (state.shasReviews ?? []).forEach((r) => { if (r.doneAt === today) n++; });
    (state.planReviews ?? []).forEach((r) => { if (r.doneAt === today) n++; });
    (state.learningSessions ?? []).forEach((s) => { if (s.date === today) n++; });
    return n;
  }, [state.logs, state.shasReviews, state.planReviews, state.learningSessions, today]);

  const weekCount = useMemo(() => {
    const since = Date.now() - 7 * DAY;
    const sinceKey = dateKey(since);
    let n = 0;
    state.logs.forEach((l) => { if (l.at >= since) n++; });
    (state.shasReviews ?? []).forEach((r) => { if (r.doneAt && r.doneAt >= sinceKey) n++; });
    (state.planReviews ?? []).forEach((r) => { if (r.doneAt && r.doneAt >= sinceKey) n++; });
    (state.learningSessions ?? []).forEach((s) => { if (s.date >= sinceKey) n++; });
    return n;
  }, [state.logs, state.shasReviews, state.planReviews, state.learningSessions]);

  // ─── Forecast: next 14 days ─────────────────────────────────────────────
  const forecast = useMemo(() => {
    const days: { key: string; date: Date; cards: number; shas: number; plans: number; total: number }[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < FORECAST_DAYS; i++) {
      const d = new Date(start.getTime() + i * DAY);
      const k = dateKey(d.getTime());
      // Cards: due if dueAt <= end of this day
      const dayEnd = d.getTime() + DAY - 1;
      const cards = i === 0
        ? state.cards.filter((c) => c.srs.dueAt <= dayEnd).length
        : state.cards.filter((c) => c.srs.dueAt > start.getTime() + (i - 1) * DAY && c.srs.dueAt <= dayEnd).length;
      const shas = (state.shasReviews ?? []).filter((r) => !r.isInitial && !r.doneAt && r.dueDate === k).length;
      const plans = (state.planReviews ?? []).filter((r) => !r.doneAt && r.dueDate === k).length;
      // For day 0 (today) include all overdue counts too
      const overdueShas = i === 0 ? (state.shasReviews ?? []).filter((r) => !r.isInitial && !r.doneAt && r.dueDate < k).length : 0;
      const overduePlans = i === 0 ? (state.planReviews ?? []).filter((r) => !r.doneAt && r.dueDate < k).length : 0;
      const totalShas = shas + overdueShas;
      const totalPlans = plans + overduePlans;
      days.push({
        key: k,
        date: d,
        cards,
        shas: totalShas,
        plans: totalPlans,
        total: cards + totalShas + totalPlans,
      });
    }
    return days;
  }, [state.cards, state.shasReviews, state.planReviews]);

  const maxForecast = Math.max(1, ...forecast.map((d) => d.total));
  const totalDueNext7 = forecast.slice(0, 7).reduce((sum, d) => sum + d.total, 0);

  // ─── Weak spots ─────────────────────────────────────────────────────────
  // Top 5 cards with worst correct-rate (min 3 reviews to qualify)
  const weakCards = useMemo(() => {
    return state.cards
      .filter((c) => c.stats.totalReviews >= 3)
      .map((c) => ({
        id: c.id,
        question: c.question,
        rate: c.stats.correct / c.stats.totalReviews,
        fails: c.stats.incorrect,
        total: c.stats.totalReviews,
      }))
      .filter((c) => c.rate < 0.7) // < 70% correct
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);
  }, [state.cards]);

  // Leeches: cards with 5+ failures
  const leechCount = useMemo(() => {
    return state.cards.filter((c) => c.stats.incorrect >= 5).length;
  }, [state.cards]);

  // Plan units that are overdue (struggling — review missed)
  const overduePlanCount = useMemo(() => {
    return (state.planReviews ?? []).filter((r) => !r.doneAt && r.dueDate < today).length;
  }, [state.planReviews, today]);

  // ─── Retention rate (last 30 days) ──────────────────────────────────────
  // Sources: card logs (correct field), learning sessions (quality >= 3), plan reviews (quality >= 2 = passed)
  const retention = useMemo(() => {
    const cutoffMs = Date.now() - 30 * 86_400_000;
    let total = 0;
    let passed = 0;

    state.logs.forEach((l) => {
      if (l.at >= cutoffMs) {
        total++;
        if (l.correct) passed++;
      }
    });

    (state.learningSessions ?? []).forEach((s) => {
      if (s.sessionType !== "review") return;
      const ms = new Date(s.date + "T00:00:00").getTime();
      if (ms >= cutoffMs) {
        total++;
        if (s.quality >= 3) passed++;
      }
    });

    (state.planReviews ?? []).forEach((r) => {
      if (!r.doneAt) return;
      const ms = new Date(r.doneAt + "T00:00:00").getTime();
      if (ms >= cutoffMs) {
        total++;
        if ((r.quality ?? 3) >= 2) passed++;
      }
    });

    const rate = total === 0 ? null : passed / total;
    return { total, passed, rate };
  }, [state.logs, state.learningSessions, state.planReviews]);

  // Mature cards: interval >= 21 days (Anki convention)
  const matureCount = useMemo(() => {
    return state.cards.filter((c) => c.srs.interval >= 21).length;
  }, [state.cards]);

  // Mastered plan units: ones whose last review was quality=4 at the final stage
  const masteredPlanUnits = useMemo(() => {
    const planIntervalsLen = (state.planReviewIntervals ?? [1, 7, 30, 90]).length;
    const byUnit = new Map<string, number>(); // key: planId|unit -> max reviewIndex with done
    (state.planReviews ?? []).forEach((r) => {
      if (!r.doneAt) return;
      const k = `${r.planId}|${r.unit}`;
      byUnit.set(k, Math.max(byUnit.get(k) ?? 0, r.reviewIndex));
    });
    let mastered = 0;
    byUnit.forEach((idx) => { if (idx >= planIntervalsLen) mastered++; });
    return mastered;
  }, [state.planReviews, state.planReviewIntervals]);

  // ─── Struggling plan units (FSRS-inspired difficulty) ─────────────────
  // Top 5 units with worst average quality across all completed reviews
  const strugglingUnits = useMemo(() => {
    const stats = new Map<string, { planTitle: string; unit: string; sum: number; count: number; failures: number }>();
    (state.planReviews ?? []).forEach((r) => {
      if (!r.doneAt || r.quality === undefined) return;
      const k = `${r.planId}|${r.unit}`;
      const cur = stats.get(k) ?? { planTitle: r.planTitle, unit: r.unit, sum: 0, count: 0, failures: 0 };
      cur.sum += r.quality;
      cur.count += 1;
      if (r.quality === 1) cur.failures += 1;
      stats.set(k, cur);
    });
    return Array.from(stats.values())
      .filter((s) => s.count >= 2) // at least 2 grades to be meaningful
      .map((s) => ({ ...s, avg: s.sum / s.count }))
      .filter((s) => s.avg < 2.5 || s.failures >= 2)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 5);
  }, [state.planReviews]);

  const DAY_NAMES_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

  return (
    <Card className="gold-frame p-5 space-y-5 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="gold-icon-circle">
            <BarChart3 className="h-4 w-4" />
          </span>
          <h3 className="font-display text-lg font-semibold">תובנות לימוד</h3>
        </div>
        <Badge variant="outline" className="border-gold/40 text-[10px]">
          ניתוח חכם
        </Badge>
      </div>

      {/* ─── Streak + week stats row ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border-2 border-gold/40 p-3 text-center space-y-0.5">
          <Flame className={cn("h-5 w-5 mx-auto", streak >= 7 ? "text-orange-500" : "text-muted-foreground")} />
          <div className="text-2xl font-display font-bold">{streak}</div>
          <div className="text-[10px] text-muted-foreground">רצף ימים</div>
        </div>
        <div className="rounded-xl border-2 border-gold/40 p-3 text-center space-y-0.5">
          <Zap className={cn("h-5 w-5 mx-auto", todayCount > 0 ? "text-gold" : "text-muted-foreground")} />
          <div className="text-2xl font-display font-bold">{todayCount}</div>
          <div className="text-[10px] text-muted-foreground">היום</div>
        </div>
        <div className="rounded-xl border-2 border-gold/40 p-3 text-center space-y-0.5">
          <TrendingUp className="h-5 w-5 mx-auto text-emerald-500" />
          <div className="text-2xl font-display font-bold">{weekCount}</div>
          <div className="text-[10px] text-muted-foreground">השבוע</div>
        </div>
      </div>

      {streak >= 3 && streak < 7 && (
        <div className="text-[11px] text-center text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded-lg py-1.5 px-3">
          🔥 עוד {7 - streak} ימים לרצף שבוע!
        </div>
      )}
      {streak >= 7 && streak < 30 && (
        <div className="text-[11px] text-center text-orange-600 bg-orange-500/10 border border-orange-500/30 rounded-lg py-1.5 px-3">
          🔥 רצף של {streak} ימים — המשך כך!
        </div>
      )}
      {streak >= 30 && (
        <div className="text-[11px] text-center text-orange-700 bg-gradient-to-r from-orange-500/15 to-amber-500/15 border border-orange-500/40 rounded-lg py-1.5 px-3 font-semibold">
          🏆 רצף אגדי — {streak} ימים רצופים!
        </div>
      )}

      {/* ─── Forecast: next 14 days ──────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="border-gold/30 text-[10px]">
            {totalDueNext7} בשבוע הקרוב
          </Badge>
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            תחזית עומס — 14 ימים
            <Target className="h-3.5 w-3.5 text-gold" />
          </h4>
        </div>
        <div className="flex items-end gap-1 h-24 border-b border-gold/20 pb-1">
          {forecast.map((d, i) => {
            const heightPct = d.total === 0 ? 0 : Math.max(8, (d.total / maxForecast) * 100);
            const isToday = i === 0;
            return (
              <div
                key={d.key}
                className="flex-1 flex flex-col items-center gap-0.5 group"
                title={`${d.key}\nכרטיסיות: ${d.cards}\nש"ס: ${d.shas}\nתוכניות: ${d.plans}\nסה"כ: ${d.total}`}
              >
                <div className="text-[9px] text-muted-foreground group-hover:text-foreground transition-colors">
                  {d.total > 0 ? d.total : ""}
                </div>
                <div
                  className={cn(
                    "w-full rounded-t transition-all flex flex-col-reverse overflow-hidden",
                    isToday ? "ring-2 ring-gold" : "",
                  )}
                  style={{ height: `${heightPct}%`, minHeight: d.total > 0 ? "4px" : "1px" }}
                >
                  {d.cards > 0 && (
                    <div
                      className="bg-gradient-to-t from-blue-500 to-blue-400"
                      style={{ height: `${(d.cards / d.total) * 100}%` }}
                    />
                  )}
                  {d.shas > 0 && (
                    <div
                      className="bg-gradient-to-t from-amber-500 to-amber-400"
                      style={{ height: `${(d.shas / d.total) * 100}%` }}
                    />
                  )}
                  {d.plans > 0 && (
                    <div
                      className="bg-gradient-to-t from-emerald-500 to-emerald-400"
                      style={{ height: `${(d.plans / d.total) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-end gap-1">
          {forecast.map((d, i) => (
            <div key={d.key} className="flex-1 text-center text-[9px] text-muted-foreground">
              {i === 0 ? "היום" : DAY_NAMES_SHORT[d.date.getDay()]}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" />כרטיסיות</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />ש&quot;ס</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />תוכניות</span>
        </div>
      </div>

      {/* ─── Retention rate (last 30 days) ─────────────────────────── */}
      <div className="space-y-2 border-t border-gold/15 pt-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="border-gold/30 text-[10px]">
            30 ימים אחרונים
          </Badge>
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            סטטיסטיקת זכירה
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          </h4>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className={cn(
            "rounded-xl border-2 p-2 text-center space-y-0.5",
            retention.rate === null ? "border-muted/40" :
            retention.rate >= 0.85 ? "border-emerald-500/50 bg-emerald-500/5" :
            retention.rate >= 0.7 ? "border-gold/40" :
            "border-amber-500/50 bg-amber-500/5"
          )}>
            <div className={cn(
              "text-2xl font-display font-bold",
              retention.rate === null ? "text-muted-foreground" :
              retention.rate >= 0.85 ? "text-emerald-600" :
              retention.rate >= 0.7 ? "text-foreground" :
              "text-amber-600"
            )}>
              {retention.rate === null ? "—" : `${Math.round(retention.rate * 100)}%`}
            </div>
            <div className="text-[10px] text-muted-foreground">אחוז זכירה</div>
          </div>
          <div className="rounded-xl border-2 border-blue-500/40 p-2 text-center space-y-0.5">
            <div className="text-2xl font-display font-bold text-blue-600">{matureCount}</div>
            <div className="text-[10px] text-muted-foreground">כרטיסים בוגרים</div>
          </div>
          <div className="rounded-xl border-2 border-purple-500/40 p-2 text-center space-y-0.5">
            <div className="text-2xl font-display font-bold text-purple-600">{masteredPlanUnits}</div>
            <div className="text-[10px] text-muted-foreground">יחידות נשלטו</div>
          </div>
        </div>
        {retention.rate !== null && (
          <p className="text-[10px] text-muted-foreground text-right">
            {retention.passed} מתוך {retention.total} חזרות עברו בהצלחה.
            {retention.rate >= 0.9 && " ⭐ יעד אופטימלי (Anki ממליץ 85-95%)"}
            {retention.rate < 0.7 && " 💡 שקול לקצר את מרווחי החזרה"}
          </p>
        )}
      </div>

      {/* ─── Weak spots ──────────────────────────────────────────────── */}
      {(weakCards.length > 0 || leechCount > 0 || overduePlanCount > 0) && (
        <div className="space-y-2 border-t border-gold/15 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {leechCount > 0 && (
                <Badge variant="outline" className="border-destructive/50 text-destructive text-[10px]">
                  {leechCount} עקשניות
                </Badge>
              )}
              {overduePlanCount > 0 && (
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-[10px]">
                  {overduePlanCount} פגרות
                </Badge>
              )}
            </div>
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              נקודות חולשה
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            </h4>
          </div>

          {weakCards.length > 0 && (
            <div className="space-y-1">
              {weakCards.map((c) => {
                const ratePct = Math.round(c.rate * 100);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 text-xs rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1.5"
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge className="bg-destructive/80 text-destructive-foreground text-[9px] px-1.5 py-0 h-4">
                        {ratePct}%
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        ({c.fails}/{c.total})
                      </span>
                    </div>
                    <span className="text-right flex-1 truncate" title={c.question}>
                      {c.question}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {weakCards.length === 0 && (leechCount > 0 || overduePlanCount > 0) && (
            <p className="text-[11px] text-muted-foreground text-right">
              {leechCount > 0 && `${leechCount} כרטיסיות עם 5+ כשלונות זקוקות לתשומת לב.`}
              {overduePlanCount > 0 && ` ${overduePlanCount} חזרות תוכניות פגרו — בצע אותן בלוח החזרות.`}
            </p>
          )}

          {strugglingUnits.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-[10px] text-muted-foreground text-right">
                📚 יחידות עם דירוג דל:
              </p>
              {strugglingUnits.map((s) => {
                const avgPct = Math.round((s.avg / 4) * 100);
                return (
                  <div
                    key={`${s.planTitle}|${s.unit}`}
                    className="flex items-center justify-between gap-2 text-xs rounded-lg border border-purple-500/30 bg-purple-500/5 px-2 py-1.5"
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge className="bg-purple-500/80 text-white text-[9px] px-1.5 py-0 h-4">
                        {avgPct}%
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        ({s.count} דירוגים)
                      </span>
                    </div>
                    <span className="text-right flex-1 truncate" title={`${s.planTitle} — ${s.unit}`}>
                      <span className="text-muted-foreground">{s.planTitle}:</span> {s.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {weakCards.length === 0 && leechCount === 0 && overduePlanCount === 0 && strugglingUnits.length === 0 && state.cards.length > 0 && (
        <div className="text-[11px] text-center text-emerald-600 bg-emerald-500/10 border border-emerald-500/30 rounded-lg py-1.5 px-3">
          ✨ אין נקודות חולשה — שלוט בכל החומר!
        </div>
      )}
    </Card>
  );
}
