// עמוד הבית בפריסה המקורית — כמו לשונית "כללי" בעמוד הראשי של האתר הבסיסי (src/pages/Index.tsx):
// הכותרת, ורשת הרכיבים (WidgetGrid) עם כל הרכיבים שלה. הרכיבים הקטנים (פומודורו, מעקבים יומיים, ציטוט,
// שעון מעורר, מאמן יומי) הועתקו מאותו קובץ כמו שהם.
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  Sun, Target, Timer, ListChecks, Play, Pause, RotateCcw, Plus, Sparkles, ChevronLeft, Check, X, Quote, Sliders,
} from "lucide-react";
import { WidgetGrid } from "@/components/study/WidgetGrid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import ClassicShell from "../ClassicShell";

const WeeklySummary = lazy(() => import("@/components/study/WeeklySummary").then(m => ({ default: m.WeeklySummary })));
const GoalsManager = lazy(() => import("@/components/study/GoalsManager").then(m => ({ default: m.GoalsManager })));
const StudyPlansCard = lazy(() => import("@/components/study/StudyPlansCard").then(m => ({ default: m.StudyPlansCard })));
const QuizPlansCard = lazy(() => import("@/components/study/QuizPlansCard").then(m => ({ default: m.QuizPlansCard })));
const TodayReviewsCard = lazy(() => import("@/components/study/TodayReviewsCard").then(m => ({ default: m.TodayReviewsCard })));
const InsightsCard = lazy(() => import("@/components/study/InsightsCard").then(m => ({ default: m.InsightsCard })));
const TaskCard = lazy(() => import("@/components/study/TaskCard").then(m => ({ default: m.TaskCard })));
const HeatmapPanel = lazy(() => import("@/components/study/HeatmapPanel").then(m => ({ default: m.HeatmapPanel })));
const ReviewCalendar = lazy(() => import("@/components/study/ReviewCalendar").then(m => ({ default: m.ReviewCalendar })));

const QUOTES = [
  { text: "הבחירה שלך, לא המזל שלך, קובעת את גורלך", author: "ג'ין ניד'" },
  { text: "פוקוס הוא היכולת לומר 'לא' לאלף דברים טובים", author: "סטיב ג'ובס" },
  { text: "משמעת היא הגשר בין מטרות להישגים", author: "ג'ים רוהן" },
  { text: "הצלחה היא סך כל מאמצים קטנים, מיום ליום", author: "רוברט קולייר" },
];

