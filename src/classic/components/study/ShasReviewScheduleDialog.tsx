import { useEffect, useMemo, useState } from "react";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Check, Calendar, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toHebrewDate } from "@/lib/hebrewDate";
import { toast } from "@/hooks/use-toast";

const PRESETS_LS_KEY = "shas-review-preset-days-v1";
const SKIP_DIALOG_LS_KEY = "shas-review-skip-dialog-v1";
const LAST_SELECTION_LS_KEY = "shas-review-last-selection-v1";

export interface PresetItem { days: number; label: string; }

const DEFAULT_PRESETS: PresetItem[] = [
  { days: 1,  label: "מחר" },
  { days: 3,  label: "בעוד 3 ימים" },
  { days: 7,  label: "בעוד שבוע" },
  { days: 14, label: "בעוד 14 יום" },
  { days: 30, label: "בעוד חודש" },
  { days: 60, label: "בעוד חודשיים" },
  { days: 90, label: "בעוד 3 חודשים" },
];

function loadPresets(): PresetItem[] {
  try {
    const raw = localStorage.getItem(PRESETS_LS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every((x) => typeof x?.days === "number" && typeof x?.label === "string")) {
        return arr as PresetItem[];
      }
    }
  } catch { /* noop */ }
  return DEFAULT_PRESETS;
}
function savePresets(p: PresetItem[]) {
  try { localStorage.setItem(PRESETS_LS_KEY, JSON.stringify(p)); } catch { /* noop */ }
}
function loadLastSelection(): number[] {
  try {
    const raw = localStorage.getItem(LAST_SELECTION_LS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((n) => Number.isFinite(n) && n > 0);
    }
  } catch { /* noop */ }
  return [];
}
export function isShasDialogSkipped(): boolean {
  try { return localStorage.getItem(SKIP_DIALOG_LS_KEY) === "1"; } catch { return false; }
}
export function setShasDialogSkipped(skip: boolean) {
  try { localStorage.setItem(SKIP_DIALOG_LS_KEY, skip ? "1" : "0"); } catch { /* noop */ }
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** טקסט תיאור המיקום (למשל "ברכות דף ב' עמוד א'") */
  positionLabel: string;
  /** ברירת מחדל מהמערכת (state.reviewIntervals) — מוצגת כצ׳ק תחילי */
  defaultDays: number[];
  /** אם המשתמש בוחר "השתמש כברירת מחדל" — נשמור ל-state */
  onSaveAsDefault: (days: number[]) => void;
  /** קריאה לאישור — מקבלת רשימת ימים מהיום */
  onConfirm: (days: number[]) => void;
}

