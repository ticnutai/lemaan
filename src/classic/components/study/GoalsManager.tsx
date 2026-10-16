import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Target, Plus, Trash2, Check, Flame, TrendingUp, BookOpen, Sparkles, Calendar as CalIcon, CalendarDays, Pencil } from "lucide-react";
import { useStudy } from "@/lib/study/store";
import { evaluateGoal, todayKey, dateKey } from "@/lib/study/goals";
import type { Goal, GoalType } from "@/lib/study/types";
import { cn } from "@/lib/utils";
import { EditGoalDialog } from "./EditGoalDialog";

const TYPE_META: Record<GoalType, { label: string; icon: typeof Target; unit: string; hint: string }> = {
  daily_reviews: { label: "חזרות ביום", icon: TrendingUp, unit: "חזרות", hint: "כמה חזרות לבצע כל יום" },
  daily_cards:   { label: "כרטיסים שונים ביום", icon: BookOpen, unit: "כרטיסים", hint: "כמה שאלות שונות לעבור ביום" },
  success_rate:  { label: "אחוז הצלחה", icon: Sparkles, unit: "%", hint: "אחוז הצלחה מינימלי לשמור" },
  streak:        { label: "רצף ימים", icon: Flame, unit: "ימים", hint: "רצף ימים פעילים ברציפות" },
  shas_daf:      { label: "דף יומי בש\"ס", icon: BookOpen, unit: "דפים", hint: "מספר דפי גמרא לסיים בתוכנית" },
  custom:        { label: "יעד מותאם אישית", icon: Target, unit: "ימים", hint: "סמן ידנית בכל יום שביצעת" },
};

export function GoalsManager() {
  const { state, addGoal, deleteGoal, toggleGoalDate } = useStudy();
  const goals = state.goals ?? [];
  const [open, setOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  // form
  const [type, setType] = useState<GoalType>("daily_reviews");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("20");
  const [windowDays, setWindowDays] = useState("7");
  const [deckId, setDeckId] = useState<string>("all");

  const reset = () => {
    setType("daily_reviews"); setTitle(""); setTarget("20"); setWindowDays("7"); setDeckId("all");
  };

  const submit = () => {
    const t = parseInt(target, 10);
    if (!t || t <= 0) return;
    addGoal({
      type,
      title: title.trim() || TYPE_META[type].label,
      target: t,
      windowDays: type === "success_rate" ? parseInt(windowDays, 10) : undefined,
      deckId: deckId === "all" ? null : deckId,
    });
    reset();
    setOpen(false);
  };

  return (
    <Card className="gold-frame p-6 space-y-5 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="gold-icon-circle"><Target className="h-4 w-4" /></span>
          <h3 className="font-display text-lg font-semibold">יעדים</h3>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-navy text-primary-foreground rounded-xl">
              <Plus className="h-4 w-4" /> יעד חדש
            </Button>
          </DialogTrigger>
          <DialogContent className="gold-frame max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="font-display text-right">יעד חדש</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-right">
              <div>
                <label className="text-xs text-muted-foreground">סוג יעד</label>
                <Select value={type} onValueChange={(v) => setType(v as GoalType)}>
                  <SelectTrigger className="border-2 border-gold/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_META) as GoalType[]).filter((k) => k !== "shas_daf").map((k) => (
                      <SelectItem key={k} value={k}>{TYPE_META[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">{TYPE_META[type].hint}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">כותרת (אופציונלי)</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder={TYPE_META[type].label} className="border-2 border-gold/40 text-right" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">יעד ({TYPE_META[type].unit})</label>
                  <Input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)}
                    className="border-2 border-gold/40 text-right" />
                </div>
                {type === "success_rate" && (
                  <div>
                    <label className="text-xs text-muted-foreground">חלון ימים</label>
                    <Input type="number" min={1} value={windowDays}
                      onChange={(e) => setWindowDays(e.target.value)}
                      className="border-2 border-gold/40 text-right" />
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מערכת (אופציונלי)</label>
                <Select value={deckId} onValueChange={setDeckId}>
                  <SelectTrigger className="border-2 border-gold/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל המערכות</SelectItem>
                    {state.decks.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={submit} className="w-full bg-gradient-navy text-primary-foreground rounded-xl">
                <Check className="h-4 w-4" /> צור יעד
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Goals list */}
      <div className="space-y-3">
        {goals.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-6">
            עדיין אין יעדים. הוסף יעד ראשון כדי לעקוב אחר ההתקדמות.
          </div>
        )}
        {goals.map((g) => {
          const meta = TYPE_META[g.type];
          const Icon = meta.icon;
          const p = evaluateGoal(g, state.logs);
          const today = todayKey();
          const deckName = g.deckId ? state.decks.find((d) => d.id === g.deckId)?.name : null;
          return (
            <div key={g.id} className="rounded-xl border-2 border-gold/40 bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 text-right">
                  <div className="flex items-center gap-2 justify-end flex-wrap">
                    {p.doneToday && <Badge className="bg-gold text-navy text-[10px]">הושלם היום ✓</Badge>}
                    {deckName && <Badge variant="secondary" className="text-[10px]">{deckName}</Badge>}
                    <span className="font-semibold text-sm text-foreground">{g.title}</span>
                    <Icon className="h-4 w-4 text-gold" />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {meta.label}
                    {g.type === "success_rate" && g.windowDays ? ` · ב-${g.windowDays} ימים` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditingGoal(g)}
                    className="text-foreground/60 hover:text-gold p-1"
                    title="ערוך יעד">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => { if (confirm("למחוק יעד?")) deleteGoal(g.id); }}
                    className="text-destructive opacity-60 hover:opacity-100 p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={cn("text-xs font-bold w-20 text-right",
                  p.doneToday ? "text-gold" : "text-foreground")}>
                  {p.current}/{g.target} {meta.unit}
                </span>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-gradient-gold transition-all" style={{ width: `${p.percent}%` }} />
                </div>
                <span className="text-xs font-semibold text-gold w-10 text-right">{p.percent}%</span>
              </div>

              {g.type === "custom" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={p.doneToday ? "default" : "outline"}
                      className={cn("flex-1 rounded-lg",
                        p.doneToday
                          ? "bg-gradient-navy text-primary-foreground"
                          : "border-2 border-gold text-navy")}
                      onClick={() => toggleGoalDate(g.id, today)}
                    >
                      <Check className="h-3.5 w-3.5" /> {p.doneToday ? "בוצע היום - לחץ לבטל" : "סמן כבוצע היום"}
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" className="rounded-lg border-2 border-gold text-navy">
                          <CalendarDays className="h-3.5 w-3.5" /> תאריכים
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 gold-frame" align="end">
                        <Calendar
                          mode="multiple"
                          selected={(g.manualDoneDates ?? []).map((d) => {
                            const [y, m, day] = d.split("-").map(Number);
                            return new Date(y, m - 1, day);
                          })}
                          onDayClick={(date) => toggleGoalDate(g.id, dateKey(date.getTime()))}
                          disabled={(date) => date.getTime() > Date.now()}
                          className={cn("p-3 pointer-events-auto")}
                        />
                        <div className="px-3 pb-3 text-[11px] text-muted-foreground text-center">
                          לחץ על תאריך כדי לסמן/לבטל
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  {(g.manualDoneDates?.length ?? 0) > 0 && (
                    <div className="text-[11px] text-muted-foreground text-right">
                      סומנו {g.manualDoneDates!.length} ימים
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <EditGoalDialog
        goal={editingGoal}
        open={editingGoal !== null}
        onOpenChange={(o) => { if (!o) setEditingGoal(null); }}
      />
    </Card>
  );
}
