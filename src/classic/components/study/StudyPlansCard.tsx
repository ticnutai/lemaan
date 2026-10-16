import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Check, RotateCcw, Trash2, ChevronDown, ChevronUp, BookOpen, Layout, RefreshCw, Pencil, ExternalLink,
  BookMarked, Scroll, Scale, Music, Star, PenLine, Library, Brain, Repeat, X, Calendar,
  Circle, Grid2x2, Columns3, Table2, Rows3, Archive,
} from "lucide-react";
import { ReviewScheduleDialog } from "@/components/settings/ReviewScheduleSettings";
import { PlanScheduleView } from "@/components/study/PlanScheduleView";
import { useStudy } from "@/lib/study/store";
import { cn, calcEtaDate } from "@/lib/utils";
import { toHebrewDate, fromHebrewDate, hebrewYearGematriya, HEB_MONTHS, datePickerValues } from "@/lib/hebrewDate";
import type { GeneralPlanType, GeneralStudyPlan, PlanReview, ReviewScheduleType, ReviewSpacingMode, ShasUnit, MishnaUnit } from "@/lib/study/types";
import { getPlanUnitsForDate } from "@/lib/study/planSchedule";
import { SHAS_BAVLI, SEDARIM } from "@/lib/study/shasData";
import { unitsPerDaf, totalUnitsInMasechta, unitRhythmHint, toHebrewNum, generateShasUnitsFlat } from "@/lib/study/shasFormat";
import { fullDafNamesForMasechet, fullAmudNamesForDaf, PATH_SEP } from "@/lib/study/shasGen";
import { MISHNAYOT_DATA } from "@/lib/study/mishnayotData";
import { generateMishnayotUnitsFlat, countUnitsForMasechet } from "@/lib/study/mishnaPlanUnits";
import { CATEGORY_TEMPLATES } from "@/lib/study/categoryTemplates";
import type { CategoryTemplateNode } from "@/lib/study/categoryTemplates";
import { QualityButtons } from "./QualityButtons";
import { GridPickerPopover } from "./HebrewGridPicker";

// ─── Shared helpers ──────────────────────────────────────────────────────────
function inferShasUnit(plan: GeneralStudyPlan): ShasUnit {
  if (plan.shasUnit) return plan.shasUnit;
  const sample = plan.units.find((u) => !!u)?.trim() ?? "";
  if (/ע"[אב]\s+[אב]['׳]/.test(sample)) return "half";
  if (/ע"[אב]/.test(sample)) return "amud";
  return "daf";
}

/** Returns the unit the plan SHOULD be on today, respecting anchorDate/anchorPosition. */
function getCalendarUnitForToday(plan: GeneralStudyPlan): string | null {
  const units = getPlanUnitsForDate(plan, new Date());
  return units[0] ?? null;
}

// ─── Template Data ────────────────────────────────────────────────────────────

interface PlanGroup { name: string; units: string[]; }

const INITIAL_VISIBLE_UNITS = 120;
const LOAD_MORE_UNITS_STEP = 180;
const AUTO_EXPAND_THRESHOLD = 180;

function splitUnitPath(unit: string): { trail: string; headline: string } {
  const parts = unit.split(" · ").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { trail: "", headline: unit };
  if (parts.length === 2) return { trail: parts[0], headline: parts[1] };
  return { trail: parts.slice(0, -2).join(" · "), headline: parts.slice(-2).join(" · ") };
}

const CHUMASH_GROUPS: PlanGroup[] = [
  { name: "ספר בראשית", units: ["בראשית","נח","לך לך","וירא","חיי שרה","תולדות","ויצא","וישלח","וישב","מקץ","ויגש","ויחי"] },
  { name: "ספר שמות",   units: ["שמות","וארא","בא","בשלח","יתרו","משפטים","תרומה","תצוה","כי תשא","ויקהל","פקודי"] },
  { name: "ספר ויקרא",  units: ["ויקרא","צו","שמיני","תזריע","מצורע","אחרי מות","קדושים","אמור","בהר","בחוקותי"] },
  { name: "ספר במדבר",  units: ["במדבר","נשא","בהעלותך","שלח","קורח","חקת","בלק","פינחס","מטות","מסעי"] },
  { name: "ספר דברים",  units: ["דברים","ואתחנן","עקב","ראה","שופטים","כי תצא","כי תבוא","נצבים","וילך","האזינו","וזאת הברכה"] },
];

function normalizeRambamNodeName(name: string): string {
  return name.startsWith("סימן ") ? name.replace("סימן ", "פרק ") : name;
}

function collectLeafUnits(
  node: CategoryTemplateNode,
  path: string[] = [],
  normalizeName?: (name: string) => string,
): string[] {
  const current = normalizeName ? normalizeName(node.name) : node.name;
  const nextPath = [...path, current];

  if (!node.children || node.children.length === 0) {
    return [nextPath.join(" · ")];
  }

  return node.children.flatMap((child) => collectLeafUnits(child, nextPath, normalizeName));
}

function buildDetailedGroups(templateId: "rambam" | "shulchan_aruch"): PlanGroup[] {
  const template = CATEGORY_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return [];

  const normalize = templateId === "rambam" ? normalizeRambamNodeName : undefined;

  return template.roots.map((root) => ({
    name: root.name,
    // שמירת ה-root בשם היחידה מונעת כפילויות בין חלקים/ספרים שונים.
    units:
      root.children && root.children.length > 0
        ? root.children.flatMap((child) => collectLeafUnits(child, [root.name], normalize))
        : [normalize ? normalize(root.name) : root.name],
  }));
}

const detailedGroupsCache: Partial<Record<"rambam" | "shulchan_aruch", PlanGroup[]>> = {};

function getDetailedGroups(templateId: "rambam" | "shulchan_aruch"): PlanGroup[] {
  if (detailedGroupsCache[templateId]) return detailedGroupsCache[templateId] ?? [];
  const groups = buildDetailedGroups(templateId);
  detailedGroupsCache[templateId] = groups;
  return groups;
}

const NACH_GROUPS: PlanGroup[] = [
  { name: 'נביאים ראשונים', units: ["יהושע","שופטים","שמואל א","שמואל ב","מלכים א","מלכים ב"] },
  { name: 'נביאים אחרונים', units: ["ישעיהו","ירמיהו","יחזקאל","הושע","יואל","עמוס","עובדיה","יונה","מיכה","נחום","חבקוק","צפניה","חגי","זכריה","מלאכי"] },
  { name: 'כתובים',          units: ["תהלים","משלי","איוב","שיר השירים","רות","איכה","קהלת","אסתר","דניאל","עזרא","נחמיה","דברי הימים א","דברי הימים ב"] },
];

const TEHILLIM_GROUPS: PlanGroup[] = [
  { name: "ספר א  (א–מא)",    units: Array.from({ length: 41 }, (_, i) => `מזמור ${toHebrewNum(i + 1)}`) },
  { name: "ספר ב  (מב–עב)",   units: Array.from({ length: 31 }, (_, i) => `מזמור ${toHebrewNum(i + 42)}`) },
  { name: "ספר ג  (עג–פט)",   units: Array.from({ length: 17 }, (_, i) => `מזמור ${toHebrewNum(i + 73)}`) },
  { name: "ספר ד  (צ–קו)",    units: Array.from({ length: 17 }, (_, i) => `מזמור ${toHebrewNum(i + 90)}`) },
  { name: "ספר ה  (קז–קנ)",   units: Array.from({ length: 44 }, (_, i) => `מזמור ${toHebrewNum(i + 107)}`) },
];

interface TemplateDefinition {
  id: GeneralPlanType | "shas";
  label: string;
  description: string;
  icon: ReactNode;
  defaultPace: number;
  groups?: PlanGroup[];
  groupsLoader?: () => PlanGroup[];
}

function ShasBookIcon({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border-[3px] border-gold text-gold",
        size === "md" ? "h-9 w-9" : "h-7 w-7",
      )}
    >
      <BookOpen className={size === "md" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} strokeWidth={2.4} />
    </span>
  );
}

const TEMPLATES: TemplateDefinition[] = [
  { id: "shas",             label: 'ש"ס בבלי',       description: "39 מסכתות עם מעקב דף/עמוד", icon: <ShasBookIcon size="md" />, defaultPace: 1, groups: [] },
  { id: "mishnayot",        label: "ששה סדרי משנה",   description: "63 מסכתות — לפי פרקים או משניות", icon: <BookMarked className="h-8 w-8 text-navy" />, defaultPace: 1, groups: [] },
  { id: "chumash",          label: "חומש",            description: "54 פרשות השבוע",   icon: <BookOpen className="h-8 w-8 text-navy" />, defaultPace: 1 / 7,  groups: CHUMASH_GROUPS },
  { id: "rambam",           label: 'רמב"ם',            description: "מבנה מפורט: ספר > הלכה > פרק", icon: <Scroll className="h-8 w-8 text-navy" />, defaultPace: 1 / 7,  groupsLoader: () => getDetailedGroups("rambam") },
  { id: "shulchan_aruch",   label: 'שולחן ערוך',       description: "מבנה מפורט: חלק > הלכה > סימן > סעיף", icon: <Scale className="h-8 w-8 text-navy" />, defaultPace: 1 / 7,  groupsLoader: () => getDetailedGroups("shulchan_aruch") },
  { id: "tehillim",         label: "תהלים",            description: "150 מזמורים",        icon: <Music className="h-8 w-8 text-navy" />, defaultPace: 1,      groups: TEHILLIM_GROUPS },
  { id: "nach",             label: 'נ"ך',              description: "34 ספרים",           icon: <BookMarked className="h-8 w-8 text-navy" />, defaultPace: 1 / 7,  groups: NACH_GROUPS },
  { id: "custom",           label: "אישי",             description: "תוכנית מותאמת אישית", icon: <PenLine className="h-8 w-8 text-navy" />, defaultPace: 1,    groups: [] },
  { id: "masechta_review",  label: "חזרות מסכתות",    description: "לוח חזרות SRS / קבוע / ידני", icon: <RefreshCw className="h-8 w-8 text-navy" />, defaultPace: 1, groups: [] },
  { id: "deck_review",       label: "חזרה על מערכות",  description: "בחר מערכות שאלות לחזרה",     icon: <Brain className="h-8 w-8 text-navy" />, defaultPace: 1, groups: [] },
];

function resolveTemplateGroups(t: TemplateDefinition): PlanGroup[] {
  if (t.groups) return t.groups;
  if (t.groupsLoader) return t.groupsLoader();
  return [];
}

const PACE_OPTIONS = [
  { value: 3,    label: "3 ביום" },
  { value: 2,    label: "2 ביום" },
  { value: 1,    label: "1 ביום" },
  { value: 2/7,  label: "2 לשבוע" },
  { value: 1/7,  label: "1 לשבוע" },
  { value: 1/30, label: "1 לחודש" },
];

