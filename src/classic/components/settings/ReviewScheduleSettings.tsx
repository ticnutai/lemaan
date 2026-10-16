import { useState, useMemo, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Plus, Save, Repeat, BookOpen, LayoutList, Star, Trash2, Pencil, Check, Zap, Palette } from "lucide-react";
import { useStudy } from "@/lib/study/store";
import { toast } from "sonner";

// ── Built-in presets ──────────────────────────────────────────────────────────
const BUILTIN_PRESETS = [
  {
    id: "easy",
    name: "קל",
    emoji: "🌱",
    description: "3 חזרות — מתאים למי שלומד לאט",
    shasIntervals: [1, 7, 30],
    planIntervals: [1, 7, 30],
  },
  {
    id: "medium",
    name: "בינוני",
    emoji: "⭐",
    description: "5 חזרות — ברירת המחדל המומלצת",
    shasIntervals: [1, 3, 7, 14, 30],
    planIntervals: [1, 7, 30, 90],
  },
  {
    id: "intensive",
    name: "אינטנסיבי",
    emoji: "🔥",
    description: "7 חזרות — לשינון עמוק",
    shasIntervals: [1, 2, 4, 7, 14, 30, 90],
    planIntervals: [1, 3, 7, 30, 90],
  },
] as const;

// ── Custom preset storage ─────────────────────────────────────────────────────
export type CustomPreset = {
  id: string;
  name: string;
  shasIntervals: number[];
  planIntervals: number[];
};

const PRESETS_KEY = "srs-custom-presets";

function loadCustomPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is CustomPreset =>
        p &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        Array.isArray(p.shasIntervals) &&
        Array.isArray(p.planIntervals),
    );
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: CustomPreset[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* ignore storage errors */
  }
}