const PomodoroCard = () => {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [emboss, setEmboss] = useState(40); // 0-100
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    }
    return () => { if (ref.current) window.clearInterval(ref.current); };
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const progress = 1 - seconds / (25 * 60);

  // Scale shadow intensity with emboss (0 = flat, 100 = strong cornice)
  const e = emboss / 100;
  const embossShadow = [
    `inset 0 ${1 + e * 2}px ${1 + e * 2}px hsl(0 0% 100% / ${0.6 + e * 0.4})`,
    `inset 0 -${1 + e * 2}px ${1 + e * 3}px hsl(var(--gold) / ${0.15 + e * 0.45})`,
    `inset 0 0 0 1px hsl(var(--gold) / ${0.1 + e * 0.3})`,
    `0 ${1 + e * 3}px ${2 + e * 6}px hsl(var(--navy) / ${0.05 + e * 0.15})`,
    `0 ${4 + e * 14}px ${12 + e * 24}px -${8 + e * 4}px hsl(var(--navy) / ${0.1 + e * 0.25})`,
  ].join(", ");

  return (
    <Card className="gold-frame p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold">שעון פומודורו</h3>
        <Popover>
          <PopoverTrigger asChild>
            <button className="gold-icon-circle h-9 w-9" aria-label="עוצמת בליטה">
              <Sliders className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 gold-frame" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{emboss}%</span>
                <h4 className="text-sm font-semibold text-foreground">עוצמת בליטה</h4>
              </div>
              <Slider
                value={[emboss]}
                onValueChange={(v) => setEmboss(v[0])}
                min={0}
                max={100}
                step={1}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div
        className="relative mx-auto h-44 w-44 rounded-full bg-card"
        style={{ boxShadow: embossShadow }}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--gold) / 0.18)" strokeWidth="1.5" />
          <circle
            cx="50" cy="50" r="44" fill="none"
            stroke="hsl(var(--gold))" strokeWidth="2" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress)}`}
            className="transition-all duration-1000"
            style={{ filter: "drop-shadow(0 0 2px hsl(var(--gold) / 0.4))" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-4xl font-bold text-foreground">{mm}:{ss}</div>
          <div className="text-xs text-muted-foreground mt-1">מחזור פוקוס</div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 mt-5">
        <Button
          onClick={() => setRunning((r) => !r)}
          className="bg-gradient-navy text-primary-foreground hover:opacity-90 rounded-full px-6 shadow-elegant"
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? "השהה" : "התחל"}
        </Button>
        <Button
          variant="outline"
          onClick={() => { setRunning(false); setSeconds(25 * 60); }}
          className="rounded-full border-2 border-gold text-navy hover:bg-secondary"
        >
          <RotateCcw className="h-4 w-4" />
          איפוס
        </Button>
      </div>
    </Card>
  );
};

type Habit = { id: string; label: string; icon: typeof Sun; done: boolean };

const DailyTrackers = () => {
  const [habits, setHabits] = useState<Habit[]>([
    { id: "1", label: "קימה", icon: Sun, done: false },
    { id: "2", label: "הרגלים", icon: Target, done: false },
    { id: "3", label: "יעדים", icon: ListChecks, done: false },
    { id: "4", label: "שינה", icon: Timer, done: false },
  ]);
  const completed = habits.filter((h) => h.done).length;
  const allDone = completed === habits.length;

  return (
    <Card className="gold-frame p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="gold-icon-circle"><Check className="h-4 w-4" /></span>
          <h3 className="font-display text-lg font-semibold">סטטוס מעקבים יומי</h3>
        </div>
        <span className="text-sm font-semibold text-muted-foreground">{completed}/{habits.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {habits.map((h) => {
          const Icon = h.icon;
          return (
            <div
              key={h.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 transition-all",
                h.done ? "border-gold bg-secondary" : "border-gold/40 bg-card",
              )}
            >
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setHabits((arr) => arr.map((x) => x.id === h.id ? { ...x, done: false } : x))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="בטל"
                >
                  <X className="h-4 w-4" />
                </button>
                <span className="gold-icon-circle h-7 w-7"><Icon className="h-3.5 w-3.5" /></span>
              </div>
              <button
                onClick={() => setHabits((arr) => arr.map((x) => x.id === h.id ? { ...x, done: !x.done } : x))}
                className="flex-1 text-right text-sm font-medium text-foreground"
              >
                {h.label}
              </button>
            </div>
          );
        })}
      </div>
      <Button
        onClick={() => setHabits((arr) => arr.map((x) => ({ ...x, done: true })))}
        disabled={allDone}
        className="w-full mt-4 bg-gradient-navy text-primary-foreground hover:opacity-90 rounded-xl py-6 shadow-elegant"
      >
        <Check className="h-4 w-4" />
        סמן הכל ({habits.length})
      </Button>
    </Card>
  );
};

const QuoteCard = () => {
  const [idx, setIdx] = useState(0);
  const q = QUOTES[idx];
  return (
    <Card className="gold-frame p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setIdx((i) => (i + 1) % QUOTES.length)}
            className="gold-icon-circle h-8 w-8" aria-label="הבא">
            <Play className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setIdx((i) => (i - 1 + QUOTES.length) % QUOTES.length)}
            className="gold-icon-circle h-8 w-8" aria-label="קודם">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-semibold">ציטוט מעורר השראה</h3>
          <span className="gold-icon-circle"><Quote className="h-4 w-4" /></span>
        </div>
      </div>
      <div className="flex items-start gap-2 px-2">
        <button className="gold-icon-circle h-8 w-8 mt-2" aria-label="הבא">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 text-center py-4">
          <p className="font-display text-xl font-semibold text-foreground leading-relaxed">"{q.text}"</p>
          <p className="text-sm text-muted-foreground mt-3">— {q.author}</p>
        </div>
      </div>
    </Card>
  );
};

const NextAlarmCard = () => (
  <Card className="gold-frame p-6 animate-fade-in">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="gold-icon-circle"><Timer className="h-4 w-4" /></span>
        <h3 className="font-display text-lg font-semibold">שעון מעורר הבא</h3>
        <span className="text-xs text-muted-foreground">(1/4)</span>
      </div>
      <Button size="icon" className="rounded-full bg-gradient-navy text-primary-foreground h-10 w-10 shadow-elegant">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
    <div className="text-center py-6 text-muted-foreground text-sm">לא הוגדר שעון מעורר</div>
  </Card>
);

const AICoachCard = () => (
  <Card className="gold-frame p-6 animate-fade-in">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="gold-icon-circle"><Sparkles className="h-4 w-4" /></span>
        <h3 className="font-display text-lg font-semibold">מאמן יומי</h3>
      </div>
      <button className="gold-icon-circle h-8 w-8"><X className="h-4 w-4" /></button>
    </div>
    <div className="rounded-xl bg-gradient-navy p-5 text-primary-foreground">
      <p className="text-sm leading-relaxed">
        בוקר טוב ✨ היום זה היום לעשות צעד קטן בכיוון הנכון. בחר משימה אחת חשובה וצא לדרך.
      </p>
    </div>
  </Card>
);

const StaticLazyPanelPreview = ({ compact = false }: { compact?: boolean }) => (
  <Card className={cn("gold-frame w-full bg-card/95", compact ? "p-3" : "p-6")}>
    <div className={cn("rounded-xl border-2 border-gold/25 bg-secondary/25", compact ? "p-2" : "p-4")}>
      <div className="h-4 w-44 rounded-full bg-muted/70 mx-auto mb-3" />
      {!compact && (
        <>
          <div className="h-3 w-full rounded-full bg-muted/60 mb-2" />
          <div className="h-3 w-10/12 rounded-full bg-muted/60 mb-2" />
          <div className="h-3 w-8/12 rounded-full bg-muted/60" />
        </>
      )}
      {compact && <div className="h-3 w-8/12 rounded-full bg-muted/60 mx-auto" />}
    </div>
  </Card>
);

export default function ClassicHome() {
  const isMobile = useIsMobile();
  return (
    <ClassicShell>
      <div className="space-y-3">
            <div className="text-center space-y-2 animate-fade-in">
              {!isMobile && <p className="font-display text-5xl lg:text-7xl font-bold text-gold leading-tight">למען תהיה תורת ה' בפיך</p>}
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-semibold text-foreground">מערכת לימוד וחזרות</h1>
              <p className="text-muted-foreground text-sm sm:text-base">עקוב אחר ההתקדמות שלך וקבל תובנות מתקדמות</p>
            </div>
        <Suspense fallback={<StaticLazyPanelPreview />}>
                    <WidgetGrid
                      tabId="overview"
                      widgetMap={{
                        "weekly-summary":  <WeeklySummary />,
                        "study-plans":     <StudyPlansCard />,
                        "quiz-plans":      <QuizPlansCard />,
                        "today-reviews":   <TodayReviewsCard />,
                        "insights":        <InsightsCard />,
                        "goals-manager":   <GoalsManager />,
                        "daily-trackers":  <DailyTrackers />,
                        "quote-card":      <QuoteCard />,
                        "ai-coach":        <AICoachCard />,
                        "next-alarm":      <NextAlarmCard />,
                        "pomodoro":        <PomodoroCard />,
                        "task-card": <TaskCard />,
                        "heatmap":         <HeatmapPanel days={35} />,
                        "review-calendar": <ReviewCalendar />,
                      }}
                    />
        </Suspense>
      </div>
    </ClassicShell>
  );
}