function formatPace(upd: number, plan?: GeneralStudyPlan): string {
  if (upd >= 1) {
    if (plan?.planType === "shas") {
      const unit = inferShasUnit(plan);
      const singular = unit === "daf" ? "דף" : unit === "amud" ? "עמוד" : "חצי עמוד";
      const plural = unit === "daf" ? "דפים" : unit === "amud" ? "עמודים" : "חצאי עמוד";
      if (upd === 1) return `${singular} ליום`;
      return `${upd} ${plural} ליום`;
    }
    if (plan?.planType === "mishnayot") {
      const u = plan.mishnaUnit ?? "mishna";
      const singular = u === "perek" ? "פרק" : "משנה";
      const plural = u === "perek" ? "פרקים" : "משניות";
      if (upd === 1) return `${singular} ליום`;
      return `${upd} ${plural} ליום`;
    }
    return `${upd} ביום`;
  }
  if (Math.abs(upd - 2 / 7) < 0.01) return "2 לשבוע";
  if (Math.abs(upd - 1 / 7) < 0.01) return "1 לשבוע";
  if (Math.abs(upd - 1 / 30) < 0.01) return "1 לחודש";
  return `${upd.toFixed(2)} ביום`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const REVIEW_INDEX_LABELS = ["", "חזרה א׳ (יום)", "חזרה ב׳ (שבוע)", "חזרה ג׳ (חודש)", "חזרה ד׳ (רבעון)"];
const PLAN_VIEW_KEY = "study-plans-card-view-v1";

// 0=Sun … 6=Sat — labels in Hebrew day order
const DAY_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

/** Picker for skip weekdays and recurring MM-DD dates */
function SkipDaysPicker({
  skipWeekdays, setSkipWeekdays,
  skipDates, setSkipDates,
}: {
  skipWeekdays: number[];
  setSkipWeekdays: (v: number[]) => void;
  skipDates: string[];
  setSkipDates: (v: string[]) => void;
}) {
  const [dateInput, setDateInput] = useState("");

  const toggleDay = (d: number) =>
    setSkipWeekdays(skipWeekdays.includes(d) ? skipWeekdays.filter((x) => x !== d) : [...skipWeekdays, d]);

  const toggleFriSat = () => {
    const bothSet = [5, 6].every((d) => skipWeekdays.includes(d));
    setSkipWeekdays(bothSet ? skipWeekdays.filter((d) => ![5, 6].includes(d)) : Array.from(new Set([...skipWeekdays, 5, 6])));
  };

  const addDate = () => {
    const v = dateInput.trim();
    if (/^\d{2}-\d{2}$/.test(v) && !skipDates.includes(v)) {
      setSkipDates([...skipDates, v]);
      setDateInput("");
    }
  };

  return (
    <div className="space-y-2 border-t border-gold/15 pt-3">
      <label className="text-xs font-semibold text-muted-foreground">ימי דילוג (לא נחשבים במניין)</label>
      <div className="flex items-center gap-1 flex-wrap justify-end">
        <button
          type="button"
          onClick={toggleFriSat}
          className={cn(
            "text-xs px-2.5 py-1 rounded-lg border-2 transition-colors font-semibold",
            [5, 6].every((d) => skipWeekdays.includes(d))
              ? "border-gold bg-gold/20 text-gold"
              : "border-gold/30 text-muted-foreground hover:border-gold/50",
          )}
        >
          שישי+שבת
        </button>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <button
            type="button"
            key={d}
            onClick={() => toggleDay(d)}
            className={cn(
              "text-xs w-8 py-1 rounded-lg border-2 transition-colors",
              skipWeekdays.includes(d)
                ? "border-gold bg-gold/20 text-gold font-semibold"
                : "border-gold/30 text-muted-foreground hover:border-gold/50",
            )}
          >
            {DAY_SHORT[d]}
          </button>
        ))}
      </div>

      {/* Recurring special dates */}
      <div className="flex items-center gap-1 justify-end" dir="ltr">
        <button
          type="button"
          onClick={addDate}
          className="text-xs px-2 py-1 rounded-lg border border-gold/40 hover:bg-gold/10 transition-colors"
        >
          + הוסף
        </button>
        <input
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addDate()}
          placeholder="MM-DD"
          className="w-20 text-xs px-2 py-1 rounded-lg border border-gold/30 text-center bg-background"
        />
        <span className="text-[11px] text-muted-foreground">חגים חוזרים:</span>
      </div>
      {skipDates.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-end">
          {skipDates.map((date) => (
            <span key={date} className="text-[10px] bg-gold/10 text-gold border border-gold/30 rounded px-1.5 py-0.5 flex items-center gap-1">
              {date}
              <button type="button" onClick={() => setSkipDates(skipDates.filter((d) => d !== date))} className="hover:text-destructive leading-none">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Returns: 'overdue' | 'due-soon' | 'ok' | 'none' */
function retentionStatus(unit: string, planId: string, planReviews: PlanReview[]): "overdue" | "due-soon" | "ok" | "none" {
  const today = todayStr();
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  const soonStr = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;

  const pending = planReviews.filter((r) => r.planId === planId && r.unit === unit && !r.doneAt);
  if (pending.length === 0) return "none";
  const overdue = pending.some((r) => r.dueDate < today);
  if (overdue) return "overdue";
  const dueSoon = pending.some((r) => r.dueDate <= soonStr);
  if (dueSoon) return "due-soon";
  return "ok";
}

// ─── Quick Review Dialog ──────────────────────────────────────────────────────

function QuickReviewDialog({
  open,
  planId,
  planTitle,
  onClose,
}: {
  open: boolean;
  planId: string;
  planTitle: string;
  onClose: () => void;
}) {
  const { state, markPlanReviewDone, undoPlanReviewDone, postponePlanReview, setPlanReviewNote } = useStudy();
  const today = todayStr();
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const dueReviews = useMemo(() => {
    return (state.planReviews ?? [])
      .filter((r) => r.planId === planId && r.dueDate <= today && !r.doneAt)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [state.planReviews, planId, today]);

  const doneToday = useMemo(() => {
    return (state.planReviews ?? [])
      .filter((r) => r.planId === planId && r.doneAt === today);
  }, [state.planReviews, planId, today]);

  const upcomingReviews = useMemo(() => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const soonStr = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    return (state.planReviews ?? [])
      .filter((r) => r.planId === planId && !r.doneAt && r.dueDate > today && r.dueDate <= soonStr)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [state.planReviews, planId, today]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="gold-frame max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-right">
            חזרה מהירה — {planTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            חלון חזרה מהירה הכולל חזרות ממתינות, סיכום חזרות מהיום וחזרות קרובות.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Due now */}
          {dueReviews.length === 0 && doneToday.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6 border-2 border-dashed border-gold/30 rounded-xl">
              <Check className="h-8 w-8 mx-auto text-gold/40 mb-2" />
              <p>אין חזרות ממתינות לתוכנית זו</p>
            </div>
          ) : (
            <>
              {dueReviews.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground text-right">
                    ממתין לחזרה ({dueReviews.length})
                  </p>
                  {dueReviews.map((r) => (
                    <div key={r.id} className={cn(
                      "rounded-xl border-2 px-3 py-2.5 space-y-2",
                      r.dueDate < today ? "border-destructive/50 bg-destructive/5" : "border-gold/40",
                    )}>
                      <div className="text-right space-y-0.5">
                        <p className="text-sm font-semibold">{r.unit}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {REVIEW_INDEX_LABELS[r.reviewIndex] ?? `חזרה ${r.reviewIndex}`}
                          {r.dueDate < today && (
                            <span className="text-destructive mr-1">
                              · פגר {Math.ceil((Date.now() - new Date(r.dueDate + "T00:00:00").getTime()) / 86400000)} ימים
                            </span>
                          )}
                        </p>
                      </div>
                      <QualityButtons onGrade={(q) => markPlanReviewDone(r.id, q)} size="xs" />
                      {r.note && editingNoteId !== r.id && (
                        <div className="text-[11px] text-right rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-1 flex items-start justify-between gap-2">
                          <button
                            onClick={() => { setEditingNoteId(r.id); setNoteDraft(r.note ?? ""); }}
                            className="text-amber-700 hover:text-amber-900 text-[10px] shrink-0"
                          >✎ ערוך</button>
                          <span className="flex-1 text-amber-900 dark:text-amber-200">📝 {r.note}</span>
                        </div>
                      )}
                      {editingNoteId === r.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setPlanReviewNote(r.id, noteDraft); setEditingNoteId(null); }}
                            className="text-[10px] px-2 py-1 rounded bg-emerald-500 text-white hover:bg-emerald-600"
                          >שמור</button>
                          <button
                            onClick={() => setEditingNoteId(null)}
                            className="text-[10px] px-2 py-1 rounded border border-muted-foreground/30 hover:bg-muted"
                          >בטל</button>
                          <input
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="הערה לחזרה (זיכרון, רמז...)"
                            className="flex-1 text-[11px] px-2 py-1 rounded border border-gold/40 text-right bg-background"
                            autoFocus
                          />
                        </div>
                      ) : !r.note && (
                        <button
                          onClick={() => { setEditingNoteId(r.id); setNoteDraft(""); }}
                          className="w-full text-[10px] text-muted-foreground hover:text-foreground py-0.5 rounded border border-dashed border-muted-foreground/20 hover:bg-muted/40 transition-colors"
                        >
                          + הוסף הערה
                        </button>
                      )}
                      <button
                        onClick={() => postponePlanReview(r.id, 1)}
                        className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1 rounded border border-dashed border-muted-foreground/30 hover:bg-muted/40 transition-colors"
                      >
                        ⏭ דחה למחר
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {doneToday.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gold text-right">
                    הושלמו היום ✓ ({doneToday.length})
                  </p>
                  {doneToday.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 text-xs px-2">
                      <button
                        onClick={() => undoPlanReviewDone(r.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="בטל"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                      <span className="text-muted-foreground line-through flex-1 text-right">
                        {r.unit} — {REVIEW_INDEX_LABELS[r.reviewIndex] ?? `חזרה ${r.reviewIndex}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Upcoming */}
          {upcomingReviews.length > 0 && (
            <div className="space-y-1 border-t border-gold/20 pt-3">
              <p className="text-xs font-semibold text-muted-foreground text-right">
                קרובות (7 ימים הבאים)
              </p>
              {upcomingReviews.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs px-2 py-1">
                  <span className="text-muted-foreground">{toHebrewDate(r.dueDate)}</span>
                  <span className="text-right">
                    {r.unit} — {REVIEW_INDEX_LABELS[r.reviewIndex] ?? `חזרה ${r.reviewIndex}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Review Intervals Picker (per-plan) ──────────────────────────────────────

const PLAN_PRESETS = [
  { id: "balanced", label: "מאוזן", emoji: "⭐", intervals: [1, 3, 7, 14, 30], desc: "1,3,7,14,30" },
  { id: "tight", label: "צפוף", emoji: "⏱️", intervals: [1, 2, 7, 14, 30], desc: "1,2,7,14,30" },
  { id: "wide", label: "מרווח", emoji: "🌱", intervals: [1, 4, 10, 21, 45], desc: "1,4,10,21,45" },
  { id: "intense", label: "אינטנסיבי", emoji: "🔥", intervals: [1, 2, 4, 7, 14, 30, 90], desc: "7 חזרות" },
] as const;

function normalizeIntervalsList(intervals: readonly number[]): number[] {
  const cleaned = intervals.map((n) => Math.max(1, Math.round(n))).filter((n) => Number.isFinite(n));
  return Array.from(new Set(cleaned)).sort((a, b) => a - b);
}

function intervalsEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function adaptIntervalsToRepetitions(baseIntervals: readonly number[], repetitions: number): number[] {
  const target = Math.max(1, Math.round(repetitions));
  const base = normalizeIntervalsList(baseIntervals.length ? baseIntervals : [1, 3, 7, 14, 30]);
  if (target <= base.length) return base.slice(0, target);

  const out = [...base];
  const prev = out[out.length - 2] ?? Math.max(1, out[out.length - 1] - 1);
  const last = out[out.length - 1];
  const rawGap = Math.max(1, last - prev);
  let gap = rawGap;

  while (out.length < target) {
    const candidate = Math.max(out[out.length - 1] + 1, Math.round(out[out.length - 1] + gap));
    out.push(candidate);
    gap = Math.max(gap + 1, Math.round(gap * 1.6));
  }

  return out;
}

function ReviewIntervalsPicker({
  value,
  repetitions,
  onChange,
}: {
  value: number[] | null;   // null = inherit global
  repetitions: number;
  onChange: (v: number[] | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addInput, setAddInput] = useState("");

  const activePreset = PLAN_PRESETS.find((p) => {
    const adapted = adaptIntervalsToRepetitions(p.intervals, repetitions);
    return value !== null && intervalsEqual(normalizeIntervalsList(value), adapted);
  });

  const current: number[] = value ?? [1, 3, 7, 14, 30];

  const removeDay = (day: number) => {
    const next = current.filter((d) => d !== day);
    onChange(next.length ? next : value);
  };

  const addDay = () => {
    const days = addInput.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0 && !current.includes(n));
    if (days.length) onChange([...current, ...days].sort((a,b)=>a-b));
    setAddInput("");
  };

  return (
    <div className="space-y-2 border-2 border-gold/30 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Repeat className="h-3 w-3" />
          {expanded ? "סגור" : "עורך מותאם אישית"}
        </button>
        <label className="text-xs font-semibold text-muted-foreground">מרווחי חזרה לתוכנית</label>
      </div>

      {/* Preset buttons */}
      <div className="flex gap-1.5 flex-wrap justify-end">
        {PLAN_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onChange(adaptIntervalsToRepetitions(p.intervals ? [...p.intervals] : [], repetitions));
              setExpanded(false);
            }}
            className={cn(
              "flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-xl border-2 transition-colors font-semibold",
              activePreset?.id === p.id
                ? "border-gold bg-gold/20 text-foreground"
                : "border-gold/30 text-muted-foreground hover:border-gold/60",
            )}
          >
            <span>{p.emoji}</span>
            {p.label}
            <span className="font-normal opacity-70">{adaptIntervalsToRepetitions(p.intervals, repetitions).join(",")}</span>
          </button>
        ))}
      </div>

      {/* Summary line */}
      {!expanded && (
        <div className="text-[10px] text-muted-foreground text-right">
          {value === null
            ? "יורש מרווחים גלובליים"
            : `ימים: ${[...value].sort((a,b)=>a-b).join(" · ")} (${value.length} חזרות)`}
        </div>
      )}

      {/* Custom editor */}
      {expanded && value !== null && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-lg border border-gold/30 bg-card/60">
            {[...current].sort((a,b)=>a-b).map((day) => (
              <span key={day} className="inline-flex items-center gap-1 bg-gold/15 border border-gold/50 text-xs font-semibold px-2 py-0.5 rounded-lg">
                יום {day}
                <button type="button" onClick={() => removeDay(day)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2" dir="rtl">
            <Button type="button" size="sm" onClick={addDay} className="bg-gradient-navy text-primary-foreground rounded-lg h-7 px-2.5 shrink-0">
              <Plus className="h-3 w-3" />הוסף
            </Button>
            <Input value={addInput} onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDay(); } }}
              placeholder="21 או 21, 60, 90" className="border border-gold/40 text-right h-7 text-xs" dir="ltr" />
          </div>
        </div>
      )}
    </div>
  );
}

type PlanReviewPolicy = {
  reviewEnabled: boolean;
  reviewRepetitions: number;
  reviewScheduleType: ReviewScheduleType;
  reviewSpacingMode: ReviewSpacingMode;
  fixedIntervalDays: number;
  reviewIntervals: number[];
};

const DEFAULT_PLAN_REVIEW_INTERVALS = [1, 3, 7, 14, 30];

function PlanReviewPolicyEditor({
  value,
  onChange,
}: {
  value: PlanReviewPolicy;
  onChange: (next: PlanReviewPolicy) => void;
}) {
  const set = <K extends keyof PlanReviewPolicy>(key: K, v: PlanReviewPolicy[K]) => onChange({ ...value, [key]: v });

  const normalizedIntervals = useMemo(() => {
    return normalizeIntervalsList(value.reviewIntervals ?? []);
  }, [value.reviewIntervals]);

  const previousRepetitions = useRef(value.reviewRepetitions);
  useEffect(() => {
    const current = Math.max(1, Math.round(value.reviewRepetitions));
    const changed = previousRepetitions.current !== current;
    previousRepetitions.current = current;
    if (!changed) return;
    if (!value.reviewEnabled) return;
    if (value.reviewScheduleType !== "srs") return;

    const base = normalizedIntervals.length ? normalizedIntervals : [...DEFAULT_PLAN_REVIEW_INTERVALS];
    const adapted = adaptIntervalsToRepetitions(base, current);
    if (!intervalsEqual(normalizedIntervals, adapted)) {
      set("reviewIntervals", adapted);
    }
  }, [
    value.reviewRepetitions,
    value.reviewEnabled,
    value.reviewScheduleType,
    normalizedIntervals,
  ]);

  return (
    <div className="space-y-3 border-2 border-gold/30 rounded-xl p-3 bg-card/30">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted-foreground">1. האם להפעיל חזרות לתוכנית?</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => set("reviewEnabled", false)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-lg border-2 transition-colors",
              !value.reviewEnabled ? "border-gold bg-gold/20 font-semibold" : "border-gold/30 text-muted-foreground hover:border-gold/60",
            )}
          >
            ללא חזרה
          </button>
          <button
            type="button"
            onClick={() => set("reviewEnabled", true)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-lg border-2 transition-colors",
              value.reviewEnabled ? "border-gold bg-gold/20 font-semibold" : "border-gold/30 text-muted-foreground hover:border-gold/60",
            )}
          >
            חזרה פעילה
          </button>
        </div>
      </div>

      {value.reviewEnabled && (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">2. כמה פעמים לחזור?</label>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {[3, 5, 7, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set("reviewRepetitions", n)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-lg border-2 transition-colors",
                    value.reviewRepetitions === n ? "border-gold bg-gold/20 font-semibold" : "border-gold/30 text-muted-foreground hover:border-gold/60",
                  )}
                >
                  {n}
                </button>
              ))}
              <Input
                type="number"
                min={1}
                max={30}
                value={value.reviewRepetitions}
                onChange={(e) => set("reviewRepetitions", Math.max(1, Math.min(30, parseInt(e.target.value || "1", 10))))}
                className="w-20 h-8 text-center border-gold/40"
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">3. מה המרווחים בין החזרות?</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {([
                { value: "srs", label: "פריסט/מותאם" },
                { value: "fixed_interval", label: "כל X ימים" },
                { value: "manual", label: "רשימה ידנית" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set("reviewScheduleType", opt.value)}
                  className={cn(
                    "rounded-lg border-2 px-2 py-1.5 text-xs transition-colors",
                    value.reviewScheduleType === opt.value ? "border-gold bg-gold/10 font-semibold" : "border-gold/30 text-muted-foreground hover:border-gold/60",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {value.reviewScheduleType !== "fixed_interval" && (
              <div className="space-y-1.5">
                <div className="flex gap-1.5 justify-end flex-wrap">
                  <button
                    type="button"
                    onClick={() => set("reviewSpacingMode", "from_start")}
                    className={cn(
                      "text-[11px] px-2 py-1 rounded-md border",
                      value.reviewSpacingMode === "from_start" ? "border-gold bg-gold/20 font-semibold" : "border-gold/30 text-muted-foreground",
                    )}
                  >
                    מהלימוד הראשוני
                  </button>
                  <button
                    type="button"
                    onClick={() => set("reviewSpacingMode", "between_reviews")}
                    className={cn(
                      "text-[11px] px-2 py-1 rounded-md border",
                      value.reviewSpacingMode === "between_reviews" ? "border-gold bg-gold/20 font-semibold" : "border-gold/30 text-muted-foreground",
                    )}
                  >
                    בין חזרה לחזרה
                  </button>
                </div>
                <ReviewIntervalsPicker
                  value={normalizedIntervals.length ? normalizedIntervals : [...DEFAULT_PLAN_REVIEW_INTERVALS]}
                  repetitions={value.reviewRepetitions}
                  onChange={(v) => set("reviewIntervals", (v ?? [...DEFAULT_PLAN_REVIEW_INTERVALS]).map((n) => Math.max(1, Math.round(n))).sort((a, b) => a - b))}
                />
                <p className="text-[11px] text-muted-foreground text-right">
                  המרווחים מותאמים אוטומטית לכמות החזרות שנבחרה. במצב "רשימה ידנית" אין דריסה אוטומטית.
                </p>
              </div>
            )}

            {value.reviewScheduleType === "fixed_interval" && (
              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs text-muted-foreground">ימים בין כל חזרה</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={value.fixedIntervalDays}
                  onChange={(e) => set("fixedIntervalDays", Math.max(1, Math.min(365, parseInt(e.target.value || "1", 10))))}
                  className="w-24 h-8 text-center border-gold/40"
                  dir="ltr"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Add Plan Dialog ──────────────────────────────────────────────────────────

function AddPlanDialog({
  open,
  onClose,
  onAdd,
  onAddShas,
  onAddMasecthaReview,
  onAddDeckReview,
  forceDeckReview = false,
  preselectedDeckIds = [],
  lockedDeckId,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (planType: GeneralPlanType, title: string, units: string[], unitsPerDay: number, skipWeekdays?: number[], skipDates?: string[], shasUnit?: ShasUnit, anchorDate?: string, anchorPosition?: { unitIndex: number }, reviewPolicy?: PlanReviewPolicy, mishnaUnit?: MishnaUnit) => void;
  onAddShas: (selectedMasechtos: string[], pagesPerDay: number, unit: ShasUnit, skipWeekdays?: number[], skipDates?: string[], anchorDate?: string, anchorPosition?: { masechta: string; daf: number; amud: 1 | 2 }) => void;
  onAddMasecthaReview: (title: string, units: string[], scheduleType: "srs" | "fixed_interval" | "manual", fixedIntervalDays?: number, manualReviewDates?: string[], linkedDeckId?: string) => void;
  onAddDeckReview: (title: string, deckIds: string[], reviewPolicy: PlanReviewPolicy) => void;
  forceDeckReview?: boolean;
  preselectedDeckIds?: string[];
  lockedDeckId?: string;
}) {
  const [step, setStep] = useState<"type" | "configure">("type");
  const [tpl, setTpl] = useState<TemplateDefinition | null>(null);
  const [title, setTitle] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [pace, setPace] = useState(1 / 7);
  const [customText, setCustomText] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [visibleUnitsByGroup, setVisibleUnitsByGroup] = useState<Record<string, number>>({});
  const [skipWeekdays, setSkipWeekdays] = useState<number[]>([]);
  const [skipDates, setSkipDates] = useState<string[]>([]);
  const [reviewPolicy, setReviewPolicy] = useState<PlanReviewPolicy>({
    reviewEnabled: true,
    reviewRepetitions: 5,
    reviewScheduleType: "srs",
    reviewSpacingMode: "from_start",
    fixedIntervalDays: 7,
    reviewIntervals: [...DEFAULT_PLAN_REVIEW_INTERVALS],
  });

  // Review-schedule dialog (shared for all plan types)
  const [reviewScheduleOpen, setReviewScheduleOpen] = useState(false);

  // Shas-specific state
  const [shasUnit, setShasUnit] = useState<ShasUnit>("daf");
  const [shasPagesPerDay, setShasPagesPerDay] = useState("1");
  const [shasSelectedMasechtos, setShasSelectedMasechtos] = useState<string[]>([]);

  // Mishnayot-specific state
  const [mishnaUnit, setMishnaUnit] = useState<MishnaUnit>("mishna");
  const [mishnaPerDay, setMishnaPerDay] = useState("1");
  const [mishnaSelectedMasechtos, setMishnaSelectedMasechtos] = useState<string[]>([]);

  // Anchor state
  const [anchorEnabled, setAnchorEnabled] = useState(false);
  const [anchorDate, setAnchorDate] = useState(""); // YYYY-MM-DD
  const [anchorMasechta, setAnchorMasechta] = useState("");
  const [anchorDaf, setAnchorDaf] = useState("2");
  const [anchorAmud, setAnchorAmud] = useState<1 | 2>(1);
  const [anchorMode, setAnchorMode] = useState<"gregorian" | "hebrew">("hebrew");
  const [hebDay, setHebDay] = useState("");
  const [hebMonth, setHebMonth] = useState("");
  const [hebYear, setHebYear] = useState(5786);

  const changeAnchorEnabled = (enabled: boolean) => {
    setAnchorEnabled(enabled);
    if (!enabled || anchorDate) return;
    const today = datePickerValues();
    setAnchorDate(today.gregorian);
    setHebDay(today.hebrewDay);
    setHebMonth(today.hebrewMonth);
    setHebYear(today.hebrewYear);
  };

  // Masechta-review form state
  const [mrItems, setMrItems] = useState<string[]>([]);
  const [mrMasechta, setMrMasechta] = useState("");
  const [mrScopeType, setMrScopeType] = useState<"masechta" | "perek" | "daf_range" | "custom">("masechta");
  const [mrScopeDetail, setMrScopeDetail] = useState("");
  const [mrScheduleType, setMrScheduleType] = useState<"srs" | "fixed_interval" | "manual">("srs");
  const [mrFixedDays, setMrFixedDays] = useState("30");
  const [mrManualDates, setMrManualDates] = useState<string[]>([]);
  const [mrManualDateInput, setMrManualDateInput] = useState("");
  const [mrLinkedDeckId, setMrLinkedDeckId] = useState("");

  // Deck-review form state
  const { state: drState } = useStudy();
  const decks = drState.decks ?? [];
  const [drSelectedDeckIds, setDrSelectedDeckIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !forceDeckReview) return;
    const template = TEMPLATES.find((t) => t.id === "deck_review");
    if (!template) return;
    setTpl(template);
    setStep("configure");
    const initialIds = Array.from(new Set([...(preselectedDeckIds ?? []), ...(lockedDeckId ? [lockedDeckId] : [])]));
    setDrSelectedDeckIds(initialIds);
    const names = initialIds
      .map((id) => decks.find((d) => d.id === id)?.name)
      .filter(Boolean);
    setTitle(names.length > 0 ? `חזרה על ${names[0]}` : "חזרה על מערכות");
  }, [open, forceDeckReview, preselectedDeckIds, lockedDeckId, decks]);

  const reset = useCallback(() => {
    setStep("type");
    setTpl(null);
    setTitle("");
    setSelectedUnits([]);
    setPace(1 / 7);
    setCustomText("");
    setUnitSearch("");
    setExpandedGroups(new Set());
    setVisibleUnitsByGroup({});
    setShasUnit("daf");
    setShasPagesPerDay("1");
    setShasSelectedMasechtos([]);
    setSkipWeekdays([]);
    setSkipDates([]);
    setAnchorEnabled(false);
    setAnchorDate("");
    setAnchorMasechta("");
    setAnchorDaf("2");
    setAnchorAmud(1);
    setAnchorMode("hebrew");
    setHebDay("");
    setHebMonth("");
    setHebYear(5786);
    setMrItems([]);
    setMrMasechta(SHAS_BAVLI[0]?.name ?? "");
    setMrScopeType("masechta");
    setMrScopeDetail("");
    setMrScheduleType("srs");
    setMrFixedDays("30");
    setMrManualDates([]);
    setMrManualDateInput("");
    setMrLinkedDeckId("");
    setDrSelectedDeckIds([]);
    setReviewPolicy({
      reviewEnabled: true,
      reviewRepetitions: 5,
      reviewScheduleType: "srs",
      reviewSpacingMode: "from_start",
      fixedIntervalDays: 7,
      reviewIntervals: [...DEFAULT_PLAN_REVIEW_INTERVALS],
    });
  }, []);

  const handleClose = () => { onClose(); reset(); };

  const handleSelectTemplate = (t: TemplateDefinition) => {
    const groups = resolveTemplateGroups(t);
    const resolved: TemplateDefinition = { ...t, groups };
    setTpl(resolved);

    if (resolved.id === "shas") {
      setShasSelectedMasechtos([]);
      setShasUnit("daf");
      setShasPagesPerDay("1");
      setStep("configure");
      return;
    }

    if (resolved.id === "masechta_review") {
      setMrItems([]);
      setMrMasechta(SHAS_BAVLI[0]?.name ?? "");
      setMrScopeType("masechta");
      setMrScopeDetail("");
      setMrScheduleType("srs");
      setMrFixedDays("30");
      setMrManualDates([]);
      setMrManualDateInput("");
      setMrLinkedDeckId("");
      setTitle("חזרות מסכתות");
      setStep("configure");
      return;
    }

    if (resolved.id === "deck_review") {
      setDrSelectedDeckIds([]);
      setTitle("חזרה על מערכות");
      setStep("configure");
      return;
    }

    if (resolved.id === "mishnayot") {
      setMishnaSelectedMasechtos([]);
      setMishnaUnit("mishna");
      setMishnaPerDay("1");
      setStep("configure");
      return;
    }

    const allUnits = groups.flatMap((g) => g.units);
    const initialVisible = Object.fromEntries(
      groups.map((g) => [g.name, Math.min(INITIAL_VISIBLE_UNITS, g.units.length)]),
    ) as Record<string, number>;

    setSelectedUnits(allUnits);
    setTitle(resolved.label);
    setPace(resolved.defaultPace);
    setUnitSearch("");
    setVisibleUnitsByGroup(initialVisible);
    setExpandedGroups(
      allUnits.length <= AUTO_EXPAND_THRESHOLD
        ? new Set(groups.map((g) => g.name))
        : new Set(groups.length > 0 ? [groups[0].name] : []),
    );
    setStep("configure");
  };

  const selectedUnitSet = useMemo(() => new Set(selectedUnits), [selectedUnits]);
  const allTemplateUnits = useMemo(() => (tpl?.groups ?? []).flatMap((g) => g.units), [tpl]);
  const normalizedUnitSearch = useMemo(() => unitSearch.trim().toLowerCase(), [unitSearch]);

  const filteredUnitsByGroup = useMemo(() => {
    const query = normalizedUnitSearch;
    const entries = (tpl?.groups ?? []).map((group) => {
      if (!query) return [group.name, group.units] as const;
      return [group.name, group.units.filter((u) => u.toLowerCase().includes(query))] as const;
    });
    return Object.fromEntries(entries) as Record<string, string[]>;
  }, [tpl, normalizedUnitSearch]);

  const groupsForDisplay = useMemo(() => {
    if (!tpl?.groups) return [];
    if (!normalizedUnitSearch) return tpl.groups;
    return tpl.groups.filter((g) => (filteredUnitsByGroup[g.name]?.length ?? 0) > 0);
  }, [tpl, normalizedUnitSearch, filteredUnitsByGroup]);

  const allFilteredTemplateUnits = useMemo(
    () => groupsForDisplay.flatMap((g) => filteredUnitsByGroup[g.name] ?? g.units),
    [groupsForDisplay, filteredUnitsByGroup],
  );

  const bulkTargetUnits = normalizedUnitSearch ? allFilteredTemplateUnits : allTemplateUnits;
  const allBulkTargetSelected =
    bulkTargetUnits.length > 0 && bulkTargetUnits.every((u) => selectedUnitSet.has(u));
  const selectedVisibleCount = bulkTargetUnits.reduce(
    (count, u) => count + (selectedUnitSet.has(u) ? 1 : 0),
    0,
  );

  const toggleGroupExpand = (group: PlanGroup) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group.name)) next.delete(group.name);
      else next.add(group.name);
      return next;
    });
    setVisibleUnitsByGroup((prev) =>
      prev[group.name]
        ? prev
        : { ...prev, [group.name]: Math.min(INITIAL_VISIBLE_UNITS, group.units.length) },
    );
  };

  const loadMoreInGroup = (group: PlanGroup) => {
    setVisibleUnitsByGroup((prev) => ({
      ...prev,
      [group.name]: Math.min(
        group.units.length,
        (prev[group.name] ?? INITIAL_VISIBLE_UNITS) + LOAD_MORE_UNITS_STEP,
      ),
    }));
  };

  const toggleGroupSelect = (groupName: string) => {
    const grp = tpl?.groups?.find((g) => g.name === groupName);
    if (!grp) return;
    const targetUnits = normalizedUnitSearch
      ? (filteredUnitsByGroup[groupName] ?? [])
      : grp.units;
    if (targetUnits.length === 0) return;

    const allSel = targetUnits.every((u) => selectedUnitSet.has(u));
    if (allSel) {
      const targetSet = new Set(targetUnits);
      setSelectedUnits((prev) => prev.filter((u) => !targetSet.has(u)));
    }
    else setSelectedUnits((prev) => Array.from(new Set([...prev, ...targetUnits])));
  };

  const handleStart = () => {
    if (!tpl) return;
    if (tpl.id === "shas") {
      if (shasSelectedMasechtos.length === 0) return;
      const ordered = SHAS_BAVLI.filter((m) => shasSelectedMasechtos.includes(m.name)).map((m) => m.name);
      const paceNum = parseInt(shasPagesPerDay, 10) || 1;
      const flatUnits = generateShasUnitsFlat(ordered, shasUnit);

      // Convert masechta/daf/amud anchor → flat unitIndex for GeneralStudyPlan
      let resolvedAnchorDate: string | undefined;
      let resolvedAnchorPosition: { unitIndex: number } | undefined;
      if (anchorEnabled && anchorDate) {
        resolvedAnchorDate = anchorDate;
        const effMasechta = anchorMasechta || ordered[0] || "";
        const effDaf = parseInt(anchorDaf, 10) || 2;
        const dafHeb = toHebrewNum(effDaf) + "'";
        let targetUnit: string;
        if (shasUnit === "daf") {
          targetUnit = `${effMasechta} ${dafHeb}`;
        } else if (shasUnit === "amud") {
          targetUnit = `${effMasechta} ${dafHeb} ${anchorAmud === 1 ? '\u05e2"\u05d0' : '\u05e2"\u05d1'}`;
        } else {
          targetUnit = `${effMasechta} ${dafHeb} ${anchorAmud === 1 ? '\u05e2"\u05d0 \u05d0\'' : '\u05e2"\u05d1 \u05d0\''}` ;
        }
        const idx = flatUnits.indexOf(targetUnit);
        resolvedAnchorPosition = idx >= 0 ? { unitIndex: idx } : undefined;
        console.log("[handleStart shas anchor]",
          "effMasechta=", effMasechta, "effDaf=", effDaf, "amud=", anchorAmud,
          "shasUnit=", shasUnit, "targetUnit=", targetUnit,
          "idx=", idx, "flatUnits[0..2]=", flatUnits.slice(0, 3));
      }

      onAdd(
        "shas",
        `ש"ס בבלי — ${ordered.slice(0, 2).join(", ")}${ordered.length > 2 ? ` +${ordered.length - 2}` : ""}`,
        flatUnits,
        paceNum,
        skipWeekdays.length ? skipWeekdays : undefined,
        skipDates.length ? skipDates : undefined,
        shasUnit,
        resolvedAnchorDate,
        resolvedAnchorPosition,
        reviewPolicy,
      );
      handleClose();
      return;
    }
    if (tpl.id === "mishnayot") {
      if (mishnaSelectedMasechtos.length === 0) return;
      const orderedMas = MISHNAYOT_DATA.flatMap((s) => s.masechtot.map((m) => m.name))
        .filter((n) => mishnaSelectedMasechtos.includes(n));
      const flatUnits = generateMishnayotUnitsFlat(orderedMas, mishnaUnit);
      if (flatUnits.length === 0) return;
      const paceNum = parseInt(mishnaPerDay, 10) || 1;
      const unitLabel = mishnaUnit === "perek" ? "פרקים" : "משניות";
      const planTitle = `משניות — ${orderedMas.slice(0, 2).join(", ")}${orderedMas.length > 2 ? ` +${orderedMas.length - 2}` : ""} · ${paceNum} ${unitLabel}/יום`;
      onAdd(
        "mishnayot",
        planTitle,
        flatUnits,
        paceNum,
        skipWeekdays.length ? skipWeekdays : undefined,
        skipDates.length ? skipDates : undefined,
        undefined,
        undefined,
        undefined,
        reviewPolicy,
        mishnaUnit,
      );
      handleClose();
      return;
    }
    if (tpl.id === "masechta_review") {
      if (mrItems.length === 0 || !title.trim()) return;
      onAddMasecthaReview(
        title.trim(),
        mrItems,
        mrScheduleType,
        mrScheduleType === "fixed_interval" ? (parseInt(mrFixedDays, 10) || 30) : undefined,
        mrScheduleType === "manual" ? mrManualDates : undefined,
        mrLinkedDeckId || undefined,
      );
      handleClose();
      return;
    }
    if (tpl.id === "deck_review") {
      const ids = Array.from(new Set([...drSelectedDeckIds, ...(lockedDeckId ? [lockedDeckId] : [])]));
      if (ids.length === 0 || !title.trim()) return;
      onAddDeckReview(title.trim(), ids, reviewPolicy);
      handleClose();
      return;
    }
    if (tpl.id === "custom") {
      const units = customText.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!units.length || !title.trim()) return;
      onAdd("custom", title.trim(), units, pace, skipWeekdays.length ? skipWeekdays : undefined, skipDates.length ? skipDates : undefined, undefined, undefined, undefined, reviewPolicy);
    } else {
      if (!selectedUnits.length || !title.trim()) return;
      const ordered = allTemplateUnits.filter((u) => selectedUnitSet.has(u));
      onAdd(tpl.id as GeneralPlanType, title.trim(), ordered, pace, skipWeekdays.length ? skipWeekdays : undefined, skipDates.length ? skipDates : undefined, undefined, undefined, undefined, reviewPolicy);
    }
    handleClose();
  };

  const etaDays = tpl?.id === "custom"
    ? Math.ceil(customText.split("\n").filter((l) => l.trim()).length / pace)
    : selectedUnits.length > 0 ? Math.ceil(selectedUnits.length / pace) : 0;

  const unitsLabel = tpl?.id === "shulchan_aruch"
    ? "סעיפים"
    : tpl?.id === "rambam"
      ? "פרקים"
      : "יחידות";

  const showHierarchyHint = tpl?.id === "shulchan_aruch" || tpl?.id === "rambam";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }} modal={false}>
      <DialogContent className="gold-frame max-w-2xl max-h-[88vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-right flex items-center gap-2">
            {step === "configure" && (
              <button onClick={() => setStep("type")} className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="h-4 w-4 rotate-90" />
              </button>
            )}
            {step === "type" ? "בחר סוג תוכנית" : `הגדרת תוכנית — ${tpl?.label}`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            יצירה והגדרה של תוכנית לימוד חדשה לפי תבנית, קצב ויחידות.
          </DialogDescription>
        </DialogHeader>

        {/* Review schedule dialog — accessible from plan creation */}
        <ReviewScheduleDialog open={reviewScheduleOpen} onOpenChange={setReviewScheduleOpen} />

        {/* Step 1: Choose type */}
        {step === "type" && !forceDeckReview && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelectTemplate(t)}
                className="rounded-xl border-2 border-gold/40 p-4 text-right hover:border-gold hover:bg-gold/5 transition-colors space-y-1 focus:outline-none focus:border-gold"
              >
                <div className="flex items-center justify-center mb-1">{t.icon}</div>
                <div className="font-display font-semibold text-foreground">{t.label}</div>
                <div className="text-[11px] text-muted-foreground">{t.description}</div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Configure — Shas branch */}
        {step === "configure" && tpl?.id === "shas" && (
          <div className="space-y-4 mt-2 text-right">
            {/* יחידת לימוד */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">יחידת לימוד</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { value: "daf",  title: "דף שלם",   sub: "דף יומי – דף שלם בכל יום" },
                  { value: "amud", title: "עמוד",     sub: "עמוד ביום – דף שלם כל יומיים" },
                  { value: "half", title: "חצי עמוד", sub: "חצי עמוד ביום – דף שלם כל ארבעה ימים" },
                ] as { value: ShasUnit; title: string; sub: string }[]).map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setShasUnit(opt.value)}
                    className={cn(
                      "rounded-xl border-2 p-3 text-right transition-colors",
                      shasUnit === opt.value
                        ? "border-gold bg-gold/10"
                        : "border-gold/30 bg-card hover:border-gold/60",
                    )}
                  >
                    <div className="font-display font-semibold">{opt.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* קצב */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                {shasUnit === "daf" ? "דפים ביום" : shasUnit === "amud" ? "עמודים ביום" : "חצאי-עמוד ביום"}
              </label>
              <Input
                type="number" min={1} value={shasPagesPerDay}
                onChange={(e) => setShasPagesPerDay(e.target.value)}
                className="border-2 border-gold/40 text-right w-32" dir="rtl"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{unitRhythmHint(shasUnit)}</p>
            </div>

            {/* סדרים ומסכתות */}
            <div className="space-y-3 max-h-[340px] overflow-y-auto pl-1">
              {SEDARIM.map((seder) => {
                const inSeder = SHAS_BAVLI.filter((m) => m.seder === seder);
                const selCount = inSeder.filter((m) => shasSelectedMasechtos.includes(m.name)).length;
                const allSelected = selCount === inSeder.length;
                return (
                  <div key={seder} className="border-2 border-gold/30 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => {
                          const names = inSeder.map((m) => m.name);
                          if (allSelected) setShasSelectedMasechtos((s) => s.filter((n) => !names.includes(n)));
                          else setShasSelectedMasechtos((s) => Array.from(new Set([...s, ...names])));
                        }}
                        className="text-xs h-7"
                      >
                        {allSelected ? "בטל הכל" : "בחר הכל"}
                      </Button>
                      <h4 className="font-display font-semibold text-foreground">
                        סדר {seder} <span className="text-xs text-muted-foreground">({selCount}/{inSeder.length})</span>
                      </h4>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {inSeder.map((m) => {
                        const checked = shasSelectedMasechtos.includes(m.name);
                        return (
                          <label
                            key={m.name}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border-2 px-2 py-1.5 cursor-pointer text-sm",
                              checked ? "border-gold bg-secondary" : "border-gold/30 bg-card",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => {
                                if (c) setShasSelectedMasechtos((s) => [...s, m.name]);
                                else setShasSelectedMasechtos((s) => s.filter((n) => n !== m.name));
                              }}
                            />
                            <span className="flex-1 text-right">{m.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {(m.pages - 1) * unitsPerDaf(shasUnit)} {shasUnit === "daf" ? "ד׳" : shasUnit === "amud" ? "ע׳" : "ח׳"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <SkipDaysPicker
              skipWeekdays={skipWeekdays} setSkipWeekdays={setSkipWeekdays}
              skipDates={skipDates} setSkipDates={setSkipDates}
            />

            {/* עוגן תאריך */}
            <div className="space-y-2 border-2 border-gold/30 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 select-none">
                  <Checkbox checked={anchorEnabled} onCheckedChange={(c) => changeAnchorEnabled(!!c)} />
                  <button type="button" onClick={() => changeAnchorEnabled(!anchorEnabled)} className="text-xs font-semibold text-muted-foreground">
                    עוגן תאריך — איפה הייתי בתאריך מסוים?
                  </button>
                </div>
              </div>
              {anchorEnabled && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">תאריך עוגן</label>
                      <div className="flex gap-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setAnchorMode("gregorian")}
                          className={cn("px-2 py-0.5 rounded border transition-colors", anchorMode === "gregorian" ? "border-gold bg-gold/20 font-semibold" : "border-gold/30 text-muted-foreground hover:border-gold/60")}
                        >לועזי</button>
                        <button
                          type="button"
                          onClick={() => setAnchorMode("hebrew")}
                          className={cn("px-2 py-0.5 rounded border transition-colors", anchorMode === "hebrew" ? "border-gold bg-gold/20 font-semibold" : "border-gold/30 text-muted-foreground hover:border-gold/60")}
                        >עברי</button>
                      </div>
                    </div>
                    {anchorMode === "gregorian" ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={anchorDate}
                          onChange={(e) => setAnchorDate(e.target.value)}
                          className="border-2 border-gold/40 w-44 text-left"
                          dir="ltr"
                        />
                        {anchorDate && (
                          <span className="text-sm font-semibold text-gold">{toHebrewDate(anchorDate)}</span>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* יום */}
                          <GridPickerPopover
                            value={hebDay}
                            placeholder="יום"
                            options={Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: toHebrewNum(i + 1) }))}
                            onSelect={(d) => {
                              setHebDay(d);
                              if (d && hebMonth && hebYear) {
                                const g = fromHebrewDate(+d, +hebMonth, hebYear);
                                if (g) setAnchorDate(g);
                              }
                            }}
                            columns={5}
                            className="w-20"
                          />
                          {/* חודש */}
                          <GridPickerPopover
                            value={hebMonth}
                            placeholder="חודש"
                            options={HEB_MONTHS.map((m) => ({ value: String(m.num), label: m.name }))}
                            onSelect={(m) => {
                              setHebMonth(m);
                              if (hebDay && m && hebYear) {
                                const g = fromHebrewDate(+hebDay, +m, hebYear);
                                if (g) setAnchorDate(g);
                              }
                            }}
                            columns={2}
                            className="flex-1 min-w-[90px]"
                          />
                          {/* שנה */}
                          <GridPickerPopover
                            value={String(hebYear)}
                            placeholder="שנה"
                            options={Array.from({ length: 21 }, (_, i) => 5775 + i).map((y) => ({ value: String(y), label: hebrewYearGematriya(y) }))}
                            onSelect={(y) => {
                              const yn = +y;
                              setHebYear(yn);
                              if (hebDay && hebMonth && yn) {
                                const g = fromHebrewDate(+hebDay, +hebMonth, yn);
                                if (g) setAnchorDate(g);
                              }
                            }}
                            columns={3}
                            className="w-24"
                          />
                        </div>
                        {anchorDate && (
                          <span className="text-sm font-semibold text-gold">{toHebrewDate(anchorDate)}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">מסכתא</label>
                      <select
                        value={anchorMasechta || (shasSelectedMasechtos[0] ?? "")}
                        onChange={(e) => setAnchorMasechta(e.target.value)}
                        className="w-full rounded-lg border-2 border-gold/40 bg-card px-2 py-1 text-sm text-right"
                        dir="rtl"
                      >
                        <option value="">בחר...</option>
                        {SHAS_BAVLI.map((m) => (
                          <option key={m.name} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">דף</label>
                      <select
                        value={anchorDaf}
                        onChange={(e) => setAnchorDaf(e.target.value)}
                        className="w-full rounded-lg border-2 border-gold/40 bg-card px-2 py-1 text-sm text-right"
                        dir="rtl"
                      >
                        {(() => {
                          const effMas = anchorMasechta || (shasSelectedMasechtos[0] ?? SHAS_BAVLI[0]?.name ?? "");
                          const masData = SHAS_BAVLI.find((m) => m.name === effMas);
                          const maxDaf = masData ? masData.pages + 1 : 64;
                          return Array.from({ length: maxDaf - 2 + 1 }, (_, i) => i + 2).map((d) => (
                            <option key={d} value={String(d)}>{toHebrewNum(d)}׳</option>
                          ));
                        })()}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">עמוד</label>
                      <div className="flex gap-1">
                        {([1, 2] as (1 | 2)[]).map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setAnchorAmud(a)}
                            className={cn(
                              "flex-1 rounded-lg border-2 py-1 text-[10px] font-semibold transition-colors",
                              anchorAmud === a ? "border-gold bg-gold/20" : "border-gold/30 hover:border-gold/60",
                            )}
                          >
                            {a === 1 ? "עמוד א׳" : "עמוד ב׳"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <PlanReviewPolicyEditor value={reviewPolicy} onChange={setReviewPolicy} />

            <div className="flex items-center justify-between pt-2 border-t border-gold/20">
              <span className="text-sm text-muted-foreground">{shasSelectedMasechtos.length} מסכתות נבחרו</span>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleStart}
                  disabled={shasSelectedMasechtos.length === 0}
                  className="bg-gradient-navy text-primary-foreground rounded-xl"
                >
                  <Check className="h-4 w-4" /> התחל תוכנית
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Configure — Mishnayot branch */}
        {step === "configure" && tpl?.id === "mishnayot" && (
          <div className="space-y-4 mt-2 text-right">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">יחידת לימוד</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  { value: "mishna", title: "משנה", sub: "משנה בכל יום (יחידה בודדת)" },
                  { value: "perek",  title: "פרק",  sub: "פרק שלם בכל יום" },
                ] as { value: MishnaUnit; title: string; sub: string }[]).map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setMishnaUnit(opt.value)}
                    className={cn(
                      "rounded-xl border-2 p-3 text-right transition-colors",
                      mishnaUnit === opt.value ? "border-gold bg-gold/10" : "border-gold/30 bg-card hover:border-gold/60",
                    )}
                  >
                    <div className="font-display font-semibold">{opt.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                {mishnaUnit === "perek" ? "פרקים ביום" : "משניות ביום"}
              </label>
              <Input
                type="number" min={1} value={mishnaPerDay}
                onChange={(e) => setMishnaPerDay(e.target.value)}
                className="border-2 border-gold/40 text-right w-32" dir="rtl"
              />
            </div>

            <div className="space-y-3 max-h-[340px] overflow-y-auto pl-1">
              {MISHNAYOT_DATA.map((seder) => {
                const names = seder.masechtot.map((m) => m.name);
                const selCount = names.filter((n) => mishnaSelectedMasechtos.includes(n)).length;
                const allSelected = selCount === names.length;
                return (
                  <div key={seder.name} className="border-2 border-gold/30 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => {
                          if (allSelected) setMishnaSelectedMasechtos((s) => s.filter((n) => !names.includes(n)));
                          else setMishnaSelectedMasechtos((s) => Array.from(new Set([...s, ...names])));
                        }}
                        className="text-xs h-7"
                      >
                        {allSelected ? "בטל הכל" : "בחר הכל"}
                      </Button>
                      <h4 className="font-display font-semibold text-foreground">
                        סדר {seder.name} <span className="text-xs text-muted-foreground">({selCount}/{names.length})</span>
                      </h4>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {seder.masechtot.map((m) => {
                        const checked = mishnaSelectedMasechtos.includes(m.name);
                        const count = countUnitsForMasechet(m.name, mishnaUnit);
                        return (
                          <label
                            key={m.name}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border-2 px-2 py-1.5 cursor-pointer text-sm",
                              checked ? "border-gold bg-secondary" : "border-gold/30 bg-card",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => {
                                if (c) setMishnaSelectedMasechtos((s) => [...s, m.name]);
                                else setMishnaSelectedMasechtos((s) => s.filter((n) => n !== m.name));
                              }}
                            />
                            <span className="flex-1 text-right">{m.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {count} {mishnaUnit === "perek" ? "פר׳" : "מש׳"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <SkipDaysPicker
              skipWeekdays={skipWeekdays} setSkipWeekdays={setSkipWeekdays}
              skipDates={skipDates} setSkipDates={setSkipDates}
            />

            <PlanReviewPolicyEditor value={reviewPolicy} onChange={setReviewPolicy} />

            <div className="flex items-center justify-between pt-2 border-t border-gold/20">
              <span className="text-sm text-muted-foreground">
                {mishnaSelectedMasechtos.length} מסכתות · {generateMishnayotUnitsFlat(mishnaSelectedMasechtos, mishnaUnit).length} {mishnaUnit === "perek" ? "פרקים" : "משניות"}
              </span>
              <Button
                onClick={handleStart}
                disabled={mishnaSelectedMasechtos.length === 0}
                className="bg-gradient-navy text-primary-foreground rounded-xl"
              >
                <Check className="h-4 w-4" /> התחל תוכנית
              </Button>
            </div>
          </div>
        )}


        {step === "configure" && tpl?.id === "masechta_review" && (
          <div className="space-y-4 mt-2 text-right">
            {/* Plan title */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">שם התוכנית</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-2 border-gold/40 text-right" dir="rtl" />
            </div>

            {/* Add review item */}
            <div className="rounded-xl border-2 border-gold/30 bg-card/50 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">הוספת פריט לחזרה</p>

              {/* Masechta selector */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">מסכת</label>
                <select
                  value={mrMasechta}
                  onChange={(e) => setMrMasechta(e.target.value)}
                  className="w-full rounded-lg border-2 border-gold/40 bg-background px-2 py-1.5 text-sm text-right"
                  dir="rtl"
                >
                  {SEDARIM.map((seder) => (
                    <optgroup key={seder} label={`סדר ${seder}`}>
                      {SHAS_BAVLI.filter((m) => m.seder === seder).map((m) => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Scope type */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">היקף</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { value: "masechta", label: "מסכת שלמה" },
                    { value: "perek",    label: "פרק" },
                    { value: "daf_range", label: "טווח דפים" },
                    { value: "custom",   label: "חופשי" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setMrScopeType(opt.value); setMrScopeDetail(""); }}
                      className={cn(
                        "rounded-lg border-2 px-2 py-1 text-xs transition-colors",
                        mrScopeType === opt.value
                          ? "border-gold bg-gold/10 font-semibold"
                          : "border-gold/30 text-muted-foreground hover:border-gold/60",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detail input */}
              {mrScopeType !== "masechta" && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    {mrScopeType === "perek" ? "מספר/שם פרק" : mrScopeType === "daf_range" ? "טווח דפים (למשל: ב׳-כ׳)" : "פירוט"}
                  </label>
                  <Input
                    value={mrScopeDetail}
                    onChange={(e) => setMrScopeDetail(e.target.value)}
                    placeholder={mrScopeType === "perek" ? "פרק א׳" : mrScopeType === "daf_range" ? "ב׳-כ׳" : ""}
                    className="border-2 border-gold/30 text-right text-sm"
                    dir="rtl"
                  />
                </div>
              )}

              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!mrMasechta) return;
                  const scopeLabel =
                    mrScopeType === "masechta" ? "מסכת שלמה" :
                    mrScopeType === "perek" ? (mrScopeDetail.trim() || "פרק") :
                    mrScopeType === "daf_range" ? `דפים ${mrScopeDetail.trim() || ""}` :
                    mrScopeDetail.trim() || "חופשי";
                  const label = `${mrMasechta} — ${scopeLabel}`;
                  if (mrItems.includes(label)) return;
                  setMrItems((prev) => [...prev, label]);
                  setMrScopeDetail("");
                }}
                disabled={mrScopeType !== "masechta" && !mrScopeDetail.trim()}
                className="bg-gradient-navy text-primary-foreground rounded-lg w-full"
              >
                <Plus className="h-3.5 w-3.5 ml-1" /> הוסף פריט
              </Button>
            </div>

            {/* Items list */}
            {mrItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">פריטים לחזרה ({mrItems.length})</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {mrItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-gold/30 bg-card px-2.5 py-1 text-xs">
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => setMrItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Schedule type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">סוג לוח חזרות</label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { value: "srs",            label: "SRS חכם" },
                  { value: "fixed_interval", label: "מרווח קבוע" },
                  { value: "manual",         label: "תאריכים ידניים" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMrScheduleType(opt.value)}
                    className={cn(
                      "rounded-lg border-2 px-2 py-1.5 text-xs transition-colors",
                      mrScheduleType === opt.value
                        ? "border-gold bg-gold/10 font-semibold"
                        : "border-gold/30 text-muted-foreground hover:border-gold/60",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {mrScheduleType === "srs" && (
                <p className="text-[11px] text-muted-foreground">חזרות אוטומטיות: 1 / 7 / 30 / 90 יום — עם התאמה לפי ציון</p>
              )}
              {mrScheduleType === "fixed_interval" && (
                <div className="flex items-center gap-2 mt-1">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">חזרה כל</label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={mrFixedDays}
                    onChange={(e) => setMrFixedDays(e.target.value)}
                    className="w-20 border-2 border-gold/40 text-center text-sm"
                  />
                  <span className="text-xs text-muted-foreground">ימים</span>
                </div>
              )}
              {mrScheduleType === "manual" && (
                <div className="space-y-2 mt-1">
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={mrManualDateInput}
                      onChange={(e) => setMrManualDateInput(e.target.value)}
                      className="border-2 border-gold/30 text-sm flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!mrManualDateInput || mrManualDates.includes(mrManualDateInput)) return;
                        setMrManualDates((prev) => [...prev, mrManualDateInput].sort());
                        setMrManualDateInput("");
                      }}
                      disabled={!mrManualDateInput}
                      className="border-gold/40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {mrManualDates.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {mrManualDates.map((d) => (
                        <span
                          key={d}
                          className="flex items-center gap-1 rounded-full bg-gold/10 border border-gold/30 px-2 py-0.5 text-[11px]"
                        >
                          {d}
                          <button
                            type="button"
                            onClick={() => setMrManualDates((prev) => prev.filter((x) => x !== d))}
                            className="text-muted-foreground hover:text-destructive"
                          >×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-gold/20">
              <p className="text-sm text-muted-foreground">
                {mrItems.length > 0 && `${mrItems.length} פריטים לחזרה`}
              </p>
              <Button
                onClick={handleStart}
                disabled={!title.trim() || mrItems.length === 0 || (mrScheduleType === "manual" && mrManualDates.length === 0)}
                className="bg-gradient-navy text-primary-foreground rounded-xl"
              >
                <Check className="h-4 w-4" />
                התחל תוכנית
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Configure — Deck Review branch */}
        {step === "configure" && tpl?.id === "deck_review" && (
          <div className="space-y-4 mt-2 text-right">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">שם התוכנית</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="לדוג׳ שאלות חודש סיוון"
                className="text-right"
                dir="rtl"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">בחר מערכות לחזרה</label>
              {decks.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין מערכות קיימות — צור מערכת תחילה</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto border border-gold/30 rounded-lg p-2">
                  {decks.map((deck) => (
                    <div key={deck.id} className="flex items-center gap-2 py-1">
                      <Checkbox
                        id={`dr-deck-${deck.id}`}
                        checked={drSelectedDeckIds.includes(deck.id)}
                        disabled={lockedDeckId === deck.id}
                        onCheckedChange={(checked) => {
                          if (lockedDeckId === deck.id) return;
                          setDrSelectedDeckIds((prev) =>
                            checked ? [...prev, deck.id] : prev.filter((id) => id !== deck.id),
                          );
                        }}
                      />
                      <label htmlFor={`dr-deck-${deck.id}`} className="text-sm cursor-pointer flex-1">{deck.name}</label>
                      {lockedDeckId === deck.id && (
                        <span className="text-[10px] text-gold">ערכה נוכחית</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <PlanReviewPolicyEditor value={reviewPolicy} onChange={setReviewPolicy} />
            <div className="flex justify-end gap-2 pt-2 border-t border-gold/20">
              <Button variant="outline" onClick={handleClose} className="rounded-xl">ביטול</Button>
              <Button
                onClick={handleStart}
                disabled={!title.trim() || drSelectedDeckIds.length === 0}
                className="bg-gradient-navy text-primary-foreground rounded-xl"
              >
                <Check className="h-4 w-4" />
                התחל תוכנית
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Configure — Generic branch */}
        {step === "configure" && tpl && tpl.id !== "shas" && tpl.id !== "masechta_review" && tpl.id !== "deck_review" && tpl.id !== "mishnayot" && (
          <div className="space-y-4 mt-2 text-right">
            {/* Title */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">שם התוכנית</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-2 border-gold/40 text-right"
                dir="rtl"
              />
            </div>

            {/* Pace */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">קצב לימוד</label>
              <div className="flex flex-wrap gap-1.5 justify-end">
                {PACE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPace(opt.value)}
                    className={cn(
                      "px-3 py-1 rounded-lg border-2 text-xs font-semibold transition-colors",
                      Math.abs(pace - opt.value) < 0.001
                        ? "border-gold bg-gold/20 text-gold"
                        : "border-gold/30 text-muted-foreground hover:border-gold/60",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom: textarea */}
            {tpl.id === "custom" ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">נושאים (שורה לכל נושא)</label>
                <Textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder={"פרק א'\nפרק ב'\nנושא..."}
                  className="border-2 border-gold/40 text-right min-h-[120px] text-sm"
                  dir="rtl"
                />
                <p className="text-[11px] text-muted-foreground">
                  {customText.split("\n").filter((l) => l.trim()).length} נושאים
                </p>
              </div>
            ) : (
              /* Template units with grouping */
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      if (bulkTargetUnits.length === 0) return;
                      if (allBulkTargetSelected) {
                        const bulkSet = new Set(bulkTargetUnits);
                        setSelectedUnits((prev) => prev.filter((u) => !bulkSet.has(u)));
                      } else {
                        setSelectedUnits((prev) => Array.from(new Set([...prev, ...bulkTargetUnits])));
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {allBulkTargetSelected ? "בטל הכל" : "בחר הכל"}
                  </button>
                  <label className="text-xs font-semibold text-muted-foreground">
                    {normalizedUnitSearch
                      ? `${unitsLabel} בתוצאות (${selectedVisibleCount}/${bulkTargetUnits.length})`
                      : `${unitsLabel} לכלול (${selectedUnits.length}/${allTemplateUnits.length})`}
                  </label>
                </div>
                {showHierarchyHint && (
                  <p className="text-[11px] text-muted-foreground text-right">
                    תצוגה היררכית מוצגת כשביל קצר: חלק עליון ואחריו היחידה הנוכחית.
                  </p>
                )}
                <div className="space-y-1">
                  <Input
                    value={unitSearch}
                    onChange={(e) => setUnitSearch(e.target.value)}
                    placeholder="חיפוש בתוך היחידות (למשל: סימן, סעיף, פרק, הלכות שבת)"
                    className="border-2 border-gold/40 text-right"
                    dir="rtl"
                  />
                  {normalizedUnitSearch && (
                    <button
                      type="button"
                      onClick={() => setUnitSearch("")}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      נקה חיפוש
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pl-1">
                  {groupsForDisplay.map((group) => {
                    const groupUnits = filteredUnitsByGroup[group.name] ?? group.units;
                    const selCount = groupUnits.reduce((count, u) => count + (selectedUnitSet.has(u) ? 1 : 0), 0);
                    const expanded = normalizedUnitSearch ? true : expandedGroups.has(group.name);
                    const visibleCount = visibleUnitsByGroup[group.name] ?? Math.min(INITIAL_VISIBLE_UNITS, groupUnits.length);
                    const visibleUnits = expanded ? groupUnits.slice(0, visibleCount) : [];
                    const remaining = Math.max(0, groupUnits.length - visibleCount);
                    return (
                      <div key={group.name} className="border-2 border-gold/25 rounded-xl p-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={!!normalizedUnitSearch}
                              onClick={() => toggleGroupExpand(group)}
                              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 disabled:opacity-30 disabled:cursor-default"
                            >
                              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => toggleGroupSelect(group.name)}
                              className="text-[11px] text-muted-foreground hover:text-foreground border border-gold/30 rounded px-1.5 py-0.5 transition-colors"
                            >
                              {groupUnits.length > 0 && selCount === groupUnits.length ? "בטל" : "בחר הכל"}
                            </button>
                          </div>
                          <span className="text-sm font-semibold">
                            {group.name}{" "}
                            <span className="text-[11px] font-normal text-muted-foreground">
                              ({selCount}/{groupUnits.length})
                            </span>
                          </span>
                        </div>
                        {expanded && (
                          <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-1.5">
                              {visibleUnits.map((unit) => {
                                const selected = selectedUnitSet.has(unit);
                                const label = splitUnitPath(unit);
                                return (
                                  <label
                                    key={unit}
                                    className={cn(
                                      "flex items-center gap-1.5 rounded-lg border px-2 py-1 cursor-pointer text-[11px] transition-colors",
                                      selected
                                        ? "border-gold bg-gold/10"
                                        : "border-gold/20 bg-card hover:border-gold/40",
                                    )}
                                  >
                                    <Checkbox
                                      checked={selected}
                                      onCheckedChange={(c) => {
                                        if (c) setSelectedUnits((prev) => [...prev, unit]);
                                        else setSelectedUnits((prev) => prev.filter((u) => u !== unit));
                                      }}
                                      className="shrink-0"
                                    />
                                    <span className="flex-1 text-right min-w-0 leading-tight">
                                      {label.trail && (
                                        <span className="block text-[10px] text-muted-foreground truncate">{label.trail}</span>
                                      )}
                                      <span className="block truncate">{label.headline}</span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            {remaining > 0 && (
                              <button
                                type="button"
                                onClick={() => loadMoreInGroup(group)}
                                className="mt-2 w-full text-[11px] py-1 rounded-lg border border-gold/30 text-muted-foreground hover:text-foreground hover:border-gold/50 transition-colors"
                              >
                                טען עוד ({remaining} נותרו)
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  {normalizedUnitSearch && groupsForDisplay.length === 0 && (
                    <div className="rounded-xl border border-gold/30 bg-card/50 p-3 text-xs text-muted-foreground text-center">
                      לא נמצאו תוצאות לחיפוש.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <SkipDaysPicker
              skipWeekdays={skipWeekdays} setSkipWeekdays={setSkipWeekdays}
              skipDates={skipDates} setSkipDates={setSkipDates}
            />
            <PlanReviewPolicyEditor value={reviewPolicy} onChange={setReviewPolicy} />
            <div className="flex items-center justify-between pt-2 border-t border-gold/20">
              <p className="text-sm text-muted-foreground">
                {etaDays > 0 && `≈ ${etaDays} ימים פעילים`}
              </p>
              <Button
                onClick={handleStart}
                disabled={
                  !title.trim() ||
                  (tpl.id === "custom"
                    ? customText.split("\n").filter((l) => l.trim()).length === 0
                    : selectedUnits.length === 0)
                }
                className="bg-gradient-navy text-primary-foreground rounded-xl"
              >
                <Check className="h-4 w-4" />
                התחל תוכנית
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Plan Dialog ─────────────────────────────────────────────────────────

function EditPlanDialog({
  plan,
  onClose,
  onSave,
}: {
  plan: GeneralStudyPlan | null;
  onClose: () => void;
  onSave: (patch: { title?: string; unitsPerDay?: number; skipWeekdays?: number[]; skipDates?: string[]; anchorDate?: string; anchorPosition?: { unitIndex: number }; reviewEnabled?: boolean; reviewRepetitions?: number; reviewScheduleType?: ReviewScheduleType; fixedIntervalDays?: number; reviewSpacingMode?: ReviewSpacingMode; reviewIntervals?: number[]; }) => void;
}) {
  const [title, setTitle] = useState("");
  const [pace, setPace] = useState<number>(1);
  const [skipWeekdays, setSkipWeekdays] = useState<number[]>([]);
  const [skipDates, setSkipDates] = useState<string[]>([]);
  const [anchorDate, setAnchorDate] = useState("");
  const [anchorUnitSearch, setAnchorUnitSearch] = useState("");
  const [showUnitDrop, setShowUnitDrop] = useState(false);
  const [reviewPolicy, setReviewPolicy] = useState<PlanReviewPolicy>({
    reviewEnabled: true,
    reviewRepetitions: 5,
    reviewScheduleType: "srs",
    reviewSpacingMode: "from_start",
    fixedIntervalDays: 7,
    reviewIntervals: [...DEFAULT_PLAN_REVIEW_INTERVALS],
  });

  useEffect(() => {
    if (!plan) return;
    setTitle(plan.title);
    setPace(plan.unitsPerDay);
    setSkipWeekdays(plan.skipWeekdays ?? []);
    setSkipDates(plan.skipDates ?? []);
    setAnchorDate(plan.anchorDate ?? "");
    setAnchorUnitSearch(plan.units[plan.anchorPosition?.unitIndex ?? 0] ?? "");
    setReviewPolicy({
      reviewEnabled: plan.reviewEnabled ?? true,
      reviewRepetitions: plan.reviewRepetitions ?? 5,
      reviewScheduleType: plan.reviewScheduleType ?? "srs",
      reviewSpacingMode: plan.reviewSpacingMode ?? "from_start",
      fixedIntervalDays: plan.fixedIntervalDays ?? 7,
      reviewIntervals: plan.reviewIntervals?.length ? [...plan.reviewIntervals] : [...DEFAULT_PLAN_REVIEW_INTERVALS],
    });
  }, [plan]);

  if (!plan) return null;

  const anchorUnitIdx = plan.units.indexOf(anchorUnitSearch);
  const validAnchorIdx = anchorUnitIdx >= 0 ? anchorUnitIdx : 0;
  const filteredUnits = anchorUnitSearch
    ? plan.units.filter((u) => u.includes(anchorUnitSearch)).slice(0, 15)
    : plan.units.slice(0, 15);

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const patch: Parameters<typeof onSave>[0] = {
      title: trimmed,
      unitsPerDay: pace,
      skipWeekdays,
      skipDates,
      reviewEnabled: reviewPolicy.reviewEnabled,
      reviewRepetitions: reviewPolicy.reviewRepetitions,
      reviewScheduleType: reviewPolicy.reviewScheduleType,
      fixedIntervalDays: reviewPolicy.reviewScheduleType === "fixed_interval" ? reviewPolicy.fixedIntervalDays : undefined,
      reviewSpacingMode: reviewPolicy.reviewSpacingMode,
      reviewIntervals: reviewPolicy.reviewIntervals,
    };
    if (anchorDate.trim()) {
      patch.anchorDate = anchorDate.trim();
      patch.anchorPosition = { unitIndex: validAnchorIdx };
    } else {
      patch.anchorDate = undefined;
      patch.anchorPosition = undefined;
    }
    onSave(patch);
  };

  return (
    <Dialog open={!!plan} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת תוכנית</DialogTitle>
          <DialogDescription className="sr-only">
            עריכת שם התוכנית, קצב הלימוד, ימי דילוג והגדרות עוגן.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">שם התוכנית</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} dir="rtl" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">קצב לימוד</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PACE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setPace(opt.value)}
                  className={cn(
                    "rounded-lg border-2 px-2 py-1.5 text-xs transition-colors",
                    Math.abs(pace - opt.value) < 0.001
                      ? "border-gold bg-gold/10 text-foreground font-semibold"
                      : "border-gold/30 text-muted-foreground hover:border-gold/60",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Anchor */}
          <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-3">
            <p className="text-xs font-semibold text-gold">עוגן — "הייתי ביחידה הזו בתאריך הזה"</p>
            <p className="text-[11px] text-muted-foreground">הלוח יחשב קדימה מנקודה זו</p>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">תאריך</label>
                <Input
                  type="date"
                  value={anchorDate}
                  onChange={(e) => setAnchorDate(e.target.value)}
                  dir="ltr"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">יחידה (חפש לפי שם)</label>
                <Input
                  value={anchorUnitSearch}
                  onChange={(e) => { setAnchorUnitSearch(e.target.value); setShowUnitDrop(true); }}
                  onFocus={() => setShowUnitDrop(true)}
                  onBlur={() => setTimeout(() => setShowUnitDrop(false), 150)}
                  placeholder="חפש... (מגילה ב' ע״א)"
                  dir="rtl"
                  className="text-sm"
                />
                {showUnitDrop && filteredUnits.length > 0 && (
                  <div className="w-full bg-muted border border-border rounded-lg max-h-36 overflow-y-auto mt-0.5">
                    {filteredUnits.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setAnchorUnitSearch(u); setShowUnitDrop(false); }}
                        className={cn(
                          "w-full text-right px-3 py-1.5 text-sm hover:bg-accent transition-colors",
                          u === anchorUnitSearch && "bg-gold/10 font-semibold",
                        )}
                      >{u}</button>
                    ))}
                  </div>
                )}
                {anchorUnitSearch && anchorUnitIdx < 0 && (
                  <p className="text-[11px] text-destructive">לא נמצאה יחידה תואמת</p>
                )}
                {anchorUnitIdx >= 0 && (
                  <p className="text-[11px] text-muted-foreground">יחידה {anchorUnitIdx + 1} / {plan.units.length}</p>
                )}
              </div>
            </div>
            {!anchorDate && (
              <p className="text-[11px] text-muted-foreground">השאר תאריך ריק להסרת העוגן</p>
            )}
          </div>

          <SkipDaysPicker
            skipWeekdays={skipWeekdays} setSkipWeekdays={setSkipWeekdays}
            skipDates={skipDates} setSkipDates={setSkipDates}
          />
          {plan.planType !== "masechta_review" && (
            <PlanReviewPolicyEditor value={reviewPolicy} onChange={setReviewPolicy} />
          )}
          <div className="text-[11px] text-muted-foreground">
            סה״כ יחידות בתוכנית: {plan.units.length} · הושלמו: {plan.completedUnits.length}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSave} className="bg-gradient-navy text-primary-foreground">שמור</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

export function StudyPlansCard({
  contextDeckId,
  showOnlyContextDeckReview = false,
  createDeckReviewSignal,
}: {
  contextDeckId?: string;
  showOnlyContextDeckReview?: boolean;
  createDeckReviewSignal?: number;
} = {}) {
  const { state, addGeneralPlan, addCategoriesBulk, setShasPlan, deleteGeneralPlan, archiveGeneralPlan, unarchiveGeneralPlan, updateGeneralPlan, completeGeneralPlanUnit, undoLastGeneralPlanUnit, addMasecthaReviewPlan, addDeckReviewPlan, setUiPref } = useStudy();
  const navigate = useNavigate();
  const plans = state.generalPlans ?? [];
  const activePlans = plans.filter((p) => !p.archivedAt);
  const archivedPlans = plans.filter((p) => !!p.archivedAt);
  const planReviews = state.planReviews ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [deleteDialogPlanId, setDeleteDialogPlanId] = useState<string | null>(null);
  const pendingDeletePlanIdRef = useRef<string | null>(null);
  const [archiveDialogPlanId, setArchiveDialogPlanId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [quickReviewPlanId, setQuickReviewPlanId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<GeneralStudyPlan | null>(null);
  const [reviewScheduleOpen, setReviewScheduleOpen] = useState(false);
  const [scheduleOpenPlans, setScheduleOpenPlans] = useState<Set<string>>(new Set());
  const [forceDeckReviewAdd, setForceDeckReviewAdd] = useState(false);
  type PlanViewMode = "classic" | "grid2" | "grid3" | "table" | "compact";
  const cloudPlanView = state.uiPrefs?.studyPlansView;
  const [planView, setPlanViewState] = useState<PlanViewMode>(() => {
    if (cloudPlanView === "grid2" || cloudPlanView === "grid3" || cloudPlanView === "table" || cloudPlanView === "compact" || cloudPlanView === "classic") return cloudPlanView;
    try {
      const raw = localStorage.getItem(PLAN_VIEW_KEY);
      if (raw === "grid2" || raw === "grid3" || raw === "table" || raw === "compact" || raw === "classic") return raw;
    } catch {
      // ignore
    }
    return "classic";
  });

  // Adopt cloud value when it arrives/changes from another device
  useEffect(() => {
    if (!cloudPlanView) return;
    if (cloudPlanView !== planView) setPlanViewState(cloudPlanView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudPlanView]);

  const setPlanView = useCallback((v: PlanViewMode) => {
    setPlanViewState(v);
    try { localStorage.setItem(PLAN_VIEW_KEY, v); } catch { /* ignore */ }
    setUiPref("studyPlansView", v);
  }, [setUiPref]);

  useEffect(() => {
    if (createDeckReviewSignal == null || contextDeckId == null) return;
    setForceDeckReviewAdd(true);
    setAddOpen(true);
  }, [createDeckReviewSignal, contextDeckId]);

  const effectiveDeletePlanId = deleteDialogPlanId ?? pendingDeletePlanIdRef.current;
  const deleteDialogPlan = effectiveDeletePlanId ? plans.find((p) => p.id === effectiveDeletePlanId) ?? null : null;
  const archiveDialogPlan = archiveDialogPlanId ? plans.find((p) => p.id === archiveDialogPlanId) ?? null : null;

  const toggleSchedule = (planId: string) =>
    setScheduleOpenPlans((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });

  const handleAdd = (planType: GeneralPlanType, title: string, units: string[], unitsPerDay: number, skipWeekdays?: number[], skipDates?: string[], shasUnit?: ShasUnit, anchorDate?: string, anchorPosition?: { unitIndex: number }, reviewPolicy?: PlanReviewPolicy, mishnaUnit?: MishnaUnit) => {
    addGeneralPlan({
      planType, title, units, unitsPerDay,
      ...(skipWeekdays?.length ? { skipWeekdays } : {}),
      ...(skipDates?.length ? { skipDates } : {}),
      ...(planType === "shas" && shasUnit ? { shasUnit } : {}),
      ...(planType === "mishnayot" && mishnaUnit ? { mishnaUnit } : {}),
      ...(anchorDate ? { anchorDate } : {}),
      ...(anchorPosition != null ? { anchorPosition } : {}),
      ...(reviewPolicy ? {
        reviewEnabled: reviewPolicy.reviewEnabled,
        reviewRepetitions: reviewPolicy.reviewRepetitions,
        reviewScheduleType: reviewPolicy.reviewScheduleType,
        fixedIntervalDays: reviewPolicy.reviewScheduleType === "fixed_interval" ? reviewPolicy.fixedIntervalDays : undefined,
        reviewSpacingMode: reviewPolicy.reviewSpacingMode,
        reviewIntervals: reviewPolicy.reviewIntervals,
      } : {}),
    });
  };

  const handleAddShas = (selectedMasechtos: string[], pagesPerDay: number, unit: ShasUnit, skipWeekdays?: number[], skipDates?: string[], anchorDate?: string, anchorPosition?: { masechta: string; daf: number; amud: 1 | 2 }) => {
    setShasPlan(selectedMasechtos, pagesPerDay, unit, undefined, undefined, skipWeekdays, skipDates, anchorDate, anchorPosition);
  };

  const handleAddMasecthaReview = (title: string, units: string[], scheduleType: "srs" | "fixed_interval" | "manual", fixedIntervalDays?: number, manualReviewDates?: string[], linkedDeckId?: string) => {
    addMasecthaReviewPlan(title, units, scheduleType, fixedIntervalDays, manualReviewDates, linkedDeckId);
  };

  const handleAddDeckReview = (title: string, deckIds: string[], reviewPolicy: PlanReviewPolicy) => {
    addDeckReviewPlan(title, deckIds, {
      reviewEnabled: reviewPolicy.reviewEnabled,
      reviewRepetitions: reviewPolicy.reviewRepetitions,
      reviewScheduleType: reviewPolicy.reviewScheduleType,
      fixedIntervalDays: reviewPolicy.reviewScheduleType === "fixed_interval" ? reviewPolicy.fixedIntervalDays : undefined,
      reviewSpacingMode: reviewPolicy.reviewSpacingMode,
      reviewIntervals: reviewPolicy.reviewIntervals,
    });
  };

  const ensureShasCategories = useCallback((selectedMasechtos: string[]) => {
    if (selectedMasechtos.length === 0) return;
    const defaultSubCategories = ["שינון", "חזרה", "מבחן"];
    const nodes = selectedMasechtos.map((masechtaName) => {
      const dafNodes = fullDafNamesForMasechet(masechtaName).map((dafName) => {
        const amudNodes = fullAmudNamesForDaf(dafName).map((amudName) => ({
          name: amudName,
          children: defaultSubCategories.map((subName) => ({ name: `${amudName}${PATH_SEP}${subName}` })),
        }));
        return { name: dafName, children: amudNodes };
      });
      return { name: masechtaName, children: dafNodes };
    });
    addCategoriesBulk(nodes, null);
  }, [addCategoriesBulk]);

  const ensureTemplateCategories = useCallback((units: string[]) => {
    if (units.length === 0) return;
    type Node = { name: string; children?: Node[] };
    const rootMap = new Map<string, Node>();
    const childMapByParent = new Map<string, Map<string, Node>>();

    for (const rawUnit of units) {
      const parts = rawUnit.split(PATH_SEP).map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) continue;

      let parentNode: Node | null = null;
      let cumulative = "";

      for (let i = 0; i < parts.length; i += 1) {
        cumulative = cumulative ? `${cumulative}${PATH_SEP}${parts[i]}` : parts[i];

        if (i === 0) {
          let node = rootMap.get(cumulative);
          if (!node) {
            node = { name: cumulative, children: [] };
            rootMap.set(cumulative, node);
          }
          parentNode = node;
          continue;
        }

        if (!parentNode) break;
        let map = childMapByParent.get(parentNode.name);
        if (!map) {
          map = new Map<string, Node>();
          childMapByParent.set(parentNode.name, map);
        }
        let node = map.get(cumulative);
        if (!node) {
          node = { name: cumulative, children: [] };
          map.set(cumulative, node);
          parentNode.children?.push(node);
        }
        parentNode = node;
      }
    }

    const compact = (node: Node): Node => {
      const children = (node.children ?? []).map(compact);
      return children.length > 0 ? { name: node.name, children } : { name: node.name };
    };

    const nodes = Array.from(rootMap.values()).map(compact);
    if (nodes.length > 0) addCategoriesBulk(nodes, null);
  }, [addCategoriesBulk]);

  const stopCardNavigation = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const today = todayStr();
  const contextActivePlans = useMemo(() => {
    if (!showOnlyContextDeckReview || !contextDeckId) return activePlans;
    return activePlans.filter((p) => p.planType === "deck_review" && (p.deckIds ?? []).includes(contextDeckId));
  }, [activePlans, showOnlyContextDeckReview, contextDeckId]);

  return (
    <Card className="gold-frame p-6 space-y-4 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="gold-icon-circle">
            <Layout className="h-4 w-4" />
          </span>
          <h3 className="font-display text-lg font-semibold">תוכניות לימוד</h3>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1 border border-gold/40 rounded-xl px-2 py-1 bg-card/80 text-[10px] text-muted-foreground hover:bg-secondary transition-colors">
                <Circle className="h-2.5 w-2.5 fill-current" /> תצוגה
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 text-right">
              <DropdownMenuLabel className="text-right">תצוגת תוכניות</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPlanView("classic")} className="gap-2 flex-row-reverse justify-end">
                {planView === "classic" && "✓ "}קיימת
                <Layout className="h-4 w-4" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPlanView("grid2")} className="gap-2 flex-row-reverse justify-end">
                {planView === "grid2" && "✓ "}רשת 2
                <Grid2x2 className="h-4 w-4" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPlanView("grid3")} className="gap-2 flex-row-reverse justify-end">
                {planView === "grid3" && "✓ "}רשת 3
                <Columns3 className="h-4 w-4" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPlanView("table")} className="gap-2 flex-row-reverse justify-end">
                {planView === "table" && "✓ "}טבלה
                <Table2 className="h-4 w-4" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPlanView("compact")} className="gap-2 flex-row-reverse justify-end">
                {planView === "compact" && "✓ "}קומפקט
                <Rows3 className="h-4 w-4" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            onClick={() => {
              if (showOnlyContextDeckReview && contextDeckId) {
                setForceDeckReviewAdd(true);
              } else {
                setForceDeckReviewAdd(false);
              }
              setAddOpen(true);
            }}
            className="bg-gradient-navy text-primary-foreground rounded-xl gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            {showOnlyContextDeckReview ? "הוסף תוכנית חזרות" : "הוסף תוכנית"}
          </Button>
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            title="ארכיון"
            className={cn(
              "relative inline-flex items-center justify-center h-7 w-7 rounded-xl border border-gold/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors",
              showArchive && "bg-gold/10 text-foreground"
            )}
          >
            <Archive className="h-3.5 w-3.5" />
            {archivedPlans.length > 0 && (
              <span className="absolute -top-1.5 -left-1.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-[9px] font-bold text-white flex items-center justify-center leading-none">
                {archivedPlans.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Add Dialog */}
      <AddPlanDialog
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setForceDeckReviewAdd(false);
        }}
        onAdd={handleAdd}
        onAddShas={handleAddShas}
        onAddMasecthaReview={handleAddMasecthaReview}
        onAddDeckReview={handleAddDeckReview}
        forceDeckReview={forceDeckReviewAdd}
        preselectedDeckIds={contextDeckId ? [contextDeckId] : []}
        lockedDeckId={showOnlyContextDeckReview ? contextDeckId : undefined}
      />

      {/* Edit Dialog */}
      <EditPlanDialog
        plan={editingPlan}
        onClose={() => setEditingPlan(null)}
        onSave={(patch) => {
          if (editingPlan) updateGeneralPlan(editingPlan.id, patch);
          setEditingPlan(null);
        }}
      />

      {/* Quick review dialog */}
      {quickReviewPlanId && (() => {
        const plan = plans.find((p) => p.id === quickReviewPlanId);
        return plan ? (
          <QuickReviewDialog
            open={true}
            planId={quickReviewPlanId}
            planTitle={plan.title}
            onClose={() => setQuickReviewPlanId(null)}
          />
        ) : null;
      })()}

      {/* Empty state */}
      {contextActivePlans.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8 border-2 border-dashed border-gold/30 rounded-xl space-y-1">
          <BookOpen className="h-8 w-8 mx-auto text-gold/40 mb-2" />
          <p>{showOnlyContextDeckReview ? "אין תוכניות חזרה לערכה זו" : "אין תוכניות לימוד פעילות"}</p>
          <p className="text-[11px]">{showOnlyContextDeckReview ? "הוסף תוכנית חזרות לערכה הנוכחית" : "הוסף תוכנית לחומש, רמב״ם, שו״ע ועוד"}</p>
        </div>
      )}

      {/* Plans list */}
      {contextActivePlans.length > 0 && (
        planView === "table" ? (
          <div className="rounded-xl border border-gold/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead className="bg-secondary/60">
                  <tr className="text-right">
                    <th className="px-3 py-2 font-semibold">תוכנית</th>
                    <th className="px-3 py-2 font-semibold">התקדמות</th>
                    <th className="px-3 py-2 font-semibold">קצב</th>
                    <th className="px-3 py-2 font-semibold">הבאה</th>
                    <th className="px-3 py-2 font-semibold text-left">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {contextActivePlans.map((plan) => {
                    const completedSet = new Set(plan.completedUnits);
                    const nextUnit = plan.units.find((u) => !completedSet.has(u));
                    const done = plan.completedUnits.length;
                    const total = plan.units.length;
                    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <tr key={plan.id} className="border-t border-gold/20 hover:bg-secondary/30 transition-colors">
                        <td className="px-3 py-2 font-medium max-w-[220px] truncate">{plan.title}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{done}/{total} ({percent}%)</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatPace(plan.unitsPerDay, plan)}</td>
                        <td className="px-3 py-2 max-w-[260px] truncate">{nextUnit ?? "הושלם"}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            {nextUnit && (
                              <Button
                                size="sm"
                                onClick={() => completeGeneralPlanUnit(plan.id, nextUnit)}
                                className="h-7 text-xs bg-gradient-navy text-primary-foreground rounded-lg px-2.5"
                              >
                                סיימתי
                              </Button>
                            )}
                            <button
                              onClick={() => navigate(`/plan/${plan.id}`)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-gold/30 text-muted-foreground hover:text-foreground hover:border-gold/60 transition-colors"
                              title="פתח"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
        <div className={cn(
          planView === "grid2" && "grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch",
          planView === "grid3" && "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-stretch",
          planView === "compact" && "space-y-2",
          planView !== "grid2" && planView !== "grid3" && "space-y-3",
        )}>
          {contextActivePlans.map((plan) => {
            const completedSet = new Set(plan.completedUnits);
            const nextUnit = plan.units.find((u) => !completedSet.has(u));
            const todayCalUnit = getCalendarUnitForToday(plan);
            const done = plan.completedUnits.length;
            const total = plan.units.length;
            const percent = total > 0 ? Math.round((done / total) * 100) : 0;
            const remaining = total - done;
            const activeDaysNeeded =
              remaining > 0 && plan.unitsPerDay > 0
                ? Math.ceil(remaining / plan.unitsPerDay)
                : 0;
            const hasSkips = !!(plan.skipWeekdays?.length || plan.skipDates?.length);
            const etaDateObj = activeDaysNeeded > 0
              ? calcEtaDate(activeDaysNeeded, plan.skipWeekdays ?? [], plan.skipDates ?? [])
              : null;
            const etaDate = etaDateObj ? toHebrewDate(etaDateObj) : null;
            const daysLeft = activeDaysNeeded;
            const tplDef = TEMPLATES.find((t) => t.id === plan.planType);
            const isDarkCard = planView === "grid2" || planView === "grid3";

            // Review metrics
            const dueReviewsCount = planReviews.filter(
              (r) => r.planId === plan.id && r.dueDate <= today && !r.doneAt
            ).length;
            const overdueCount = planReviews.filter(
              (r) => r.planId === plan.id && r.dueDate < today && !r.doneAt
            ).length;

            return (
              <div
                key={plan.id}
                className={cn(
                  "study-plan-card rounded-xl border-2 p-3 space-y-2.5 cursor-pointer transition-colors",
                  (planView === "grid2" || planView === "grid3") && "h-full flex flex-col",
                  isDarkCard
                    ? "border-gold/80 bg-gradient-to-br from-[hsl(var(--navy))] to-[hsl(var(--navy-soft))] text-primary-foreground hover:border-gold [&_.text-muted-foreground]:!text-primary-foreground/85 [&_.text-foreground]:!text-primary-foreground [&_.text-navy]:!text-primary-foreground [&_.hover\\:text-navy:hover]:!text-gold [&_.border-gold\\/15]:!border-white/25 [&_.border-gold\\/10]:!border-white/20"
                    : "border-gold/40 bg-card hover:border-gold/70",
                  planView === "compact" && "py-2 px-2.5 space-y-1.5",
                )}
                onClick={(e) => {
                  const target = e.target;
                  if (target instanceof Element && target.closest("button,a,input,select,textarea,[role='checkbox'],[data-radix-collection-item]")) return;
                  navigate(`/plan/${plan.id}`);
                }}
              >
                {/* Title row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {tplDef && <span className={cn("leading-none shrink-0", isDarkCard && "[&_.text-navy]:text-gold")}>{tplDef.icon}</span>}
                    <span className="font-display font-semibold text-sm truncate">{plan.title}</span>
                    {plan.planType === "masechta_review" ? (
                      <Badge className={cn("text-[10px] px-1.5 py-0 h-4", isDarkCard && "border-gold text-gold bg-gold/10")} variant="outline">
                        {plan.reviewScheduleType === "fixed_interval" ? `כל ${plan.fixedIntervalDays ?? 30} ימים` :
                         plan.reviewScheduleType === "manual" ? "ידני" : "SRS"}
                      </Badge>
                    ) : plan.planType === "deck_review" ? (
                      <Badge className={cn("text-[10px] px-1.5 py-0 h-4", isDarkCard && "border-gold text-gold bg-gold/10")} variant="outline">מערכות</Badge>
                    ) : (
                      <Badge className={cn("text-[10px] px-1.5 py-0 h-4 whitespace-nowrap", isDarkCard && "border-gold text-gold bg-gold/10")} variant="outline">
                        {formatPace(plan.unitsPerDay, plan)}
                      </Badge>
                    )}
                  </div>
                  <div className="study-plan-card-actions flex items-center gap-1 opacity-0 focus-within:opacity-100 transition-opacity">
                      {dueReviewsCount > 0 && (
                        <button
                          onClick={() => setQuickReviewPlanId(plan.id)}
                          className={cn(
                            "flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-lg border transition-colors",
                            overdueCount > 0
                              ? "border-destructive/60 text-destructive bg-destructive/5 hover:bg-destructive/10"
                              : "border-amber-400/60 text-amber-600 bg-amber-50/30 hover:bg-amber-50/60"
                          )}
                          title="חזרה מהירה"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          {dueReviewsCount}
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/plan/${plan.id}`)}
                        className={cn("text-muted-foreground hover:text-navy transition-colors", isDarkCard && "text-primary-foreground/90 hover:text-gold")}
                        title="פתח תצוגת תוכנית"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleSchedule(plan.id)}
                        className={cn(
                          "text-muted-foreground hover:text-gold transition-colors",
                          scheduleOpenPlans.has(plan.id) && "text-gold",
                        )}
                        title="לוח חזרות פרטני"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setReviewScheduleOpen(true)}
                        className="text-muted-foreground hover:text-gold transition-colors"
                        title="הגדרת מרווחי חזרה"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setArchiveDialogPlanId(plan.id)}
                        className={cn("text-muted-foreground hover:text-gold transition-colors", isDarkCard && "text-primary-foreground/90 hover:text-gold")}
                        title="העבר לארכיון"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingPlan(plan)}
                        className={cn("text-muted-foreground hover:text-gold transition-colors", isDarkCard && "text-primary-foreground/90 hover:text-gold")}
                        title="ערוך תוכנית"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          stopCardNavigation(e);
                          pendingDeletePlanIdRef.current = plan.id;
                          setDeleteDialogPlanId(plan.id);
                        }}
                        className={cn("text-muted-foreground hover:text-destructive transition-colors", isDarkCard && "text-primary-foreground/90 hover:text-destructive")}
                        title="מחק תוכנית"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                </div>

                {/* Progress bar — not shown for masechta_review or deck_review */}
                {plan.planType !== "masechta_review" && plan.planType !== "deck_review" && (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={cn((planView === "grid2" || planView === "grid3") ? "text-gold" : "text-muted-foreground")}>{percent}%</span>
                    <span className="font-medium">{done}/{total} יחידות</span>
                  </div>
                  <div className={cn("h-1.5 rounded-full overflow-hidden", (planView === "grid2" || planView === "grid3") ? "bg-white/15" : "bg-secondary")}>
                    <div
                      className="h-full bg-gradient-gold transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
                )}

                {/* Masechta review: show units list */}
                {plan.planType === "masechta_review" && plan.units.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {plan.units.map((u) => (
                      <span key={u} className="text-[11px] rounded-full bg-violet-500/10 border border-violet-500/30 px-2 py-0.5">{u}</span>
                    ))}
                  </div>
                )}

                {/* Deck review: show deck chips */}
                {plan.planType === "deck_review" && plan.units.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {plan.units.map((u) => (
                      <span key={u} className="text-[11px] rounded-full bg-blue-500/10 border border-blue-500/30 px-2 py-0.5">{u}</span>
                    ))}
                  </div>
                )}

                {/* Current unit / Done state — not shown for masechta_review or deck_review */}
                {plan.planType !== "masechta_review" && plan.planType !== "deck_review" && (
                !nextUnit ? (
                  <div className="flex items-center justify-end gap-1.5 text-gold">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-semibold">הושלם! 🎉</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {todayCalUnit && todayCalUnit !== nextUnit && (
                      <div className="text-xs text-sky-600 dark:text-sky-400 font-semibold">
                        לפי לוח: <span className="font-bold text-foreground">{todayCalUnit}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground flex-1 truncate">
                        {todayCalUnit && todayCalUnit === nextUnit ? "הלימוד להיום: " : "הבאה לסימון: "}
                        <span className="font-semibold text-foreground">{nextUnit}</span>
                      </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        onClick={() => completeGeneralPlanUnit(plan.id, nextUnit)}
                        className="h-7 text-xs bg-gradient-navy text-primary-foreground rounded-lg px-2.5"
                      >
                        <Check className="h-3 w-3" />
                        סיימתי
                      </Button>
                      {plan.completedUnits.length > 0 && (
                        <button
                          onClick={() => undoLastGeneralPlanUnit(plan.id)}
                          className={cn("h-7 w-7 flex items-center justify-center rounded-lg border border-gold/30 text-muted-foreground hover:text-foreground hover:border-gold/60 transition-colors", isDarkCard && "text-primary-foreground/90 hover:text-primary-foreground border-gold/60")}
                          title="בטל אחרון"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  </div>
                )
                )}

                {/* ETA — not for masechta_review or deck_review */}
                {plan.planType !== "masechta_review" && plan.planType !== "deck_review" && etaDate && (
                  <div className="text-[11px] text-muted-foreground text-center border-t border-gold/15 pt-1.5">
                    סיום משוער: {etaDate} ({daysLeft} {hasSkips ? "ימים פעילים" : "ימים"})
                  </div>
                )}

                {/* Retention row — not for masechta_review or deck_review */}
                {plan.planType !== "masechta_review" && plan.planType !== "deck_review" && plan.completedUnits.length > 0 && (
                  <div className="flex items-center gap-1 justify-end flex-wrap border-t border-gold/10 pt-1.5">
                    <span className="text-[10px] text-muted-foreground ml-1">שמירת חומר:</span>
                    {plan.completedUnits.slice(-12).map((unit) => {
                      const status = retentionStatus(unit, plan.id, planReviews);
                      return (
                        <button
                          key={unit}
                          onClick={() => setQuickReviewPlanId(plan.id)}
                          title={`${unit} — ${status === "overdue" ? "פגר" : status === "due-soon" ? "בקרוב" : status === "ok" ? "מזומן" : "הושלם"}`}
                          className={cn(
                            "h-2.5 w-2.5 rounded-full transition-transform hover:scale-125",
                            status === "overdue"   ? "bg-destructive" :
                            status === "due-soon"  ? "bg-amber-400" :
                            status === "ok"        ? "bg-emerald-400" :
                            "bg-emerald-700/60"
                          )}
                        />
                      );
                    })}
                  </div>
                )}
                {/* Inline schedule view */}
                {scheduleOpenPlans.has(plan.id) && plan.planType !== "masechta_review" && plan.planType !== "deck_review" && (
                  <div className="border-t border-gold/20 pt-2">
                    <PlanScheduleView
                      plan={plan}
                      planReviews={planReviews.filter((r) => r.planId === plan.id)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )
      )}

      {showArchive && (
        <div className="mt-4 rounded-xl border border-gold/30 bg-background/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-foreground">תוכניות בארכיון</div>
            <div className="text-xs text-muted-foreground">{archivedPlans.length} תוכניות</div>
          </div>
          {archivedPlans.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">אין תוכניות בארכיון כרגע</div>
          ) : (
            <div className="space-y-2">
              {archivedPlans.map((plan) => (
                <div key={plan.id} className="rounded-lg border border-gold/20 bg-card/70 p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{plan.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      הושלמו {plan.completedUnits.length}/{plan.units.length}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-gold/40"
                      onClick={() => unarchiveGeneralPlan(plan.id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      שחזר
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        stopCardNavigation(e);
                        pendingDeletePlanIdRef.current = plan.id;
                        setDeleteDialogPlanId(plan.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                      מחק
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={!!archiveDialogPlanId}
        onOpenChange={(open) => {
          if (!open) setArchiveDialogPlanId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>שליחה לארכיון</DialogTitle>
            <DialogDescription>
              {archiveDialogPlan ? `התוכנית "${archiveDialogPlan.title}" תועבר לארכיון.` : "התוכנית תועבר לארכיון."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-foreground">
              להציג את התוכנית בארכיון אחרי הארכוב?
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setArchiveDialogPlanId(null)}
              >
                ביטול
              </Button>
              <Button
                variant="outline"
                className="border-gold/50"
                onClick={() => {
                  if (archiveDialogPlanId) archiveGeneralPlan(archiveDialogPlanId);
                  setShowArchive(false);
                  setArchiveDialogPlanId(null);
                }}
              >
                ארכב והסתר
              </Button>
              <Button
                onClick={() => {
                  if (archiveDialogPlanId) archiveGeneralPlan(archiveDialogPlanId);
                  setShowArchive(true);
                  setArchiveDialogPlanId(null);
                }}
                className="bg-gradient-navy text-primary-foreground"
              >
                ארכב והצג
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteDialogPlanId}
        onOpenChange={(open) => {
          if (!open) setDeleteDialogPlanId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>מחיקת תוכנית לימוד</DialogTitle>
            <DialogDescription>
              {deleteDialogPlan ? `התוכנית "${deleteDialogPlan.title}" תימחק לצמיתות.` : "התוכנית תימחק לצמיתות."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-foreground">
              המחיקה תבוצע באופן מלא ורטרואקטיבי: התוכנית, החזרות והיסטוריית הלמידה הקשורות יימחקו.
            </div>
            <div className="text-xs text-muted-foreground">
              אי אפשר לשחזר לאחר מחיקה.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  pendingDeletePlanIdRef.current = null;
                  setDeleteDialogPlanId(null);
                }}
              >
                ביטול
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const targetPlanId = deleteDialogPlanId ?? pendingDeletePlanIdRef.current;
                  if (targetPlanId) deleteGeneralPlan(targetPlanId, { purgeHistory: true });
                  pendingDeletePlanIdRef.current = null;
                  setDeleteDialogPlanId(null);
                }}
              >
                מחק לצמיתות
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Global review-schedule dialog (triggered from plan cards) */}
      <ReviewScheduleDialog open={reviewScheduleOpen} onOpenChange={setReviewScheduleOpen} />
    </Card>
  );
}
