import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, X, NotebookPen, Save, Target, BookOpen, Repeat, CalendarClock, Trash2, Pencil, Plus, Star, Clock, ChevronDown, BookMarked, Minus, Copy, Filter } from "lucide-react";
import { toast } from "sonner";
import { useStudy } from "@/lib/study/store";
import { dateKey } from "@/lib/study/goals";
import { buildPlanScheduleMap } from "@/lib/study/planSchedule";
import { computeExpectedShasPosition, formatShasPosition } from "@/lib/study/shasFormat";
import type { Card as StudyCard, ShasReview } from "@/lib/study/types";
import { cn } from "@/lib/utils";
import { toHebrewDate } from "@/lib/hebrewDate";
import { SubjectPickerDialog, type SubjectMeta } from "./SubjectPickerDialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dateKeyStr: string | null;
}

export function DayDetailDialog({ open, onOpenChange, dateKeyStr }: Props) {
  const {
    state, toggleGoalDate, setDayNote,
    completeGeneralPlanUnit, uncompleteSpecificUnit,
    setGeneralPlanProgressTo,
    markPlanReviewDone, undoPlanReviewDone,
    markShasReviewDone, unmarkShasReviewDone,
    rescheduleShasReview, setShasReviewNote, deleteShasReview,
    addLearningSession, deleteLearningSession,
    addManualShasReview,
    addDeck, addCard,
    deleteReviewLog,
  } = useStudy();
  const [note, setNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");

  // Learning session add-form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSubject, setAddSubject] = useState("");
  const [addType, setAddType] = useState<"initial" | "review">("initial");
  const [addQuality, setAddQuality] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [addDuration, setAddDuration] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addNextReview, setAddNextReview] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"none" | "preset" | "custom">("none");
  // after adding initial session, offer to create a flashcard
  const [lastAddedSubject, setLastAddedSubject] = useState<string | null>(null);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  // meta from SubjectPickerDialog (may be null for manual text input)
  const [selectedMeta, setSelectedMeta] = useState<SubjectMeta | null>(null);

  const existingNote = useMemo(
    () => (state.dayNotes ?? []).find((n) => n.date === dateKeyStr),
    [state.dayNotes, dateKeyStr]
  );

  useEffect(() => {
    setNote(existingNote?.text ?? "");
  }, [existingNote, dateKeyStr, open]);

  // Reset learning-session form when dialog opens
  useEffect(() => {
    if (open) {
      setShowAddForm(false);
      setAddSubject("");
      setAddType("initial");
      setAddQuality(4);
      setAddDuration("");
      setAddNote("");
      setAddNextReview("");
      setScheduleMode("none");
      setLastAddedSubject(null);
      setSubjectPickerOpen(false);
      setSelectedMeta(null);
    }
  }, [open]);

  const dayLogs = useMemo(() => {
    if (!dateKeyStr) return [];
    return state.logs.filter((l) => dateKey(l.at) === dateKeyStr);
  }, [state.logs, dateKeyStr]);

  // General learning sessions for this day
  const dayLearningSessions = useMemo(() => {
    if (!dateKeyStr) return [];
    return (state.learningSessions ?? [])
      .filter((s) => s.date === dateKeyStr)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [state.learningSessions, dateKeyStr]);

  // Shas reviews due / done on this day
  const dayShasReviews = useMemo(() => {
    if (!dateKeyStr) return [];
    return (state.shasReviews ?? []).filter(
      (r) => r.dueDate === dateKeyStr || r.doneAt === dateKeyStr,
    ).sort((a, b) => {
      // לימוד ראשוני קודם, ואז לפי reviewIndex
      if (a.isInitial !== b.isInitial) return a.isInitial ? -1 : 1;
      return a.reviewIndex - b.reviewIndex;
    });
  }, [state.shasReviews, dateKeyStr]);

  // Total review-times per (masechta, daf, amud, half) — counting only DONE non-initial reviews
  const reviewsCountByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of (state.shasReviews ?? [])) {
      if (r.isInitial) continue;
      if (!r.doneAt) continue;
      const k = `${r.masechta}|${r.daf}|${r.amud}|${r.half ?? 0}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [state.shasReviews]);
  const repsForRow = (r: { masechta: string; daf: number; amud: 1 | 2; half?: 1 | 2 | null }) =>
    reviewsCountByKey.get(`${r.masechta}|${r.daf}|${r.amud}|${r.half ?? 0}`) ?? 0;

  // Sessions from other dates scheduled for review today (not yet reviewed today)
  const dueReviews = useMemo(() => {
    if (!dateKeyStr) return [];
    const allSessions = state.learningSessions ?? [];
    const reviewedSubjectsToday = new Set(
      allSessions
        .filter((s) => s.date === dateKeyStr && s.sessionType === "review")
        .map((s) => s.subject)
    );
    const seen = new Set<string>();
    return allSessions
      .filter((s) => s.nextReviewDate === dateKeyStr && s.date !== dateKeyStr && !reviewedSubjectsToday.has(s.subject))
      .filter((s) => { if (seen.has(s.subject)) return false; seen.add(s.subject); return true; });
  }, [state.learningSessions, dateKeyStr]);

  const cardsById = useMemo(() => {
    const m = new Map<string, StudyCard>();
    state.cards.forEach((c) => m.set(c.id, c));
    return m;
  }, [state.cards]);

  const decksById = useMemo(() => {
    const m = new Map<string, string>();
    state.decks.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [state.decks]);

  // Manual goals (custom + shas_daf) that the user can toggle for this date
  const manualGoals = (state.goals ?? []).filter(
    (g) => g.type === "custom" || g.type === "shas_daf"
  );

  const totalCorrect = dayLogs.filter((l) => l.correct).length;
  const totalIncorrect = dayLogs.length - totalCorrect;
  const successRate = dayLogs.length > 0 ? Math.round((totalCorrect / dayLogs.length) * 100) : 0;

  const formattedDate = useMemo(() => {
    if (!dateKeyStr) return "";
    const d = new Date(dateKeyStr + "T00:00:00");
    return toHebrewDate(d, true);
  }, [dateKeyStr]);

  const activeShasPlan = useMemo(() => {
    const plans = state.shasPlans ?? [];
    if (plans.length > 0) {
      if (state.activeShasPlanId) {
        const active = plans.find((p) => p.id === state.activeShasPlanId);
        if (active) return active;
      }
      return plans[0];
    }
    return state.shasPlan ?? null;
  }, [state.shasPlans, state.activeShasPlanId, state.shasPlan]);

  const plannedPlanUnitsToday = useMemo(() => {
    if (!dateKeyStr) return [] as Array<{ planId: string; planTitle: string; unit: string; done: boolean }>;
    const d = new Date(`${dateKeyStr}T00:00:00`);
    const rows: Array<{ planId: string; planTitle: string; unit: string; done: boolean }> = [];

    (state.generalPlans ?? []).forEach((plan) => {
      if (plan.planType === "masechta_review") return;
      const map = buildPlanScheduleMap(plan, d, d);
      const dayUnits = map.get(dateKeyStr) ?? [];
      if (dayUnits.length === 0) return;
      const doneSet = new Set(plan.completedUnits ?? []);
      dayUnits.forEach((unit) => {
        rows.push({
          planId: plan.id,
          planTitle: plan.title,
          unit,
          done: doneSet.has(unit),
        });
      });
    });

    return rows;
  }, [dateKeyStr, state.generalPlans]);

  const topChecklistRows = useMemo(() => {
    if (!dateKeyStr) {
      return [] as Array<
        | { kind: "plan"; key: string; unit: string; subLabel: string; done: boolean; planId: string }
        | { kind: "planReview"; key: string; unit: string; subLabel: string; done: boolean; reviewId: string }
        | { kind: "review"; key: string; unit: string; subLabel: string; done: boolean; reviewId: string }
      >;
    }

    const planRows = plannedPlanUnitsToday.map((row) => ({
      kind: "plan" as const,
      key: `plan:${row.planId}:${row.unit}`,
      unit: row.unit,
      subLabel: row.planTitle,
      done: row.done,
      planId: row.planId,
    }));

    const planReviewRows = (state.planReviews ?? [])
      .filter((r) => r.dueDate === dateKeyStr)
      .map((r) => ({
        kind: "planReview" as const,
        key: `planReview:${r.id}`,
        unit: r.unit,
        subLabel: `חזרה ${r.reviewIndex} — ${r.planTitle}`,
        done: r.doneAt === dateKeyStr,
        reviewId: r.id,
      }));

    const reviewRows = dayShasReviews
      .filter((r) => r.dueDate === dateKeyStr)
      .map((r) => ({
        kind: "review" as const,
        key: `review:${r.id}`,
        unit: formatShasPosition(r.masechta, r.daf, r.amud, r.unit === "half" ? (r.half ?? 1) : null),
        subLabel: r.isInitial ? 'לימוד ראשון — ש"ס בבלי' : `חזרה ${Math.max(1, r.reviewIndex - 1)} — ש"ס בבלי`,
        done: r.doneAt === dateKeyStr,
        reviewId: r.id,
      }));

    return [...planRows, ...planReviewRows, ...reviewRows];
  }, [dateKeyStr, plannedPlanUnitsToday, state.planReviews, dayShasReviews]);

  const PRESET_DAYS = [1, 7, 14, 30, 90];

  const calcNextDate = (offset: number) => {
    if (!dateKeyStr) return "";
    const d = new Date(dateKeyStr + "T00:00:00");
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const handleAddSession = () => {
    if (!dateKeyStr || !addSubject.trim()) return;
    const nextDate = scheduleMode === "none" ? null : (addNextReview || null);
    const subject = addSubject.trim();
    const type = addType;
    addLearningSession({
      date: dateKeyStr,
      subject,
      sessionType: type,
      quality: addQuality,
      durationMinutes: addDuration ? parseInt(addDuration, 10) : undefined,
      note: addNote.trim() || undefined,
      nextReviewDate: nextDate,
      reviewNumber: type === "initial" ? 1 : 2,
    });

    // Auto-schedule Shas review intervals for initial Shas Bavli sessions
    if (type === "initial" && selectedMeta?.type === "shas") {
      const intervals = state.reviewIntervals ?? [1, 3, 7, 14, 30];
      const baseDate = new Date(dateKeyStr + "T00:00:00");
      const unit = (state.shasPlan?.unit ?? "daf") as ShasReview["unit"];
      // Mark today as initial review (done)
      addManualShasReview({
        masechta: selectedMeta.masechta, daf: selectedMeta.daf, amud: selectedMeta.amud,
        unit, dueDate: dateKeyStr, doneAt: dateKeyStr, isInitial: true, reviewIndex: 0,
      });
      // Schedule follow-up reviews
      intervals.forEach((days, idx) => {
        const due = new Date(baseDate);
        due.setDate(due.getDate() + days);
        addManualShasReview({
          masechta: selectedMeta.masechta, daf: selectedMeta.daf, amud: selectedMeta.amud,
          unit, dueDate: due.toISOString().slice(0, 10), reviewIndex: idx + 1,
        });
      });
    }

    // offer flashcard creation only for new (initial) learning
    if (type === "initial") setLastAddedSubject(subject);
    setShowAddForm(false);
    setAddSubject("");
    setAddType("initial");
    setAddQuality(4);
    setAddDuration("");
    setAddNote("");
    setAddNextReview("");
    setScheduleMode("none");
    setSelectedMeta(null);
  };

  const handleCreateFlashcard = () => {
    if (!lastAddedSubject) return;
    let deck = state.decks.find((d) => d.name === "לימודים");
    if (!deck) deck = addDeck("לימודים", "כרטיסיות לחזרה על לימוד");
    addCard({
      deckId: deck.id,
      type: "flashcard",
      question: `חזור על: ${lastAddedSubject}`,
      answer: "",
      tags: ["cat:לימודים"],
    } as Parameters<typeof addCard>[0]);
    setLastAddedSubject(null);
  };

  const handleSaveNote = () => {
    if (!dateKeyStr) return;
    setDayNote(dateKeyStr, note);
    onOpenChange(false);
  };

  if (!dateKeyStr) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className="gold-frame max-w-lg max-h-[85vh] overflow-y-auto"
        dir="rtl"
        onEscapeKeyDown={() => onOpenChange(false)}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-right text-lg">
            {formattedDate}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 sm:space-y-6 text-right">
          {/* Day stats for card/question reviews only */}
          {dayLogs.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-lg border-2 border-gold/40 p-2.5 bg-card">
                <div className="text-[10px] text-muted-foreground">חזרות</div>
                <div className="font-display text-xl font-semibold">{dayLogs.length}</div>
              </div>
              <div className="rounded-lg border-2 border-gold/40 p-2.5 bg-card">
                <div className="text-[10px] text-muted-foreground">נכון</div>
                <div className="font-display text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                  {totalCorrect}
                </div>
              </div>
              <div className="rounded-lg border-2 border-gold/40 p-2.5 bg-card">
                <div className="text-[10px] text-muted-foreground">שגיאות</div>
                <div className="font-display text-xl font-semibold text-destructive">
                  {totalIncorrect}
                </div>
              </div>
            </div>
          )}
          {dayLogs.length > 0 && (
            <div className="text-xs text-muted-foreground">
              אחוז הצלחה ביום זה: <span className="font-semibold text-foreground">{successRate}%</span>
            </div>
          )}

          {/* Learning summary strip */}
          {(dayLearningSessions.length > 0 || dayLogs.length > 0) && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              {dayLearningSessions.filter((s) => s.sessionType === "initial").length > 0 && (
                <span className="text-[11px] rounded-full px-2 py-0.5 border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  {dayLearningSessions.filter((s) => s.sessionType === "initial").length} לימוד חדש
                </span>
              )}
              {dayLearningSessions.filter((s) => s.sessionType === "review").length > 0 && (
                <span className="text-[11px] rounded-full px-2 py-0.5 border border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                  {dayLearningSessions.filter((s) => s.sessionType === "review").length} חזרות ידניות
                </span>
              )}
              {dayLogs.length > 0 && (
                <span className="text-[11px] rounded-full px-2 py-0.5 border border-gold/40 bg-gold/10 text-gold">
                  {dayLogs.length} כרטיסיות
                </span>
              )}
            </div>
          )}

          {/* Due reviews — sessions scheduled for review today */}
          {dueReviews.length > 0 && (
            <div className="rounded-xl border-2 border-blue-500/40 bg-blue-50/60 dark:bg-blue-950/20 p-3 space-y-2">
              <h4 className="w-full text-sm font-semibold flex items-center gap-1 justify-start text-blue-700 dark:text-blue-400">
                ממתינים לחזרה היום <Repeat className="h-4 w-4" />
              </h4>
              {dueReviews.map((s) => (
                <div key={s.id} className="flex flex-row-reverse items-center justify-between gap-2 rounded-lg border border-blue-400/30 bg-card p-2">
                  <Button
                    size="sm" variant="outline"
                    className="h-7 px-2 text-xs border-blue-500/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                    onClick={() => { setAddSubject(s.subject); setAddType("review"); setShowAddForm(true); }}
                  >
                    <Plus className="h-3 w-3" /> תעד חזרה
                  </Button>
                  <span className="text-sm font-medium text-right flex-1">{s.subject}</span>
                </div>
              ))}
            </div>
          )}

          {/* Manual goal completion */}
          {manualGoals.length > 0 && (
            <div className="space-y-2">
              <h4 className="w-full text-sm font-semibold flex items-center gap-1 justify-start">
                סימון יעדים <Target className="h-4 w-4 text-gold" />
              </h4>
              <p className="text-[11px] text-muted-foreground">
                סמן יעדים שביצעת ביום זה (גם אם שכחת לעדכן בזמן אמת)
              </p>
              <div className="space-y-1.5">
                {manualGoals.map((g) => {
                  const done = (g.manualDoneDates ?? []).includes(dateKeyStr);
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleGoalDate(g.id, dateKeyStr)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 rounded-lg border-2 p-2.5 transition-colors",
                        done
                          ? "border-gold bg-gold/10"
                          : "border-gold/30 bg-card hover:border-gold/60"
                      )}
                    >
                      <div
                        className={cn(
                          "h-6 w-6 rounded-md border-2 flex items-center justify-center shrink-0",
                          done
                            ? "border-gold bg-gradient-navy text-primary-foreground"
                            : "border-gold/40"
                        )}
                      >
                        {done && <Check className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 text-right">
                        <div className="text-sm font-semibold">{g.title}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {done ? "סומן כהושלם" : "טרם סומן"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top actionable checklist for both learning and review */}
          {topChecklistRows.length > 0 && (
            <div className="space-y-2">
              <h4 className="w-full text-sm font-semibold text-right">
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="h-4 w-4 text-gold" /> לימוד וחזרה מתוכננים ליום זה
                </span>
              </h4>
              <p className="text-[11px] text-muted-foreground text-right">
                כאן מסמנים את שניהם: גם לימוד וגם חזרה. כל פריט מופיע פעם אחת בלבד.
              </p>
              <div className="space-y-1.5">
                {topChecklistRows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => {
                      if (row.kind === "plan") {
                        const plan = (state.generalPlans ?? []).find((p) => p.id === row.planId);
                        const idx = plan?.units.indexOf(row.unit) ?? -1;
                        if (idx >= 0) {
                          setGeneralPlanProgressTo(row.planId, row.done ? idx : idx + 1);
                        } else if (row.done) {
                          uncompleteSpecificUnit(row.planId, row.unit);
                        } else {
                          completeGeneralPlanUnit(row.planId, row.unit);
                        }
                        return;
                      }
                      if (row.kind === "planReview") {
                        if (row.done) undoPlanReviewDone(row.reviewId);
                        else markPlanReviewDone(row.reviewId, 3);
                        return;
                      }
                      if (row.done) unmarkShasReviewDone(row.reviewId);
                      else markShasReviewDone(row.reviewId, dateKeyStr!);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 rounded-lg border-2 p-2.5 transition-colors",
                      row.done
                        ? "border-emerald-500/60 bg-emerald-500/10"
                        : "border-gold/30 bg-card hover:border-gold/60"
                    )}
                    title={row.done ? "הסר סימון" : "סמן שבוצע"}
                  >
                    <div className="h-6 w-6 flex items-center justify-center shrink-0">
                      {row.done ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(255,255,255)] border-[1.5px] border-[rgb(198,154,42)] shadow-sm">
                          <Check
                            className="h-3.5 w-3.5 text-[rgb(29,73,135)]"
                            strokeWidth={2.6}
                          />
                        </span>
                      ) : (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/35 bg-muted/70">
                          <Check className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.6} />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 text-right min-w-0">
                      <div className={cn("text-sm font-semibold truncate", row.done && "line-through text-muted-foreground")}>{row.unit}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{row.subLabel}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Learning sessions section */}
          <div className="space-y-3">
            <div className="h-px bg-gradient-to-l from-transparent via-gold/35 to-transparent" aria-hidden="true" />
            <h4 className="w-full text-sm font-semibold text-right">
              <span className="inline-flex items-center gap-1">
                <BookOpen className="h-4 w-4 text-gold" /> לימוד וחזרות
              </span>
            </h4>
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                onClick={() => setShowAddForm((v) => !v)}
                className="h-7 px-2 text-xs bg-gradient-navy text-primary-foreground rounded-xl"
              >
                <Plus className="h-3 w-3 opacity-80" />
                הוסף לימוד / חזרה
              </Button>
            </div>

            {/* Inline add form */}
            {showAddForm && (
              <div className="rounded-xl border-2 border-gold/40 bg-card p-4 space-y-3.5">
                {/* Subject */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground block text-right">נושא *</label>
                  <div className="flex flex-row-reverse gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSubjectPickerOpen(true)}
                      title={'בחר מתוכנית הש"ס'}
                      className="h-8 w-8 flex items-center justify-center rounded-lg border-2 border-gold/50 bg-gold/5 hover:bg-gold/15 shrink-0 transition-colors"
                    >
                      <BookMarked className="h-4 w-4 text-gold" />
                    </button>
                    <Input
                      value={addSubject}
                      onChange={(e) => { setAddSubject(e.target.value); setSelectedMeta(null); }}
                      placeholder="גמרא / הלכה / פרשה / ..."
                      className="border-2 border-gold/40 text-right h-8 text-sm flex-1"
                      dir="rtl"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Type toggle */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground block text-right">סוג</label>
                  <div className="flex flex-row-reverse gap-2">
                    {(["initial", "review"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setAddType(t)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg border-2 text-xs font-semibold transition-colors",
                          addType === t
                            ? "border-gold bg-gold/20 text-gold"
                            : "border-gold/30 bg-background text-muted-foreground hover:border-gold/60"
                        )}
                      >
                        {t === "initial" ? "לימוד ראשוני" : "חזרה"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality stars */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground block text-right">איכות</label>
                  <div className="flex gap-1 justify-end">
                    {([1, 2, 3, 4, 5] as const).map((q) => (
                      <button
                        key={q}
                        onClick={() => setAddQuality(q)}
                        className="p-0.5 transition-transform hover:scale-110"
                        title={`${q}/5`}
                      >
                        <Star
                          className={cn(
                            "h-6 w-6",
                            q <= addQuality ? "fill-gold text-gold" : "text-muted-foreground"
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                    משך <Clock className="h-3 w-3" />
                  </label>
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-xs text-muted-foreground">דקות</span>
                    <Input
                      type="number"
                      min={1}
                      max={600}
                      value={addDuration}
                      onChange={(e) => setAddDuration(e.target.value)}
                      placeholder="אופציונלי"
                      className="border-2 border-gold/40 text-right h-8 text-sm w-28"
                      dir="rtl"
                    />
                  </div>
                </div>

                {/* Schedule next review */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground block text-right">תזמון חזרה הבאה</label>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    <button
                      onClick={() => { setScheduleMode("none"); setAddNextReview(""); }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                        scheduleMode === "none"
                          ? "border-gold bg-gold/20 text-gold"
                          : "border-gold/30 text-muted-foreground hover:border-gold/60"
                      )}
                    >ללא</button>
                    {PRESET_DAYS.map((d) => (
                      <button
                        key={d}
                        onClick={() => {
                          setScheduleMode("preset");
                          setAddNextReview(calcNextDate(d));
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                          scheduleMode === "preset" && addNextReview === calcNextDate(d)
                            ? "border-gold bg-gold/20 text-gold"
                            : "border-gold/30 text-muted-foreground hover:border-gold/60"
                        )}
                      >
                        {d < 30 ? `${d}י'` : d === 30 ? "חודש" : "3 חודשים"}
                      </button>
                    ))}
                    <button
                      onClick={() => setScheduleMode("custom")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                        scheduleMode === "custom"
                          ? "border-gold bg-gold/20 text-gold"
                          : "border-gold/30 text-muted-foreground hover:border-gold/60"
                      )}
                    >בחר תאריך</button>
                  </div>
                  {scheduleMode === "custom" && (
                    <Input
                      type="date"
                      value={addNextReview}
                      onChange={(e) => setAddNextReview(e.target.value)}
                      min={dateKeyStr ?? undefined}
                      className="border-2 border-gold/40 text-right h-8 text-sm"
                    />
                  )}
                  {scheduleMode !== "none" && addNextReview && (
                    <p className="text-[10px] text-muted-foreground text-right">
                      חזרה הבאה: {addNextReview}
                    </p>
                  )}
                </div>

                {/* Note */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground block text-right">הערה (אופציונלי)</label>
                  <Input
                    value={addNote}
                    onChange={(e) => setAddNote(e.target.value)}
                    placeholder="..."
                    className="border-2 border-gold/40 text-right h-8 text-sm"
                    dir="rtl"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => setShowAddForm(false)}
                    className="h-8 text-xs"
                  >
                    <X className="h-3.5 w-3.5" /> ביטול
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddSession}
                    disabled={!addSubject.trim()}
                    className="h-8 text-xs bg-gradient-navy text-primary-foreground"
                  >
                    <Save className="h-3.5 w-3.5" /> שמור
                  </Button>
                </div>
              </div>
            )}

            {/* Existing sessions for this day */}
            {dayLearningSessions.length > 0 && (
              <div className="space-y-2">
                {dayLearningSessions.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border-2 border-gold/30 bg-card p-3 text-right"
                    dir="rtl"
                  >
                    <div className="flex items-start gap-2 flex-row-reverse">
                      <button
                        onClick={() => {
                          if (confirm("למחוק רשומה זו?")) deleteLearningSession(s.id);
                        }}
                        className="h-6 w-6 flex items-center justify-center shrink-0 mt-0.5 text-muted-foreground hover:text-destructive"
                        title="מחק"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex w-full items-center gap-1.5 flex-wrap justify-start text-right">
                          <span className="text-sm font-semibold">{s.subject}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              s.sessionType === "initial"
                                ? "border-emerald-500/60 text-emerald-600 dark:text-emerald-400"
                                : "border-blue-500/60 text-blue-600 dark:text-blue-400"
                            )}
                          >
                            {s.sessionType === "initial" ? "לימוד ראשוני" : "חזרה"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 justify-start mt-1 flex-wrap">
                          {/* Stars */}
                          <div className="flex gap-0.5">
                            {([1, 2, 3, 4, 5] as const).map((q) => (
                              <Star
                                key={q}
                                className={cn(
                                  "h-3.5 w-3.5",
                                  q <= s.quality ? "fill-gold text-gold" : "text-muted-foreground/30"
                                )}
                              />
                            ))}
                          </div>
                          {s.durationMinutes && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-3 w-3" /> {s.durationMinutes} דק'
                            </span>
                          )}
                          {s.nextReviewDate && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <CalendarClock className="h-3 w-3" /> חזרה: {s.nextReviewDate}
                            </span>
                          )}
                        </div>
                        {s.note && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 italic">
                            {s.note}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dayLearningSessions.length === 0 && !showAddForm && topChecklistRows.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-right">
                לא נרשם לימוד ביום זה. לחץ על "הוסף" לתיעוד.
              </p>
            )}

            {/* Post-add CTA: offer to create a flashcard for the new learning */}
            {lastAddedSubject && (
              <div className="rounded-xl border-2 border-gold/50 bg-gold/5 p-2.5 flex items-center gap-2">
                <div className="flex-1 text-right min-w-0">
                  <p className="text-xs font-medium">רוצה להוסיף כרטיסייה לחזרה?</p>
                  <p className="text-[10px] text-muted-foreground truncate">{lastAddedSubject}</p>
                </div>
                <Button size="sm" onClick={handleCreateFlashcard}
                  className="h-7 px-2 text-xs bg-gradient-navy text-primary-foreground shrink-0">
                  <Plus className="h-3 w-3" /> הוסף כרטיסייה
                </Button>
                <button onClick={() => setLastAddedSubject(null)} className="text-muted-foreground hover:text-foreground shrink-0" title="סגור">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Shas reviews for this day */}
          {dayShasReviews.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-row-reverse items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const allDone = dayShasReviews.every((r) => r.doneAt === dateKeyStr);
                      if (allDone) {
                        dayShasReviews.forEach((r) => { if (r.doneAt === dateKeyStr) unmarkShasReviewDone(r.id); });
                      } else {
                        dayShasReviews.forEach((r) => { if (r.doneAt !== dateKeyStr) markShasReviewDone(r.id, dateKeyStr!); });
                      }
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-gold transition-colors"
                    title="סמן/בטל את כל הפריטים ביום זה"
                  >
                    {(() => {
                      const allDone = dayShasReviews.every((r) => r.doneAt === dateKeyStr);
                      const someDone = dayShasReviews.some((r) => r.doneAt === dateKeyStr);
                      return (
                        <span className={cn(
                          "h-5 w-5 rounded-md border-2 flex items-center justify-center",
                          allDone ? "border-emerald-600 bg-emerald-600 text-primary-foreground"
                            : someDone ? "border-gold bg-gold/20"
                            : "border-gold/40",
                        )}>
                          {allDone ? <Check className="h-3.5 w-3.5" /> : someDone ? <Minus className="h-3 w-3 text-gold" /> : null}
                        </span>
                      );
                    })()}
                    בחר הכול
                  </button>
                  {/* Mark only undone */}
                  <button
                    type="button"
                    onClick={() => {
                      const undone = dayShasReviews.filter((r) => r.doneAt !== dateKeyStr);
                      if (undone.length === 0) { toast("הכול כבר סומן כבוצע"); return; }
                      undone.forEach((r) => markShasReviewDone(r.id, dateKeyStr!));
                      toast(`סומנו ${undone.length} פריטים שלא בוצעו עדיין`);
                    }}
                    title="סמן רק שלא בוצעו עדיין"
                    className="h-7 w-7 rounded-md border border-gold/40 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-gold transition-colors"
                  >
                    <Filter className="h-3.5 w-3.5" />
                  </button>
                  {/* Copy */}
                  <button
                    type="button"
                    onClick={async () => {
                      const lines = dayShasReviews.map((r) => {
                        const label = formatShasPosition(r.masechta, r.daf, r.amud, r.unit === "half" ? (r.half ?? 1) : null);
                        const tag = r.isInitial ? "לימוד ראשון" : `חזרה ${r.reviewIndex - 1}`;
                        const status = r.doneAt === dateKeyStr ? " ✓" : "";
                        return `${label} (${tag})${status}`;
                      });
                      try {
                        await navigator.clipboard.writeText(lines.join("\n"));
                        toast(`הועתקו ${lines.length} שורות ללוח`);
                      } catch { toast("ההעתקה נכשלה"); }
                    }}
                    title="העתק את כל הרשימה ללוח"
                    className="h-7 w-7 rounded-md border border-gold/40 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-gold transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {/* Copy only undone */}
                  <button
                    type="button"
                    onClick={async () => {
                      const undone = dayShasReviews.filter((r) => r.doneAt !== dateKeyStr);
                      if (undone.length === 0) { toast("אין פריטים שלא בוצעו"); return; }
                      const lines = undone.map((r) => {
                        const label = formatShasPosition(r.masechta, r.daf, r.amud, r.unit === "half" ? (r.half ?? 1) : null);
                        const tag = r.isInitial ? "לימוד ראשון" : `חזרה ${r.reviewIndex - 1}`;
                        return `${label} (${tag})`;
                      });
                      try {
                        await navigator.clipboard.writeText(lines.join("\n"));
                        toast(`הועתקו ${lines.length} שורות שלא בוצעו`);
                      } catch { toast("ההעתקה נכשלה"); }
                    }}
                    title="העתק רק את אלו שלא בוצעו עדיין"
                    className="h-7 w-7 rounded-md border border-gold/40 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-gold transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5 text-amber-600" />
                  </button>
                  {/* Delete all */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`למחוק את כל ${dayShasReviews.length} הרשומות של היום? פעולה זו ניתנת לביטול דרך toast.`)) return;
                      const snapshot = [...dayShasReviews];
                      snapshot.forEach((r) => deleteShasReview(r.id));
                      toast(`נמחקו ${snapshot.length} רשומות`);
                    }}
                    title="מחק את כל הרשומות של היום"
                    className="h-7 w-7 rounded-md border border-destructive/40 hover:bg-destructive/10 flex items-center justify-center text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <h4 className="flex-1 w-full text-sm font-semibold flex items-center gap-1 justify-start">
                  לימוד / חזרות ש"ס ביום זה <Repeat className="h-4 w-4 text-gold" />
                </h4>
              </div>
              <div className="space-y-1.5">
                {dayShasReviews.map((r) => {
                  const isDoneToday = r.doneAt === dateKeyStr;
                  const isPlannedHere = r.dueDate === dateKeyStr;
                  const isOverdue = isPlannedHere && !r.doneAt && dateKeyStr! < (new Date().toISOString().slice(0,10));
                  const label = formatShasPosition(
                    r.masechta, r.daf, r.amud,
                    r.unit === "half" ? (r.half ?? 1) : null,
                  );
                  const tag = r.isInitial ? "לימוד ראשון" : `חזרה ${r.reviewIndex - 1}`;
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "rounded-lg border-2 p-2.5 transition-colors text-right",
                        isDoneToday
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : isOverdue
                            ? "border-destructive/50 bg-destructive/5"
                            : "border-gold/30 bg-card",
                      )}
                      dir="rtl"
                    >
                      <div className="flex items-start gap-2 flex-row-reverse">
                        <button
                          onClick={() => isDoneToday ? unmarkShasReviewDone(r.id) : markShasReviewDone(r.id, dateKeyStr!)}
                          className="h-6 w-6 flex items-center justify-center shrink-0 mt-0.5"
                          title={isDoneToday ? "בטל סימון ביצוע" : "סמן שביצעתי ביום זה"}
                        >
                          {isDoneToday ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(255,255,255)] border-[1.5px] border-[rgb(198,154,42)] shadow-sm">
                              <Check
                                className="h-3.5 w-3.5 text-[rgb(29,73,135)]"
                                strokeWidth={2.6}
                              />
                            </span>
                          ) : (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/35 bg-muted/70">
                              <Check className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.6} />
                            </span>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex w-full items-center gap-1.5 flex-wrap justify-start text-right">
                            <div className="text-sm font-semibold">{label}</div>
                            <Badge variant="outline" className="text-[10px] border-gold/40">{tag}</Badge>
                            {(() => {
                              const reps = repsForRow(r);
                              return reps > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-emerald-600/60 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                                  title={`חזרת ${reps} פעמים על דף זה (לא כולל לימוד ראשון)`}
                                >
                                  סה"כ {reps} חזרות
                                </Badge>
                              ) : null;
                            })()}
                            {isOverdue && <Badge variant="destructive" className="text-[10px]">באיחור</Badge>}
                            {!isPlannedHere && r.doneAt === dateKeyStr && (
                              <Badge className="text-[10px] bg-emerald-600 text-primary-foreground">בוצע ביום זה</Badge>
                            )}
                          </div>
                          {r.dueDate !== dateKeyStr && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              מתוזמן ל־{r.dueDate}
                            </div>
                          )}
                          {r.note && editingNoteId !== r.id && (
                            <div className="text-[11px] text-muted-foreground mt-1 italic">
                              📝 {r.note}
                            </div>
                          )}
                          {editingNoteId === r.id && (
                            <div className="mt-1.5 space-y-1">
                              <Textarea
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                className="border-2 border-gold/40 text-right text-xs min-h-[60px]"
                                placeholder="הערה לחזרה זו..."
                                dir="rtl"
                              />
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)} className="h-7 text-xs">
                                  ביטול
                                </Button>
                                <Button size="sm" onClick={() => { setShasReviewNote(r.id, noteDraft); setEditingNoteId(null); }} className="h-7 text-xs bg-gradient-navy text-primary-foreground">
                                  <Save className="h-3 w-3" /> שמור
                                </Button>
                              </div>
                            </div>
                          )}
                          {reschedulingId === r.id && (
                            <div className="mt-1.5 flex gap-1 items-center justify-end">
                              <Input
                                type="date" value={rescheduleDate}
                                onChange={(e) => setRescheduleDate(e.target.value)}
                                className="border-2 border-gold/40 text-right h-8 text-xs w-36"
                              />
                              <Button size="sm" variant="ghost" onClick={() => setReschedulingId(null)} className="h-7 text-xs">ביטול</Button>
                              <Button size="sm" onClick={() => { if (rescheduleDate) { rescheduleShasReview(r.id, rescheduleDate); setReschedulingId(null); } }} className="h-7 text-xs bg-gradient-navy text-primary-foreground">
                                <Save className="h-3 w-3" /> דחה
                              </Button>
                            </div>
                          )}
                          <div className="flex items-center gap-1 justify-end mt-1.5">
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => { setEditingNoteId(r.id); setNoteDraft(r.note ?? ""); }}
                              className="h-6 px-2 text-[10px]"
                              title="ערוך הערה"
                            >
                              <Pencil className="h-3 w-3" /> הערה
                            </Button>
                            {!r.isInitial && (
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => { setReschedulingId(r.id); setRescheduleDate(r.dueDate); }}
                                className="h-6 px-2 text-[10px]"
                                title="דחה ליום אחר"
                              >
                                <CalendarClock className="h-3 w-3" /> דחה
                              </Button>
                            )}
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => { if (confirm("למחוק רשומה זו?")) deleteShasReview(r.id); }}
                              className="h-6 px-2 text-[10px] text-destructive"
                              title="מחק רשומה"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                ניתן לסמן/לבטל ביצוע, להוסיף הערה, לדחות חזרה ליום אחר או למחוק.
              </p>
            </div>
          )}

          {/* Reviews list */}
          {dayLogs.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1 justify-end">
                חזרות שבוצעו <BookOpen className="h-4 w-4 text-gold" />
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {dayLogs
                  .slice()
                  .sort((a, b) => b.at - a.at)
                  .map((l) => {
                    const card = cardsById.get(l.cardId);
                    const time = new Date(l.at).toLocaleTimeString("he-IL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <div
                        key={l.id}
                        className="group flex items-start gap-2 rounded-md border border-gold/30 bg-card p-2"
                      >
                        <Badge
                          variant={l.correct ? "default" : "destructive"}
                          className="shrink-0 text-[10px]"
                        >
                          {l.correct ? "נכון" : "שגוי"}
                        </Badge>
                        <div className="flex-1 text-right min-w-0">
                          <div className="text-xs truncate">
                            {card?.question ?? "כרטיס נמחק"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {time} · {decksById.get(l.deckId) ?? "—"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("לבטל את סימון החזרה? הרישום יוסר מההיסטוריה.")) {
                              deleteReviewLog(l.id);
                              toast("הסימון בוטל");
                            }
                          }}
                          title="בטל סימון של חזרה זו"
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 h-6 w-6 rounded-md hover:bg-destructive/10 text-destructive flex items-center justify-center transition-all shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-2.5 text-right">
            <h4 className="w-full text-sm font-semibold text-right">
              <span className="inline-flex items-center gap-1">
                <NotebookPen className="h-4 w-4 text-gold" /> הערות יומיות
              </span>
            </h4>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="לדוגמה: היום סיימתי משנה ה' של פרק ב'..."
              className="w-full border-2 border-gold/40 text-right min-h-[100px]"
              dir="rtl"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={handleSaveNote}
                className="bg-gradient-navy text-primary-foreground rounded-xl"
              >
                <Save className="h-4 w-4" /> שמור
              </Button>
              {existingNote && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNote("");
                    if (dateKeyStr) setDayNote(dateKeyStr, "");
                    onOpenChange(false);
                  }}
                  className="text-destructive"
                >
                  <X className="h-4 w-4" /> מחק הערה
                </Button>
              )}
            </div>
          </div>

          {dayLogs.length === 0 && manualGoals.length === 0 && !existingNote && dayShasReviews.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-2">
              אין פעילות ביום זה. אפשר עדיין להוסיף הערה כדי לתעד.
            </div>
          )}
        </div>
      </DialogContent>

      {/* Subject picker — Shas browser */}
      <SubjectPickerDialog
        open={subjectPickerOpen}
        onOpenChange={setSubjectPickerOpen}
        onSelect={(subject, meta) => { setAddSubject(subject); setSelectedMeta(meta); setShowAddForm(true); }}
        planMasechtos={state.shasPlan?.selectedMasechtos ?? []}
      />
    </Dialog>
  );
}
