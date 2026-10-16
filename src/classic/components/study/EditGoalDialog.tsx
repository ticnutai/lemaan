import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check } from "lucide-react";
import { useStudy } from "@/lib/study/store";
import type { Goal } from "@/lib/study/types";

interface Props {
  goal: Goal | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const TYPE_LABELS: Record<Goal["type"], { label: string; unit: string }> = {
  daily_reviews: { label: "חזרות ביום", unit: "חזרות" },
  daily_cards:   { label: "כרטיסים שונים ביום", unit: "כרטיסים" },
  success_rate:  { label: "אחוז הצלחה", unit: "%" },
  streak:        { label: "רצף ימים", unit: "ימים" },
  shas_daf:      { label: "דף יומי בש\"ס", unit: "דפים" },
  custom:        { label: "יעד מותאם אישית", unit: "ימים" },
};

export function EditGoalDialog({ goal, open, onOpenChange }: Props) {
  const { state, updateGoal } = useStudy();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [windowDays, setWindowDays] = useState("");
  const [deckId, setDeckId] = useState<string>("all");

  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setTarget(String(goal.target));
      setWindowDays(String(goal.windowDays ?? 7));
      setDeckId(goal.deckId ?? "all");
    }
  }, [goal]);

  if (!goal) return null;
  const meta = TYPE_LABELS[goal.type];

  const submit = () => {
    const t = parseInt(target, 10);
    if (!t || t <= 0) return;
    updateGoal(goal.id, {
      title: title.trim() || meta.label,
      target: t,
      windowDays: goal.type === "success_rate" ? parseInt(windowDays, 10) || 7 : goal.windowDays,
      deckId: deckId === "all" ? null : deckId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gold-frame max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-right">עריכת יעד</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-right">
          <div className="text-[11px] text-muted-foreground">סוג: {meta.label}</div>
          <div>
            <label className="text-xs text-muted-foreground">שם היעד</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={meta.label} className="border-2 border-gold/40 text-right" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">יעד ({meta.unit})</label>
              <Input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)}
                className="border-2 border-gold/40 text-right" />
            </div>
            {goal.type === "success_rate" && (
              <div>
                <label className="text-xs text-muted-foreground">חלון ימים</label>
                <Input type="number" min={1} value={windowDays}
                  onChange={(e) => setWindowDays(e.target.value)}
                  className="border-2 border-gold/40 text-right" />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">מערכת</label>
            <Select value={deckId} onValueChange={setDeckId}>
              <SelectTrigger className="border-2 border-gold/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל המערכות</SelectItem>
                {state.decks.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {goal.type === "custom" && (
            <div className="text-[11px] text-muted-foreground bg-secondary/50 rounded-lg p-2">
              סומנו {goal.manualDoneDates?.length ?? 0} ימים — שינוי הפרמטרים לא מוחק את התאריכים.
            </div>
          )}
          <Button onClick={submit} className="w-full bg-gradient-navy text-primary-foreground rounded-xl">
            <Check className="h-4 w-4" /> שמור שינויים
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
