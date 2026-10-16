import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { GraduationCap, TrendingUp, CheckCircle2, BookOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStudy } from "@/lib/study/store";

const DAY = 24 * 60 * 60 * 1000;
const RANGE_OPTIONS = [
  { value: "7", label: "7 ימים" },
  { value: "14", label: "14 ימים" },
  { value: "30", label: "30 ימים" },
];

export const WeeklySummary = () => {
  const { state, setUiPref } = useStudy();
  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [rangeDays, setRangeDays] = useState<string>("7");

  // ─── Cloud sync: one-time init from cloud prefs ────────────────────────────
  const cloudInitRef = useRef(false);
  useEffect(() => {
    if (cloudInitRef.current) return;
    const p = state.uiPrefs?.weeklySummaryPrefs;
    if (!p) return;
    cloudInitRef.current = true;
    if (p.deckFilter) setDeckFilter(p.deckFilter);
    if (p.rangeDays) setRangeDays(p.rangeDays);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state.uiPrefs?.weeklySummaryPrefs]);

  const syncToCloud = useCallback((df: string, rd: string) => {
    setUiPref("weeklySummaryPrefs", { deckFilter: df, rangeDays: rd });
  }, [setUiPref]);

  const handleSetDeckFilter = (v: string) => { cloudInitRef.current = true; setDeckFilter(v); syncToCloud(v, rangeDays); };
  const handleSetRangeDays = (v: string) => { cloudInitRef.current = true; setRangeDays(v); syncToCloud(deckFilter, v); };

  const data = useMemo(() => {
    const days = parseInt(rangeDays, 10);
    const now = Date.now();
    const rangeStart = now - days * DAY;
    const filteredLogs = state.logs.filter(
      (l) => l.at >= rangeStart && (deckFilter === "all" || l.deckId === deckFilter),
    );

    const decksToShow = deckFilter === "all"
      ? state.decks
      : state.decks.filter((d) => d.id === deckFilter);

    const perDeck = decksToShow.map((deck) => {
      const logs = filteredLogs.filter((l) => l.deckId === deck.id);
      const total = logs.length;
      const correct = logs.filter((l) => l.correct).length;
      const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;
      return { deck, total, correct, successRate };
    });

    const totalReviews = filteredLogs.length;
    const totalCorrect = filteredLogs.filter((l) => l.correct).length;
    const overallRate = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0;

    // Learning sessions in range
    const learningSessions = (state.learningSessions ?? []).filter((s) => {
      const d = new Date(s.date + "T00:00:00").getTime();
      return d >= rangeStart && d <= now;
    });
    const totalLearningSessions = learningSessions.length;
    const uniqueSubjects = new Set(learningSessions.map((s) => s.subject)).size;

    // Adaptive bucketing: <=14 days = daily, >14 = weekly aggregation
    const useWeekly = days > 14;
    const bucketCount = useWeekly ? Math.ceil(days / 7) : days;
    const bucketSize = useWeekly ? 7 : 1;

    const buckets = Array.from({ length: bucketCount }).map((_, i) => {
      const bucketStart = new Date(now - (bucketCount - 1 - i) * bucketSize * DAY);
      bucketStart.setHours(0, 0, 0, 0);
      const bucketEnd = bucketStart.getTime() + bucketSize * DAY;
      const inBucket = filteredLogs.filter((l) => l.at >= bucketStart.getTime() && l.at < bucketEnd);
      const count = inBucket.length;
      const correct = inBucket.filter((l) => l.correct).length;
      const rate = count > 0 ? Math.round((correct / count) * 100) : 0;
      // Learning sessions in this bucket (by date key)
      const sessionsInBucket = learningSessions.filter((s) => {
        const d = new Date(s.date + "T00:00:00").getTime();
        return d >= bucketStart.getTime() && d < bucketEnd;
      }).length;
      const label = useWeekly
        ? `${bucketStart.getDate()}/${bucketStart.getMonth() + 1}`
        : bucketStart.toLocaleDateString("he-IL", { weekday: "short" });
      return { label, count, rate, sessions: sessionsInBucket };
    });
    const maxBucket = Math.max(1, ...buckets.map((b) => b.count + b.sessions));

    return { perDeck, totalReviews, overallRate, buckets, maxBucket, useWeekly, totalLearningSessions, uniqueSubjects };
  }, [state, deckFilter, rangeDays]);

  return (
    <Card className="gold-frame p-6 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="gold-icon-circle"><GraduationCap className="h-4 w-4" /></span>
          <h3 className="font-display text-lg font-semibold">סיכום</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={rangeDays} onValueChange={handleSetRangeDays}>
            <SelectTrigger dir="ltr" className="w-[110px] h-9 rounded-full border-2 border-gold/60 bg-card text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deckFilter} onValueChange={handleSetDeckFilter}>
            <SelectTrigger className="w-[160px] h-9 rounded-full border-2 border-gold/60 bg-card text-sm">
              <SelectValue placeholder="כל המערכות" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המערכות</SelectItem>
              {state.decks.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {/* Stats row */}
      <div className="flex gap-4 text-sm flex-wrap mb-3">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-gold" />
          <span className="font-semibold text-foreground">{data.overallRate}%</span>
          <span className="text-muted-foreground">הצלחה</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-gold" />
          <span className="font-semibold text-foreground">{data.totalReviews}</span>
          <span className="text-muted-foreground">חזרות</span>
        </div>
        {data.totalLearningSessions > 0 && (
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold text-foreground">{data.totalLearningSessions}</span>
            <span className="text-muted-foreground">לימודים</span>
            {data.uniqueSubjects > 1 && (
              <span className="text-[11px] text-muted-foreground">({data.uniqueSubjects} נושאים)</span>
            )}
          </div>
        )}
      </div>

      <div className="mb-2 text-[11px] text-muted-foreground text-right">
        {data.useWeekly ? "מציג לפי שבועות" : "מציג לפי ימים"}
      </div>

      {/* Chart legend */}
      {data.totalLearningSessions > 0 && (
        <div className="flex items-center gap-4 justify-center mb-2">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-6 rounded bg-gradient-navy" />
            <span className="text-[11px] text-muted-foreground">חזרות כרטיסיות</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-6 rounded bg-emerald-500/70" />
            <span className="text-[11px] text-muted-foreground">לימוד כללי</span>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-end justify-between gap-1.5 h-28 px-1">
          {data.buckets.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-semibold text-gold">
                {b.count > 0 ? `${b.rate}%` : ""}
              </span>
              <div className="w-full flex flex-col items-center h-full justify-end gap-0">
                {/* Card review bar */}
                {b.count > 0 && (
                  <div
                    className="w-full rounded-t-md bg-gradient-navy transition-all"
                    style={{ height: `${(b.count / data.maxBucket) * 100}%`, minHeight: 4 }}
                    title={`${b.count} חזרות · ${b.rate}% הצלחה`}
                  />
                )}
                {/* Learning sessions bar stacked on top */}
                {b.sessions > 0 && (
                  <div
                    className={`w-full bg-emerald-500/70 transition-all ${b.count === 0 ? "rounded-t-md" : ""}`}
                    style={{ height: `${(b.sessions / data.maxBucket) * 100}%`, minHeight: 4 }}
                    title={`${b.sessions} לימודים`}
                  />
                )}
                {b.count === 0 && b.sessions === 0 && <div className="w-full" style={{ height: "0%" }} />}
              </div>
              <span className="text-[9px] text-muted-foreground truncate w-full text-center">{b.label}</span>
              <span className="text-[10px] font-semibold text-foreground">{b.count + b.sessions || ""}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {data.perDeck.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-4">אין מערכות עדיין</div>
        )}
        {data.perDeck.map(({ deck, total, correct, successRate }) => (
          <div key={deck.id} dir="rtl" className="rounded-xl border-2 border-gold/40 bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-foreground">{deck.name}</span>
              <span className="text-xs text-muted-foreground">{correct}/{total} נכונות</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${successRate}%` }} />
              </div>
              <span className="text-sm font-bold text-gold w-12 text-left">{successRate}%</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