// ── Timeline visualization ────────────────────────────────────────────────────
function ReviewTimeline({ intervals }: { intervals: number[] }) {
  const sorted = useMemo(() => [...intervals].sort((a, b) => a - b), [intervals]);
  if (sorted.length === 0) return null;
  const max = sorted[sorted.length - 1];

  return (
    <div className="space-y-1" aria-hidden="true">
      <div className="text-[10px] text-muted-foreground text-right">ציר זמן (ימים מיום הלימוד)</div>
      <div className="relative h-10 select-none">
        {/* baseline */}
        <div className="absolute top-[18px] left-3 right-3 h-0.5 bg-gold/30 rounded-full" />
        {/* day-0 dot (emerald = initial study) */}
        <div
          className="absolute top-[12px] left-3 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-background shadow"
          title="יום לימוד"
        />
        <span className="absolute top-[28px] left-3 -translate-x-1/2 text-[9px] text-emerald-600 font-semibold">0</span>
        {/* review dots */}
        {sorted.map((day) => {
          const pct = max === 0 ? 100 : (day / max) * 100;
          const leftPx = `calc(12px + ${pct}% * (100% - 24px) / 100%)`;
          return (
            <div key={day} className="absolute top-[12px]" style={{ left: leftPx }}>
              <div
                className="w-3.5 h-3.5 rounded-full bg-gold border-2 border-background shadow -translate-x-1/2"
                title={`יום ${day}`}
              />
              <span className="absolute top-[16px] left-0 -translate-x-1/2 text-[9px] text-muted-foreground whitespace-nowrap font-medium">
                {day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Interval editor (badge chips + add field) ─────────────────────────────────
function IntervalEditor({
  intervals,
  onChange,
}: {
  intervals: number[];
  onChange: (next: number[]) => void;
}) {
  const [addInput, setAddInput] = useState("");
  const sorted = useMemo(() => [...intervals].sort((a, b) => a - b), [intervals]);

  const remove = useCallback(
    (day: number) => onChange(intervals.filter((d) => d !== day)),
    [intervals, onChange],
  );

  const add = useCallback(() => {
    const days = addInput
      .split(/[,\s]+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0 && !intervals.includes(n));
    if (days.length === 0) {
      setAddInput("");
      return;
    }
    onChange([...intervals, ...days]);
    setAddInput("");
  }, [addInput, intervals, onChange]);

  return (
    <div className="space-y-2">
      {/* Badge chips */}
      <div className="flex flex-wrap gap-1.5 min-h-[44px] p-2.5 rounded-xl border-2 border-gold/30 bg-card/60">
        {sorted.map((day) => (
          <span
            key={day}
            className="inline-flex items-center gap-1 bg-gold/15 border border-gold/50 text-foreground text-xs font-semibold px-2.5 py-1 rounded-lg"
          >
            יום {day}
            <button
              type="button"
              onClick={() => remove(day)}
              className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
              title={`הסר יום ${day}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {sorted.length === 0 && (
          <span className="text-[11px] text-muted-foreground self-center px-1">
            אין מרווחים — הוסף למטה
          </span>
        )}
      </div>

      {/* Add input */}
      <div className="flex items-center gap-2" dir="rtl">
        <Button
          type="button"
          size="sm"
          onClick={add}
          className="bg-gradient-navy text-primary-foreground rounded-lg h-8 px-3 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          הוסף
        </Button>
        <Input
          value={addInput}
          onChange={(e) => setAddInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
          placeholder="לדוגמה: 21 או 21, 60, 90"
          className="border-2 border-gold/40 text-right h-8 text-sm"
          dir="ltr"
        />
      </div>

      {/* Timeline */}
      <ReviewTimeline intervals={sorted} />
    </div>
  );
}

// ── Preset card ───────────────────────────────────────────────────────────────
function PresetCard({
  name,
  description,
  emoji,
  shasIntervals,
  planIntervals,
  onApply,
  onDelete,
  editable = false,
}: {
  name: string;
  description?: string;
  emoji?: string;
  shasIntervals: number[];
  planIntervals: number[];
  onApply: () => void;
  onDelete?: () => void;
  editable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border-2 border-gold/30 p-3 hover:border-gold/60 transition-colors">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onApply}
          className="bg-gradient-navy text-primary-foreground rounded-lg h-7 text-xs px-3 shrink-0"
        >
          החל
        </Button>
        {editable && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="מחק תבנית"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="text-right min-w-0">
        <div className="font-semibold text-sm flex items-center gap-1.5 justify-end">
          {emoji && <span className="text-base leading-none">{emoji}</span>}
          {name}
        </div>
        {description && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{description}</div>
        )}
        <div className="text-[10px] text-muted-foreground mt-0.5">
          ש"ס: <span className="text-foreground">{shasIntervals.join(", ")}</span>
          {" · "}
          תוכניות: <span className="text-foreground">{planIntervals.join(", ")}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────
export function ReviewScheduleSettings() {
  const { state, setReviewIntervals, setPlanReviewIntervals, setUiPref } = useStudy();

  // Quiz answer mode preference
  const QUIZ_ANSWER_MODE_KEY = "study-quiz-answer-mode-v1";
  const quizAnswerMode: "instant" | "button" =
    (state.uiPrefs?.studyAnswerMode as "instant" | "button" | undefined)
    ?? (() => {
      const v = typeof window !== "undefined" ? localStorage.getItem(QUIZ_ANSWER_MODE_KEY) : null;
      return (v === "instant" || v === "button" ? v : "instant") as "instant" | "button";
    })();
  const setQuizAnswerMode = useCallback((v: "instant" | "button") => {
    try { localStorage.setItem(QUIZ_ANSWER_MODE_KEY, v); } catch { /* noop */ }
    try { setUiPref("studyAnswerMode", v); } catch { /* noop */ }
  }, [setUiPref]);

  const QUIZ_THEME_KEY = "study-quiz-theme-v1";
  type QuizTheme = "classic" | "millionaire" | "navy" | "dark" | "colorful";
  const QUIZ_THEME_META: Record<QuizTheme, { label: string; desc: string; icon: string }> = {
    classic:     { label: "קלאסי",    desc: "רשימה עם אותיות עבריות",     icon: "📋" },
    millionaire: { label: "מיליונר",  desc: "גריד כהה עם מסגרות זהב",     icon: "🏆" },
    navy:        { label: "נייבי",    desc: "כפתורי נייבי על רקע לבן",    icon: "🔷" },
    dark:        { label: "לילה",     desc: "רקע כהה עם מסגרות זהב",      icon: "🌙" },
    colorful:    { label: "צבעוני",   desc: "גריד עם צבע לכל תשובה",      icon: "🎨" },
  };
  const quizTheme: QuizTheme =
    (state.uiPrefs?.studyQuizTheme as QuizTheme | undefined)
    ?? (() => {
      const v = typeof window !== "undefined" ? localStorage.getItem(QUIZ_THEME_KEY) : null;
      return (["classic","millionaire","navy","dark","colorful"].includes(v ?? "") ? v : "classic") as QuizTheme;
    })();
  const setQuizTheme = useCallback((v: QuizTheme) => {
    try { localStorage.setItem(QUIZ_THEME_KEY, v); } catch { /* noop */ }
    try { setUiPref("studyQuizTheme", v); } catch { /* noop */ }
  }, [setUiPref]);

  const savedShas = useMemo(
    () => [...(state.reviewIntervals ?? [1, 3, 7, 14, 30])].sort((a, b) => a - b),
    [state.reviewIntervals],
  );
  const savedPlan = useMemo(
    () => [...(state.planReviewIntervals ?? [1, 7, 30, 90])].sort((a, b) => a - b),
    [state.planReviewIntervals],
  );

  const [shasIntervals, setShasIntervals] = useState<number[]>(savedShas);
  const [planIntervals, setPlanIntervals] = useState<number[]>(savedPlan);

  // Sync draft from store (e.g., after applying a preset)
  useEffect(() => { setShasIntervals(savedShas); }, [savedShas.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPlanIntervals(savedPlan); }, [savedPlan.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const shasDirty = useMemo(
    () => [...shasIntervals].sort((a, b) => a - b).join(",") !== savedShas.join(","),
    [shasIntervals, savedShas],
  );
  const planDirty = useMemo(
    () => [...planIntervals].sort((a, b) => a - b).join(",") !== savedPlan.join(","),
    [planIntervals, savedPlan],
  );

  const saveShas = () => {
    if (shasIntervals.length === 0) { toast.error("יש להגדיר לפחות מרווח אחד"); return; }
    setReviewIntervals([...shasIntervals].sort((a, b) => a - b));
    toast.success("מרווחי ש\"ס נשמרו");
  };

  const savePlan = () => {
    if (planIntervals.length === 0) { toast.error("יש להגדיר לפחות מרווח אחד"); return; }
    setPlanReviewIntervals([...planIntervals].sort((a, b) => a - b));
    toast.success("מרווחי תוכניות נשמרו");
  };

  // ── Custom presets ──
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(loadCustomPresets);
  const [savingPreset, setSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  const applyPreset = (shas: number[], plan: number[], name: string) => {
    const sortedShas = [...shas].sort((a, b) => a - b);
    const sortedPlan = [...plan].sort((a, b) => a - b);
    setShasIntervals(sortedShas);
    setPlanIntervals(sortedPlan);
    setReviewIntervals(sortedShas);
    setPlanReviewIntervals(sortedPlan);
    toast.success(`תבנית "${name}" הוחלה`);
  };

  const commitSavePreset = () => {
    const name = newPresetName.trim();
    if (!name) { toast.error("יש להזין שם לתבנית"); return; }
    const preset: CustomPreset = {
      id: crypto.randomUUID(),
      name,
      shasIntervals: [...shasIntervals].sort((a, b) => a - b),
      planIntervals: [...planIntervals].sort((a, b) => a - b),
    };
    const next = [...customPresets, preset];
    setCustomPresets(next);
    saveCustomPresets(next);
    setNewPresetName("");
    setSavingPreset(false);
    toast.success(`תבנית "${name}" נשמרה`);
  };

  const deletePreset = (id: string) => {
    const next = customPresets.filter((p) => p.id !== id);
    setCustomPresets(next);
    saveCustomPresets(next);
  };

  return (
    <Card className="gold-frame p-4 space-y-3 animate-fade-in" dir="rtl">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-base font-semibold">לוח מרווחי חזרה</h3>
        <span className="gold-icon-circle h-8 w-8">
          <Repeat className="h-4 w-4" />
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed text-right">
        כמות החזרות = מספר המרווחים שתגדיר. בכל לימוד ראשוני ייצרו חזרות עתידיות לפי הימים הבאים.
      </p>

      <Tabs defaultValue="shas" className="w-full">
        <Card className="gold-frame p-1">
          <TabsList className="w-full bg-transparent h-auto gap-1">
            <TabsTrigger
              value="shas"
              className="flex-1 gap-1.5 rounded-xl text-xs py-2 data-[state=active]:bg-gradient-navy data-[state=active]:text-primary-foreground"
            >
              <BookOpen className="h-3.5 w-3.5" />
              ש"ס
            </TabsTrigger>
            <TabsTrigger
              value="plans"
              className="flex-1 gap-1.5 rounded-xl text-xs py-2 data-[state=active]:bg-gradient-navy data-[state=active]:text-primary-foreground"
            >
              <LayoutList className="h-3.5 w-3.5" />
              תוכניות לימוד
            </TabsTrigger>
            <TabsTrigger
              value="presets"
              className="flex-1 gap-1.5 rounded-xl text-xs py-2 data-[state=active]:bg-gradient-navy data-[state=active]:text-primary-foreground"
            >
              <Star className="h-3.5 w-3.5" />
              תבניות
            </TabsTrigger>
          </TabsList>
        </Card>

        {/* ── ש"ס tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="shas" className="mt-3 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">
              {shasIntervals.length}
              {" "}חזרות לכל עמוד
            </span>
            <span>
              שמור: <span className="text-foreground">{savedShas.join(" · ")}</span> ימים
            </span>
          </div>
          <IntervalEditor intervals={shasIntervals} onChange={setShasIntervals} />
          <Button
            size="sm"
            disabled={!shasDirty || shasIntervals.length === 0}
            onClick={saveShas}
            className="bg-gradient-navy text-primary-foreground rounded-lg h-8 w-full"
          >
            <Save className="h-3.5 w-3.5" />
            שמור מרווחי ש"ס
          </Button>
        </TabsContent>

        {/* ── תוכניות לימוד tab ──────────────────────────────────────────── */}
        <TabsContent value="plans" className="mt-3 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">
              {planIntervals.length}
              {" "}חזרות לכל יחידה
            </span>
            <span>
              שמור: <span className="text-foreground">{savedPlan.join(" · ")}</span> ימים
            </span>
          </div>
          <IntervalEditor intervals={planIntervals} onChange={setPlanIntervals} />
          <Button
            size="sm"
            disabled={!planDirty || planIntervals.length === 0}
            onClick={savePlan}
            className="bg-gradient-navy text-primary-foreground rounded-lg h-8 w-full"
          >
            <Save className="h-3.5 w-3.5" />
            שמור מרווחי תוכניות
          </Button>
        </TabsContent>

        {/* ── תבניות tab ─────────────────────────────────────────────────── */}
        <TabsContent value="presets" className="mt-3 space-y-4">
          {/* Built-in presets */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground">תבניות מובנות</h4>
            {BUILTIN_PRESETS.map((p) => (
              <PresetCard
                key={p.id}
                name={p.name}
                description={p.description}
                emoji={p.emoji}
                shasIntervals={[...p.shasIntervals]}
                planIntervals={[...p.planIntervals]}
                onApply={() => applyPreset([...p.shasIntervals], [...p.planIntervals], p.name)}
              />
            ))}
          </div>

          {/* Custom presets */}
          {customPresets.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">תבניות שמורות</h4>
              {customPresets.map((p) => (
                <PresetCard
                  key={p.id}
                  name={p.name}
                  shasIntervals={p.shasIntervals}
                  planIntervals={p.planIntervals}
                  onApply={() => applyPreset(p.shasIntervals, p.planIntervals, p.name)}
                  onDelete={() => deletePreset(p.id)}
                  editable
                />
              ))}
            </div>
          )}

          {/* Save new preset */}
          <div className="border-t border-gold/20 pt-3 space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground">
              שמור תבנית מההגדרות הנוכחיות
            </h4>
            <p className="text-[10px] text-muted-foreground">
              ש"ס: {[...shasIntervals].sort((a,b)=>a-b).join(", ")} · תוכניות: {[...planIntervals].sort((a,b)=>a-b).join(", ")}
            </p>
            {savingPreset ? (
              <div className="flex items-center gap-2" dir="rtl">
                <Button
                  size="sm"
                  onClick={commitSavePreset}
                  className="bg-gradient-navy text-primary-foreground rounded-lg h-8 shrink-0"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setSavingPreset(false); setNewPresetName(""); }}
                  className="h-8 rounded-lg shrink-0 text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Input
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitSavePreset(); }
                    if (e.key === "Escape") { setSavingPreset(false); setNewPresetName(""); }
                  }}
                  placeholder="שם התבנית..."
                  className="border-2 border-gold/40 text-right h-8 text-sm"
                  autoFocus
                />
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSavingPreset(true)}
                className="border-2 border-gold/40 rounded-lg h-8 text-xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                שמור תבנית חדשה
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Quiz answer mode ───────────────────────────────────────────── */}
      <div className="border-t border-gold/20 pt-3 space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">מצב בדיקת תשובה בשאלות אמריקאיות</h4>
        </div>
        <p className="text-[11px] text-muted-foreground">
          מיידי — לחיצה על תשובה מראה מיד נכון/שגוי ועוברת אוטומטית לשאלה הבאה אחרי שנייה.
          בדוק תשובה — בחר ואז לחץ כפתור.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={quizAnswerMode === "instant" ? "default" : "outline"}
            className={quizAnswerMode === "instant"
              ? "bg-gradient-navy text-primary-foreground rounded-lg h-8 gap-1.5 flex-1"
              : "border-2 border-gold/40 rounded-lg h-8 gap-1.5 flex-1"}
            onClick={() => setQuizAnswerMode("instant")}
          >
            <Zap className="h-3.5 w-3.5" /> מיידי
          </Button>
          <Button
            size="sm"
            variant={quizAnswerMode === "button" ? "default" : "outline"}
            className={quizAnswerMode === "button"
              ? "bg-gradient-navy text-primary-foreground rounded-lg h-8 gap-1.5 flex-1"
              : "border-2 border-gold/40 rounded-lg h-8 gap-1.5 flex-1"}
            onClick={() => setQuizAnswerMode("button")}
          >
            <Check className="h-3.5 w-3.5" /> בדוק תשובה
          </Button>
        </div>
      </div>
      {/* Quiz theme picker */}
      <div className="border-t border-gold/20 pt-3 space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-gold" />
          <h4 className="text-sm font-semibold">עיצוב שאלות אמריקאיות</h4>
        </div>
        <p className="text-[11px] text-muted-foreground">בחר עיצוב לתצוגת האפשרויות בשאלות בחירה מרובה.</p>
        <div className="grid grid-cols-1 gap-1.5">
          {(["classic", "millionaire", "navy", "dark", "colorful"] as QuizTheme[]).map((t) => (
            <button
              key={t}
              onClick={() => setQuizTheme(t)}
              className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg border text-right transition-all text-sm ${
                quizTheme === t
                  ? "border-gold bg-gold/10 font-semibold"
                  : "border-gold/20 hover:border-gold/50 hover:bg-secondary/50"
              }`}
            >
              <span className="text-base">{QUIZ_THEME_META[t].icon}</span>
              <div className="flex-1 text-right">
                <div>{QUIZ_THEME_META[t].label}</div>
                <div className="text-[10px] text-muted-foreground font-normal">{QUIZ_THEME_META[t].desc}</div>
              </div>
              {quizTheme === t && <Check className="h-4 w-4 text-gold flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Dialog wrapper (for plan creation / plan cards) ───────────────────────────
export function ReviewScheduleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gold-frame max-w-lg max-h-[88vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-right flex items-center gap-2">
            <Repeat className="h-4 w-4 text-gold" />
            הגדרת מרווחי חזרה
          </DialogTitle>
        </DialogHeader>
        <ReviewScheduleSettings />
      </DialogContent>
    </Dialog>
  );
}
