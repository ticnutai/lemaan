import { useEffect, useMemo, useState } from "react";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Trash2, ChevronDown, ChevronUp, Calendar as CalendarIcon, Save } from "lucide-react";
import { useStudy } from "@/lib/study/store";
import { cn } from "@/lib/utils";
import { PATH_SEP, displayCategoryName } from "@/lib/study/shasGen";
import type { QuizPlan, QuizScope, QuizQuestionType, QuizPerSessionMode } from "@/lib/study/types";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** אם נמסר — עריכת תוכנית קיימת. אחרת — יצירה חדשה. */
  editingPlan?: QuizPlan | null;
}

const QTYPE_LABELS: Record<QuizQuestionType, string> = {
  multiple: "אמריקאיות",
  open: "פתוחות",
};
const PERSESSION_LABELS: Record<QuizPerSessionMode, string> = {
  fixed: "מספר קבוע",
  allDue: "כל השאלות הזמינות",
  random: "טווח אקראי",
};

const DEFAULT_PLAN: Omit<QuizPlan, "id" | "createdAt"> = {
  name: "",
  scopes: [],
  questionTypes: ["multiple"],
  perSession: { modes: ["fixed"], fixedCount: 10, randomMin: 5, randomMax: 15 },
  selection: { random: true, uncoveredFirst: false, weakFirst: false, weighted: false },
  duration: { days: 30, endDate: null, openEnded: false },
  frequency: { daily: 1, bigExamDates: [] },
  scheduling: { manual: true, notifications: false, quotaPerWeek: null },
  isActive: true,
};