export function ShasReviewScheduleDialog({
  open, onOpenChange, positionLabel, defaultDays, onSaveAsDefault, onConfirm,
}: Props) {
  const [presets, setPresets] = useState<PresetItem[]>(() => loadPresets());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [customDate, setCustomDate] = useState("");
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [newPresetDays, setNewPresetDays] = useState("");
  const [newPresetLabel, setNewPresetLabel] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [skipNextTime, setSkipNextTime] = useState(false);

  // אתחול בפתיחה: בחירה אחרונה אם קיימת, אחרת ברירת מחדל מה-state
  useEffect(() => {
    if (!open) return;
    const last = loadLastSelection();
    const init = last.length ? last : defaultDays;
    setSelected(new Set(init));
    setCustomDays([]);
    setCustomDate("");
    setEditMode(false);
    setSaveAsDefault(false);
    setSkipNextTime(false);
  }, [open, defaultDays]);

  const allSelectedDays = useMemo(() => {
    return Array.from(new Set([...selected, ...customDays])).sort((a, b) => a - b);
  }, [selected, customDays]);

  const toggle = (d: number) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d); else n.add(d);
      return n;
    });
  };

  const addCustomFromDate = () => {
    if (!customDate) return;
    const t = new Date(customDate + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffMs = t.getTime() - today.getTime();
    const days = Math.round(diffMs / 86400000);
    if (!Number.isFinite(days) || days <= 0) {
      toast({ title: "תאריך לא תקין", description: "בחר תאריך בעתיד" });
      return;
    }
    setCustomDays((arr) => arr.includes(days) ? arr : [...arr, days].sort((a, b) => a - b));
    setCustomDate("");
  };

  const addPreset = () => {
    const d = parseInt(newPresetDays, 10);
    const label = newPresetLabel.trim();
    if (!Number.isFinite(d) || d <= 0 || !label) {
      toast({ title: "פרטי טאב חסרים", description: "מלא ימים (מספר חיובי) ושם" });
      return;
    }
    if (presets.some((p) => p.days === d)) {
      toast({ title: "כבר קיים", description: `יש כבר טאב ל-${d} ימים` });
      return;
    }
    const next = [...presets, { days: d, label }].sort((a, b) => a.days - b.days);
    setPresets(next); savePresets(next);
    setNewPresetDays(""); setNewPresetLabel("");
  };

  const updatePresetLabel = (days: number, newLabel: string) => {
    const next = presets.map((p) => p.days === days ? { ...p, label: newLabel } : p);
    setPresets(next); savePresets(next);
  };

  const removePreset = (days: number) => {
    const next = presets.filter((p) => p.days !== days);
    setPresets(next); savePresets(next);
    setSelected((s) => { const n = new Set(s); n.delete(days); return n; });
  };

  const handleConfirm = () => {
    try { localStorage.setItem(LAST_SELECTION_LS_KEY, JSON.stringify(allSelectedDays)); } catch { /* noop */ }
    if (saveAsDefault && allSelectedDays.length) onSaveAsDefault(allSelectedDays);
    setShasDialogSkipped(skipNextTime);
    onConfirm(allSelectedDays);
    onOpenChange(false);
  };

  const handleSkipScheduling = () => {
    setShasDialogSkipped(skipNextTime);
    onConfirm([]);
    onOpenChange(false);
  };

  const formatDateChip = (days: number) => {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + days);
    return toHebrewDate(d);
  };

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      initialWidth={560}
      initialHeight={580}
      minWidth={360}
      minHeight={320}
      title={(
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gold" />
          מתי לחזור על הלימוד?
        </span>
      )}
    >
      <div className="text-right text-sm text-muted-foreground mb-3">
        <span className="font-semibold text-foreground">{positionLabel}</span> — בחר תאריכי תזכורת (אפשר כמה).
      </div>

      <div className="space-y-3">
          {/* Presets grid */}
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const isSel = selected.has(p.days);
              if (editMode) {
                return (
                  <div key={p.days} className="flex items-center gap-1 rounded-md border border-gold/40 bg-card px-2 py-1">
                    <span className="text-[10px] text-muted-foreground">{p.days}י׳</span>
                    <Input
                      defaultValue={p.label}
                      onBlur={(e) => updatePresetLabel(p.days, e.target.value.trim() || p.label)}
                      className="h-6 text-xs w-32 border-0 px-1"
                    />
                    <button onClick={() => removePreset(p.days)} className="text-destructive opacity-70 hover:opacity-100" title="מחק">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              }
              return (
                <button
                  key={p.days} type="button"
                  onClick={() => toggle(p.days)}
                  className={cn(
                    "rounded-full border-2 px-3 py-1.5 text-sm transition-all flex items-center gap-1.5",
                    isSel ? "bg-gradient-navy text-primary-foreground border-navy"
                          : "border-gold/40 bg-card hover:border-gold/70",
                  )}
                >
                  {isSel && <Check className="h-3.5 w-3.5" />}
                  <span>{p.label}</span>
                  <span className="text-[10px] opacity-60">({formatDateChip(p.days)})</span>
                </button>
              );
            })}
          </div>

          {/* Edit presets row */}
          {editMode && (
            <div className="flex flex-wrap gap-1.5 items-end rounded-lg border border-dashed border-gold/40 p-2">
              <Input
                placeholder="ימים"
                type="number"
                min={1}
                value={newPresetDays}
                onChange={(e) => setNewPresetDays(e.target.value)}
                className="h-8 w-20 text-xs"
              />
              <Input
                placeholder="שם הטאב"
                value={newPresetLabel}
                onChange={(e) => setNewPresetLabel(e.target.value)}
                className="h-8 flex-1 min-w-[120px] text-xs"
              />
              <Button size="sm" onClick={addPreset} className="h-8 gap-1 bg-gold text-navy">
                <Plus className="h-3.5 w-3.5" /> הוסף טאב
              </Button>
            </div>
          )}

          {/* Custom date */}
          {!editMode && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                <Button size="sm" variant="outline" onClick={addCustomFromDate} className="h-8 gap-1 border-gold/40">
                  <Plus className="h-3.5 w-3.5" /> תאריך מותאם
                </Button>
              </div>
              {customDays.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {customDays.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-full bg-gold/15 border border-gold/40 px-2 py-0.5 text-xs">
                      בעוד {d} יום ({formatDateChip(d)})
                      <button onClick={() => setCustomDays((arr) => arr.filter((x) => x !== d))} className="opacity-70 hover:opacity-100">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Edit toggle */}
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => setEditMode((v) => !v)}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <Pencil className="h-3 w-3" />
              {editMode ? "סיים עריכה" : "ערוך טאבים"}
            </button>
            <span className="text-muted-foreground">
              {allSelectedDays.length > 0 ? `נבחרו ${allSelectedDays.length} תזכורות` : "לא נבחרו תזכורות"}
            </span>
          </div>

          {/* Bottom toggles */}
          <div className="space-y-2 rounded-lg bg-secondary/40 p-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={saveAsDefault} onCheckedChange={(v) => setSaveAsDefault(!!v)} />
              שמור את הבחירה הזו כברירת מחדל בהגדרות
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={skipNextTime} onCheckedChange={(v) => setSkipNextTime(!!v)} />
              אל תשאל אותי שוב — תמיד השתמש בברירת המחדל אוטומטית
            </label>
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" onClick={handleSkipScheduling} className="text-muted-foreground gap-1">
            <X className="h-4 w-4" /> ללא תזמון
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={allSelectedDays.length === 0}
            className="bg-gradient-navy text-primary-foreground gap-1"
          >
            <Save className="h-4 w-4" /> תזמן {allSelectedDays.length || ""} תזכורות
          </Button>
        </div>
    </FloatingPanel>
  );
}
