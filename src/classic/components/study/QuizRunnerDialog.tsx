import { useEffect, useMemo, useRef, useState } from "react";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Check, X, ChevronLeft, Trophy, RotateCcw } from "lucide-react";
import { useStudy } from "@/lib/study/store";
import { cn } from "@/lib/utils";
import type { QuizPlan, Card, PracticeResultAnswer, QuizPerSessionMode } from "@/lib/study/types";
import { buildSession, filterCardsForPlan } from "@/lib/study/quiz";
import { ShasReviewScheduleDialog, isShasDialogSkipped } from "./ShasReviewScheduleDialog";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plan: QuizPlan | null;
}

export function QuizRunnerDialog({ open, onOpenChange, plan }: Props) {
  const { state, addQuizAttempt, updateQuizAttempt, updateQuizPlan, setReviewIntervals, addPracticeResult } = useStudy();

  const [mode, setMode] = useState<"setup" | "running" | "done">("setup");
  const [chosenMode, setChosenMode] = useState<QuizPerSessionMode>("fixed");
  const [chosenCount, setChosenCount] = useState<number>(10);
  const [session, setSession] = useState<Card[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [questionTimes, setQuestionTimes] = useState<number[]>([]);
  const [answerSnapshots, setAnswerSnapshots] = useState<PracticeResultAnswer[]>([]);
  const questionStartedAtRef = useRef<number>(0);
  const [liveSeconds, setLiveSeconds] = useState(0);

  // per-question state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [openAnswer, setOpenAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [revealedJudgement, setRevealedJudgement] = useState<"correct" | "wrong" | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  useEffect(() => {
    if (open && plan) {
      setMode("setup");
      setSession([]); setCurrentIdx(0); setCorrectCount(0); setWrongIds([]); setAttemptId(null);
      setQuestionTimes([]); setLiveSeconds(0);
      setAnswerSnapshots([]);
      setSelectedOption(null); setOpenAnswer(""); setRevealed(false); setRevealedJudgement(null);
      // ברירת מחדל לפי תוכנית
      const modes = plan.perSession.modes;
      const first = modes[0] ?? "fixed";
      setChosenMode(first);
      if (first === "fixed") setChosenCount(plan.perSession.fixedCount ?? 10);
      else if (first === "random") {
        const min = plan.perSession.randomMin ?? 5;
        const max = Math.max(min, plan.perSession.randomMax ?? 15);
        setChosenCount(min + Math.floor(Math.random() * (max - min + 1)));
      } else {
        setChosenCount(0); // allDue
      }
    }
  }, [open, plan]);

  const availableCount = useMemo(() => {
    if (!plan) return 0;
    return filterCardsForPlan(state.cards, plan).length;
  }, [plan, state.cards]);

  const startSession = () => {
    if (!plan) return;
    const target = chosenMode === "allDue" ? availableCount : Math.max(1, Math.min(chosenCount, availableCount));
    const built = buildSession(state.cards, plan, target, state.quizAttempts ?? []);
    if (!built.length) {
      toast({ title: "אין שאלות זמינות", description: "אין כרטיסיות שמתאימות לתוכנית הזו." });
      return;
    }
    const now = Date.now();
    const att = addQuizAttempt({
      planId: plan.id,
      startedAt: now,
      finishedAt: null,
      total: built.length,
      correct: 0,
      wrongCardIds: [],
      score: 0,
    });
    setAttemptId(att.id);
    setStartedAt(now);
    setSession(built);
    setCurrentIdx(0);
    setCorrectCount(0);
    setWrongIds([]);
    setQuestionTimes([]);
    setAnswerSnapshots([]);
    questionStartedAtRef.current = Date.now();
    setLiveSeconds(0);
    setMode("running");
  };

  // Live stopwatch — tick every second while running
  useEffect(() => {
    if (mode !== "running") return;
    questionStartedAtRef.current = Date.now();
    setLiveSeconds(0);
    const id = window.setInterval(() => {
      setLiveSeconds(Math.floor((Date.now() - questionStartedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [mode, currentIdx]); // reset on each new question

  const current = session[currentIdx] ?? null;

  const submitAnswer = () => {
    if (!current) return;
    let correct = false;
    if (current.type === "multiple") {
      if (selectedOption === null) return;
      correct = current.correctIndices.includes(selectedOption);
    } else if (current.type === "boolean") {
      if (selectedOption === null) return;
      // 0 = "אמת" (true) / 1 = "שקר" (false)
      const userAnswer = selectedOption === 0;
      correct = userAnswer === current.correct;
    } else if (current.type === "combo") {
      if (Array.isArray(current.options) && current.options.length && selectedOption !== null) {
        correct = (current.correctIndices ?? []).includes(selectedOption);
      } else {
        // open: לא יכולים לבדוק אוטומטית — נחשב כתשובה שצריך לסמן ידנית
        setRevealed(true);
        setRevealedJudgement(null);
        return;
      }
    } else if (current.type === "flashcard") {
      // open — נציג תשובה ונבקש סימון ידני
      setRevealed(true);
      setRevealedJudgement(null);
      return;
    }
    setRevealed(true);
    setRevealedJudgement(correct ? "correct" : "wrong");
  };

  const recordAndNext = (judgedCorrect: boolean) => {
    if (!current || !plan) return;
    const elapsed = Date.now() - questionStartedAtRef.current;
    const newTimes = [...questionTimes, elapsed];
    const answeredAt = Date.now();
    const answerSnapshot: PracticeResultAnswer = {
      id: `${attemptId ?? "quiz"}:${current.id}`,
      cardId: current.id,
      question: current.question,
      correct: judgedCorrect,
      quality: judgedCorrect ? 5 : 1,
      durationMs: elapsed,
      answeredAt,
      categoryPath: (current.tags ?? []).filter((tag) => tag.startsWith("cat:")).map((tag) => tag.slice(4)),
    };
    const finalAnswers = [...answerSnapshots.filter((answer) => answer.cardId !== current.id), answerSnapshot];
    setAnswerSnapshots(finalAnswers);
    setQuestionTimes(newTimes);
    if (judgedCorrect) setCorrectCount((c) => c + 1);
    else setWrongIds((arr) => [...arr, current.id]);

    const isLast = currentIdx === session.length - 1;
    if (isLast) {
      const total = session.length;
      const finalCorrect = correctCount + (judgedCorrect ? 1 : 0);
      const finalWrong = judgedCorrect ? wrongIds : [...wrongIds, current.id];
      const score = total ? Math.round((finalCorrect / total) * 100) : 0;
      if (attemptId) {
        updateQuizAttempt(attemptId, {
          finishedAt: Date.now(),
          correct: finalCorrect,
          wrongCardIds: finalWrong,
          score,
          questionTimes: newTimes,
        });
        addPracticeResult({
          id: attemptId,
          kind: "exam",
          sourceExamId: plan.id,
          sourceExamName: plan.name,
          startedAt,
          completedAt: answeredAt,
          total,
          correct: finalCorrect,
          score,
          durationMs: newTimes.reduce((sum, value) => sum + value, 0),
          questionIds: session.map((card) => card.id),
          answers: finalAnswers,
          completed: true,
          updatedAt: answeredAt,
        });
      }
      setMode("done");
      if (!isShasDialogSkipped()) {
        setScheduleDialogOpen(true);
      }
    } else {
      setCurrentIdx(currentIdx + 1);
      setSelectedOption(null); setOpenAnswer(""); setRevealed(false); setRevealedJudgement(null);
    }
  };

  const closeAndAbort = () => {
    if (mode === "running" && attemptId) {
      updateQuizAttempt(attemptId, {
        finishedAt: Date.now(),
        correct: correctCount,
        wrongCardIds: wrongIds,
        score: session.length ? Math.round((correctCount / session.length) * 100) : 0,
      });
    }
    onOpenChange(false);
  };

  if (!plan) return null;

  return (
    <>
    <FloatingPanel
      open={open}
      onOpenChange={(o) => { if (!o) closeAndAbort(); else onOpenChange(o); }}
      initialWidth={640}
      initialHeight={580}
      minWidth={400}
      minHeight={360}
      title={plan.name}
    >
      <div className="text-right text-sm text-muted-foreground mb-3">
        {mode === "setup" && `יש ${availableCount} שאלות זמינות בתוכנית.`}
        {mode === "running" && (
        <span className="flex items-center gap-2">
          <span>שאלה {currentIdx + 1} מתוך {session.length}</span>
          <span className="font-mono tabular-nums text-gold font-semibold">⏱ {String(Math.floor(liveSeconds / 60)).padStart(2, "0")}:{String(liveSeconds % 60).padStart(2, "0")}</span>
        </span>
      )}
        {mode === "done" && "סיום מבחן"}
      </div>

        {mode === "setup" && (
          <div className="space-y-3">
            <div className="text-sm">בחר כמות שאלות למבחן:</div>
            <div className="flex flex-wrap gap-2">
              {plan.perSession.modes.includes("fixed") && (
                <button
                  type="button" onClick={() => { setChosenMode("fixed"); setChosenCount(plan.perSession.fixedCount ?? 10); }}
                  className={cn(
                    "rounded-full border-2 px-3 py-1 text-sm",
                    chosenMode === "fixed" ? "bg-gradient-navy text-primary-foreground border-navy" : "border-gold/40",
                  )}
                >קבוע ({plan.perSession.fixedCount})</button>
              )}
              {plan.perSession.modes.includes("random") && (
                <button
                  type="button"
                  onClick={() => {
                    setChosenMode("random");
                    const min = plan.perSession.randomMin ?? 5;
                    const max = Math.max(min, plan.perSession.randomMax ?? 15);
                    setChosenCount(min + Math.floor(Math.random() * (max - min + 1)));
                  }}
                  className={cn(
                    "rounded-full border-2 px-3 py-1 text-sm",
                    chosenMode === "random" ? "bg-gradient-navy text-primary-foreground border-navy" : "border-gold/40",
                  )}
                >אקראי ({plan.perSession.randomMin}-{plan.perSession.randomMax}) → {chosenMode === "random" ? chosenCount : "?"}</button>
              )}
              {plan.perSession.modes.includes("allDue") && (
                <button
                  type="button" onClick={() => { setChosenMode("allDue"); setChosenCount(availableCount); }}
                  className={cn(
                    "rounded-full border-2 px-3 py-1 text-sm",
                    chosenMode === "allDue" ? "bg-gradient-navy text-primary-foreground border-navy" : "border-gold/40",
                  )}
                >כולן ({availableCount})</button>
              )}
            </div>
            {chosenMode !== "allDue" && (
              <div className="flex items-center gap-2 text-sm">
                <span>כמות:</span>
                <input type="number" min={1} max={availableCount}
                  value={chosenCount} onChange={(e) => setChosenCount(parseInt(e.target.value || "0", 10) || 1)}
                  className="h-8 w-20 rounded-md border-2 border-gold/40 px-2"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
              <Button onClick={startSession} disabled={!availableCount} className="bg-gradient-navy text-primary-foreground">
                התחל מבחן
              </Button>
            </div>
          </div>
        )}

        {mode === "running" && current && (
          <div className="space-y-3">
            <div className="rounded-lg bg-secondary/40 p-3 text-sm font-semibold leading-relaxed whitespace-pre-wrap">
              {current.question}
            </div>

            {current.type === "multiple" && (
              <div className="space-y-1.5">
                {current.options.map((opt, i) => (
                  <button
                    key={i} type="button" disabled={revealed}
                    onClick={() => setSelectedOption(i)}
                    className={cn(
                      "w-full text-right rounded-md border-2 px-3 py-2 text-sm transition-colors",
                      revealed && current.correctIndices.includes(i) && "border-emerald-500 bg-emerald-500/10",
                      revealed && selectedOption === i && !current.correctIndices.includes(i) && "border-destructive bg-destructive/10",
                      !revealed && selectedOption === i && "border-navy bg-navy/10",
                      !revealed && selectedOption !== i && "border-gold/40 hover:border-gold/70",
                    )}
                  >{opt}</button>
                ))}
              </div>
            )}

            {current.type === "boolean" && (
              <div className="flex gap-2">
                {["אמת", "שקר"].map((label, i) => (
                  <button
                    key={i} type="button" disabled={revealed}
                    onClick={() => setSelectedOption(i)}
                    className={cn(
                      "flex-1 rounded-md border-2 px-3 py-2 text-sm",
                      revealed && ((i === 0 && current.correct) || (i === 1 && !current.correct)) && "border-emerald-500 bg-emerald-500/10",
                      revealed && selectedOption === i && !((i === 0 && current.correct) || (i === 1 && !current.correct)) && "border-destructive bg-destructive/10",
                      !revealed && selectedOption === i && "border-navy bg-navy/10",
                      !revealed && selectedOption !== i && "border-gold/40",
                    )}
                  >{label}</button>
                ))}
              </div>
            )}

            {current.type === "combo" && Array.isArray(current.options) && current.options.length > 0 && (
              <div className="space-y-1.5">
                {current.options.map((opt, i) => {
                  const isCorrect = (current.correctIndices ?? []).includes(i);
                  return (
                    <button
                      key={i} type="button" disabled={revealed}
                      onClick={() => setSelectedOption(i)}
                      className={cn(
                        "w-full text-right rounded-md border-2 px-3 py-2 text-sm",
                        revealed && isCorrect && "border-emerald-500 bg-emerald-500/10",
                        revealed && selectedOption === i && !isCorrect && "border-destructive bg-destructive/10",
                        !revealed && selectedOption === i && "border-navy bg-navy/10",
                        !revealed && selectedOption !== i && "border-gold/40",
                      )}
                    >{opt}</button>
                  );
                })}
              </div>
            )}

            {(current.type === "flashcard" || (current.type === "combo" && (!current.options || !current.options.length))) && (
              <Textarea
                placeholder="התשובה שלי..."
                value={openAnswer}
                onChange={(e) => setOpenAnswer(e.target.value)}
                disabled={revealed}
                className="min-h-[80px]"
              />
            )}

            {revealed && (current.type === "flashcard" || current.type === "combo") && (
              <div className="rounded-md border-2 border-gold/40 bg-card p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">התשובה הנכונה:</div>
                <div className="whitespace-pre-wrap">
                  {(current.type === "flashcard" ? current.answer : (current.answer ?? "—"))}
                </div>
                {current.type === "combo" && current.explanation && (
                  <div className="text-xs text-muted-foreground mt-1">{current.explanation}</div>
                )}
              </div>
            )}

            {!revealed ? (
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={closeAndAbort}>סיים מוקדם</Button>
                <Button onClick={submitAnswer} className="bg-gradient-navy text-primary-foreground">
                  בדוק תשובה
                </Button>
              </div>
            ) : revealedJudgement ? (
              <div className="flex justify-between gap-2">
                <Badge variant={revealedJudgement === "correct" ? "default" : "destructive"} className="self-center">
                  {revealedJudgement === "correct" ? "נכון!" : "טעות"}
                </Badge>
                <Button onClick={() => recordAndNext(revealedJudgement === "correct")}
                  className="bg-gradient-navy text-primary-foreground gap-1">
                  הבא <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex justify-between gap-2">
                <span className="text-xs text-muted-foreground self-center">סמן ידנית:</span>
                <div className="flex gap-1">
                  <Button onClick={() => recordAndNext(false)} variant="outline" className="border-destructive text-destructive gap-1">
                    <X className="h-4 w-4" /> לא ידעתי
                  </Button>
                  <Button onClick={() => recordAndNext(true)} className="bg-emerald-600 text-white gap-1">
                    <Check className="h-4 w-4" /> ידעתי
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>נכונות: {correctCount}/{currentIdx + (revealed ? 1 : 0)}</span>
              <span>טעויות: {wrongIds.length}</span>
            </div>
          </div>
        )}

        {mode === "done" && (() => {
          const totalSec = Math.round((Date.now() - startedAt) / 1000);
          const avgMs = questionTimes.length ? Math.round(questionTimes.reduce((a, b) => a + b, 0) / questionTimes.length) : 0;
          const avgSec = Math.round(avgMs / 1000);
          return (
          <div className="space-y-3">
            <div className="text-center">
              <Trophy className="h-10 w-10 mx-auto text-gold mb-2" />
              <div className="text-2xl font-bold">
                {correctCount}/{session.length}
                <span className="text-base text-muted-foreground mr-2">
                  ({session.length ? Math.round((correctCount / session.length) * 100) : 0}%)
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-3">
                <span>סה"כ: {Math.floor(totalSec / 60)}:{String(totalSec % 60).padStart(2, "0")}</span>
                {avgSec > 0 && <span className="text-gold font-semibold">ממוצע לשאלה: {avgSec} שנ'</span>}
              </div>
              {wrongIds.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {wrongIds.length} שאלות לא ידעתי
                </div>
              )}
            </div>

            {/* Per-question breakdown */}
            {questionTimes.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gold/30 bg-card/50 divide-y divide-gold/15 text-xs">
                {session.map((card, i) => {
                  const sec = Math.round((questionTimes[i] ?? 0) / 1000);
                  const wasWrong = wrongIds.includes(card.id);
                  return (
                    <div key={card.id} className="flex items-start justify-between gap-2 px-2.5 py-1.5">
                      <span className={cn("flex-1 text-right leading-tight line-clamp-2", wasWrong ? "text-destructive" : "text-foreground")}>
                        {i + 1}. {card.question}
                      </span>
                      <span className={cn("shrink-0 font-mono tabular-nums font-semibold whitespace-nowrap",
                        sec <= 5 ? "text-emerald-500" : sec <= 15 ? "text-gold" : "text-orange-500"
                      )}>
                        {sec}שנ'
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-center gap-2 pt-1">
              <Button onClick={() => onOpenChange(false)}>סיום</Button>
              <Button variant="outline" onClick={() => { setMode("setup"); }} className="gap-1 border-gold/40">
                <RotateCcw className="h-4 w-4" /> מבחן נוסף
              </Button>
            </div>
          </div>
          );
        })()}
    </FloatingPanel>

    {plan && (
      <ShasReviewScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        positionLabel={`${plan.name} — מבחן הבא`}
        defaultDays={state.reviewIntervals?.length ? state.reviewIntervals : [1, 3, 7, 14, 30]}
        onSaveAsDefault={(days) => setReviewIntervals(days)}
        onConfirm={(days) => {
          if (!days.length) return;
          // הוסף תאריכים עתידיים ל-bigExamDates של התוכנית (מיון ייחודי)
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const newDates = days.map((d) => {
            const dt = new Date(today); dt.setDate(dt.getDate() + d);
            return dt.toISOString().slice(0, 10); // YYYY-MM-DD
          });
          const merged = Array.from(new Set([...(plan.frequency.bigExamDates ?? []), ...newDates])).sort();
          updateQuizPlan(plan.id, {
            frequency: { ...plan.frequency, bigExamDates: merged },
          });
          toast({ title: "תוזמנו תזכורות", description: `${days.length} תאריכים נוספו לתוכנית.` });
        }}
      />
    )}
  </>
  );
}