export function QuizPlanSetupDialog({ open, onOpenChange, editingPlan }: Props) {
  const { state, addQuizPlan, updateQuizPlan } = useStudy();
  const [draft, setDraft] = useState<Omit<QuizPlan, "id" | "createdAt">>(DEFAULT_PLAN);
  const [scopeSearch, setScopeSearch] = useState("");
  const [bigExamInput, setBigExamInput] = useState("");
  const [perCategoryExpanded, setPerCategoryExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editingPlan) {
        const { id: _id, createdAt: _ca, ...rest } = editingPlan;
        setDraft(rest);
      } else {
        setDraft(DEFAULT_PLAN);
      }
      setScopeSearch("");
      setBigExamInput("");
    }
  }, [open, editingPlan]);

  const allCategoryPaths = useMemo(() => {
    const paths = (state.categories ?? []).map((c) => c.name);
    paths.sort((a, b) => a.localeCompare(b, "he"));
    return paths;
  }, [state.categories]);

  const filteredPaths = useMemo(() => {
    const q = scopeSearch.trim();
    if (!q) return allCategoryPaths.slice(0, 200);
    return allCategoryPaths.filter((p) => p.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  }, [allCategoryPaths, scopeSearch]);

  const isInScope = (path: string) => draft.scopes.some((s) => s.path === path);

  const toggleScope = (path: string) => {
    setDraft((d) => {
      const exists = d.scopes.find((s) => s.path === path);
      if (exists) return { ...d, scopes: d.scopes.filter((s) => s.path !== path) };
      return { ...d, scopes: [...d.scopes, { path, includeDescendants: true }] };
    });
  };

  const updateScope = (path: string, patch: Partial<QuizScope>) => {
    setDraft((d) => ({
      ...d,
      scopes: d.scopes.map((s) => s.path === path ? { ...s, ...patch } : s),
    }));
  };

  const toggleQuestionType = (t: QuizQuestionType) => {
    setDraft((d) => ({
      ...d,
      questionTypes: d.questionTypes.includes(t)
        ? d.questionTypes.filter((x) => x !== t)
        : [...d.questionTypes, t],
    }));
  };

  const togglePerSessionMode = (m: QuizPerSessionMode) => {
    setDraft((d) => {
      const has = d.perSession.modes.includes(m);
      return {
        ...d,
        perSession: { ...d.perSession, modes: has ? d.perSession.modes.filter((x) => x !== m) : [...d.perSession.modes, m] },
      };
    });
  };

  const addBigExam = () => {
    if (!bigExamInput) return;
    setDraft((d) => ({
      ...d,
      frequency: { ...d.frequency, bigExamDates: Array.from(new Set([...d.frequency.bigExamDates, bigExamInput])).sort() },
    }));
    setBigExamInput("");
  };

  const removeBigExam = (dateStr: string) => {
    setDraft((d) => ({
      ...d,
      frequency: { ...d.frequency, bigExamDates: d.frequency.bigExamDates.filter((x) => x !== dateStr) },
    }));
  };

  const handleSave = () => {
    if (!draft.name.trim()) {
      toast({ title: "חסר שם", description: "תן שם לתוכנית" });
      return;
    }
    if (!draft.questionTypes.length) {
      toast({ title: "חסרים סוגי שאלות", description: "בחר לפחות סוג אחד" });
      return;
    }
    if (!draft.perSession.modes.length) {
      toast({ title: "כמות שאלות לא מוגדרת", description: "בחר לפחות אופציה אחת" });
      return;
    }
    if (editingPlan) {
      updateQuizPlan(editingPlan.id, draft);
      toast({ title: "התוכנית עודכנה" });
    } else {
      addQuizPlan(draft);
      toast({ title: "התוכנית נוצרה" });
    }
    onOpenChange(false);
  };

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      initialWidth={760}
      initialHeight={680}
      minWidth={420}
      minHeight={360}
      title={editingPlan ? "עריכת תוכנית בחינה" : "תוכנית בחינה חדשה"}
    >
      <div className="text-right text-sm text-muted-foreground mb-3">
        הגדר על מה להיבחן, באיזו תכיפות, וכמה זמן.
      </div>

      <div className="flex-1">
        <div className="space-y-4">
          {/* שם */}
            <div>
              <label className="block text-sm font-semibold mb-1">שם התוכנית</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder='למשל: "מבחן ש"ס שבועי" או "ראשונים על ב"מ"'
              />
            </div>

            {/* קטגוריות */}
            <div className="rounded-lg border-2 border-gold/40 p-3 space-y-2">
              <div className="font-semibold text-sm">קטגוריות לבחינה</div>
              <p className="text-xs text-muted-foreground">בחר ענפים שלמים או פריטים בודדים. אפשר לבחור הרבה.</p>
              <Input
                placeholder="חיפוש קטגוריה..."
                value={scopeSearch}
                onChange={(e) => setScopeSearch(e.target.value)}
                className="h-8 text-xs"
              />
              {draft.scopes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {draft.scopes.map((s) => (
                    <div key={s.path || "__all__"} className="inline-flex items-center gap-1.5 rounded-full bg-navy text-primary-foreground px-2 py-0.5 text-xs">
                      <span title={s.path || "כל הקטגוריות"}>{s.path ? displayCategoryName(s.path) : "הכל"}</span>
                      {s.path && (
                        <label className="inline-flex items-center gap-1 opacity-90">
                          <Checkbox
                            checked={s.includeDescendants}
                            onCheckedChange={(v) => updateScope(s.path, { includeDescendants: !!v })}
                            className="h-3 w-3 border-white"
                          />
                          <span className="text-[10px]">+תתי</span>
                        </label>
                      )}
                      <button onClick={() => toggleScope(s.path)} className="opacity-70 hover:opacity-100">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const has = draft.scopes.some((s) => s.path === "");
                    if (has) toggleScope(""); else toggleScope("");
                  }}
                  className={cn(
                    "rounded-full border-2 px-2 py-0.5 text-xs",
                    isInScope("") ? "bg-gradient-navy text-primary-foreground border-navy" : "border-gold/40 hover:border-gold/70",
                  )}
                >כל הקטגוריות</button>
                {filteredPaths.map((p) => {
                  const sel = isInScope(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggleScope(p)}
                      className={cn(
                        "rounded-full border-2 px-2 py-0.5 text-xs max-w-[200px] truncate",
                        sel ? "bg-gradient-navy text-primary-foreground border-navy" : "border-gold/40 hover:border-gold/70",
                      )}
                      title={p}
                    >
                      {displayCategoryName(p)}
                      {p.includes(PATH_SEP) && (
                        <span className="opacity-50 text-[9px] mx-1">{p.split(PATH_SEP).length - 1}↑</span>
                      )}
                    </button>
                  );
                })}
                {allCategoryPaths.length > filteredPaths.length && (
                  <span className="text-[10px] text-muted-foreground self-center">+ {allCategoryPaths.length - filteredPaths.length} נוספות (חפש)</span>
                )}
              </div>
            </div>

            {/* סוגי שאלות */}
            <div className="rounded-lg border-2 border-gold/40 p-3 space-y-2">
              <div className="font-semibold text-sm">סוגי שאלות (ברירת מחדל)</div>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(QTYPE_LABELS) as QuizQuestionType[]).map((t) => (
                  <button
                    key={t} type="button" onClick={() => toggleQuestionType(t)}
                    className={cn(
                      "rounded-full border-2 px-3 py-1 text-xs",
                      draft.questionTypes.includes(t) ? "bg-gradient-navy text-primary-foreground border-navy" : "border-gold/40 hover:border-gold/70",
                    )}
                  >{QTYPE_LABELS[t]}</button>
                ))}
              </div>
              {draft.scopes.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-gold/30">
                  <div className="text-xs text-muted-foreground">סוגי שאלות לכל קטגוריה (אופציונלי, דורס את ברירת המחדל):</div>
                  {draft.scopes.map((s) => {
                    const expanded = perCategoryExpanded === s.path;
                    const types = s.questionTypes ?? null;
                    return (
                      <div key={s.path || "__all__"} className="text-xs">
                        <button
                          type="button"
                          onClick={() => setPerCategoryExpanded(expanded ? null : (s.path || "__all__"))}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {s.path ? displayCategoryName(s.path) : "הכל"}
                          <span className="text-muted-foreground">
                            ({types?.map((t) => QTYPE_LABELS[t]).join(", ") || "ברירת מחדל"})
                          </span>
                        </button>
                        {expanded && (
                          <div className="flex gap-1 pr-4 mt-1">
                            {(Object.keys(QTYPE_LABELS) as QuizQuestionType[]).map((t) => {
                              const sel = (types ?? draft.questionTypes).includes(t);
                              return (
                                <button
                                  key={t} type="button"
                                  onClick={() => {
                                    const cur = types ?? draft.questionTypes;
                                    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
                                    updateScope(s.path, { questionTypes: next });
                                  }}
                                  className={cn(
                                    "rounded-full border px-2 py-0.5 text-[10px]",
                                    sel ? "bg-gold text-navy border-gold" : "border-gold/40",
                                  )}
                                >{QTYPE_LABELS[t]}</button>
                              );
                            })}
                            {types && (
                              <button
                                type="button"
                                onClick={() => updateScope(s.path, { questionTypes: undefined })}
                                className="text-[10px] text-muted-foreground hover:text-foreground"
                              >איפוס לברירת מחדל</button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* כמות שאלות בכל מבחן */}
            <div className="rounded-lg border-2 border-gold/40 p-3 space-y-2">
              <div className="font-semibold text-sm">כמות שאלות בכל מבחן</div>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(PERSESSION_LABELS) as QuizPerSessionMode[]).map((m) => (
                  <button
                    key={m} type="button" onClick={() => togglePerSessionMode(m)}
                    className={cn(
                      "rounded-full border-2 px-3 py-1 text-xs",
                      draft.perSession.modes.includes(m) ? "bg-gradient-navy text-primary-foreground border-navy" : "border-gold/40 hover:border-gold/70",
                    )}
                  >{PERSESSION_LABELS[m]}</button>
                ))}
              </div>
              {draft.perSession.modes.includes("fixed") && (
                <div className="flex items-center gap-2 text-xs">
                  <span>קבוע:</span>
                  <Input
                    type="number" min={1} className="h-7 w-20"
                    value={draft.perSession.fixedCount ?? ""}
                    onChange={(e) => setDraft((d) => ({
                      ...d, perSession: { ...d.perSession, fixedCount: parseInt(e.target.value || "0", 10) || 0 },
                    }))}
                  />
                  <span>שאלות</span>
                </div>
              )}
              {draft.perSession.modes.includes("random") && (
                <div className="flex items-center gap-2 text-xs">
                  <span>טווח אקראי:</span>
                  <Input type="number" min={1} className="h-7 w-16"
                    value={draft.perSession.randomMin ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, perSession: { ...d.perSession, randomMin: parseInt(e.target.value || "0", 10) || 0 } }))} />
                  <span>—</span>
                  <Input type="number" min={1} className="h-7 w-16"
                    value={draft.perSession.randomMax ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, perSession: { ...d.perSession, randomMax: parseInt(e.target.value || "0", 10) || 0 } }))} />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">לפני כל מבחן תיפתח אפשרות לבחור איקון/מצב.</p>
            </div>

            {/* בחירת שאלות */}
            <div className="rounded-lg border-2 border-gold/40 p-3 space-y-2">
              <div className="font-semibold text-sm">איך לבחור שאלות לכל מבחן</div>
              {([
                { key: "random", label: "אקראי בכל מבחן" },
                { key: "uncoveredFirst", label: "שאלות שטרם נשאלו תחילה" },
                { key: "weakFirst", label: "שאלות שטעיתי בהן בעבר" },
                { key: "weighted", label: "משוקלל לפי יכולת (חלשות יותר)" },
              ] as const).map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={draft.selection[opt.key]}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, selection: { ...d.selection, [opt.key]: !!v } }))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {/* משך התוכנית */}
            <div className="rounded-lg border-2 border-gold/40 p-3 space-y-2">
              <div className="font-semibold text-sm">משך התוכנית</div>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={draft.duration.openEnded}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, duration: { ...d.duration, openEnded: !!v } }))}
                />
                ללא הגבלה — רץ עד שמבטלים
              </label>
              {!draft.duration.openEnded && (
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span>למשך:</span>
                  <Input type="number" min={1} className="h-7 w-20"
                    value={draft.duration.days ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, duration: { ...d.duration, days: parseInt(e.target.value || "0", 10) || null } }))} />
                  <span>ימים, או עד תאריך:</span>
                  <Input type="date" className="h-7 w-40"
                    value={draft.duration.endDate ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, duration: { ...d.duration, endDate: e.target.value || null } }))} />
                </div>
              )}
            </div>

            {/* תכיפות + מבחנים גדולים */}
            <div className="rounded-lg border-2 border-gold/40 p-3 space-y-2">
              <div className="font-semibold text-sm">תכיפות בחינה</div>
              <div className="flex items-center gap-2 text-xs">
                <span>כל יום:</span>
                <Input type="number" min={0} className="h-7 w-20"
                  value={draft.frequency.daily ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, frequency: { ...d.frequency, daily: parseInt(e.target.value || "0", 10) || 0 } }))} />
                <span>מבחנים</span>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">תאריכי בחינה גדולים (אופציונלי):</div>
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={bigExamInput} onChange={(e) => setBigExamInput(e.target.value)} className="h-7 w-40 text-xs" />
                  <Button size="sm" variant="outline" onClick={addBigExam} className="h-7 gap-1 border-gold/40">
                    <Plus className="h-3 w-3" /> הוסף
                  </Button>
                </div>
                {draft.frequency.bigExamDates.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {draft.frequency.bigExamDates.map((d) => (
                      <Badge key={d} variant="secondary" className="gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {d}
                        <button onClick={() => removeBigExam(d)} className="opacity-70 hover:opacity-100">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* תזמון */}
            <div className="rounded-lg border-2 border-gold/40 p-3 space-y-2">
              <div className="font-semibold text-sm">מתי המבחנים מופיעים</div>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={draft.scheduling.manual}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, scheduling: { ...d.scheduling, manual: !!v } }))} />
                ידני — אני מתחיל מתי שמתאים
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={draft.scheduling.notifications}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, scheduling: { ...d.scheduling, notifications: !!v } }))} />
                התראות בשעות קבועות
              </label>
              <div className="flex items-center gap-2 text-xs">
                <span>מכסה שבועית:</span>
                <Input type="number" min={0} className="h-7 w-20"
                  value={draft.scheduling.quotaPerWeek ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, scheduling: { ...d.scheduling, quotaPerWeek: parseInt(e.target.value || "0", 10) || null } }))} />
                <span>מבחנים</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-3 mt-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} className="bg-gradient-navy text-primary-foreground gap-1">
            <Save className="h-4 w-4" /> {editingPlan ? "שמור שינויים" : "צור תוכנית"}
          </Button>
        </div>
    </FloatingPanel>
  );
}
