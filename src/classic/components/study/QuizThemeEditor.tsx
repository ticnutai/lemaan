import React, { useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorFavoritesRow } from "@/components/ui/color-favorites-row";
import { cn } from "@/lib/utils";
import { useColorFavorites } from "@/lib/study/colorFavorites";
import {
  Check,
  Copy,
  Edit2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Save,
  Trash2,
  Plus,
  Palette,
  FolderOpen,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CustomQuizTheme {
  questionBg: string;
  questionText: string;
  questionBorder: string;
  questionFontFamily:
    | "sans"
    | "serif"
    | "mono"
    | "display"
    | "david"
    | "arial"
    | "frank"
    | "times";
  questionFontSize:
    | "sm"
    | "base"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "4xl"
    | "5xl"
    | "6xl";
  questionFontWeight: "normal" | "semibold" | "bold";
  answerFontFamily:
    | "sans"
    | "serif"
    | "mono"
    | "display"
    | "david"
    | "arial"
    | "frank"
    | "times";
  answerFontSize:
    | "sm"
    | "base"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "4xl"
    | "5xl"
    | "6xl";
  answerFontWeight: "normal" | "semibold" | "bold";
  optionsLayout: "list" | "grid";
  optionsBorderRadius: "sm" | "md" | "lg" | "full";
  optionWrapperBg: string;
  optionColors: Array<{ bg: string; text: string; border: string }>;
  badgeBorderColor: string;
  badgeTextColor: string;
  breadcrumbColor: string;
}

export interface SavedTheme {
  id: string;
  name: string;
  theme: CustomQuizTheme;
  createdAt: number;
  updatedAt?: number;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export const SAVED_THEMES_KEY = "quiz_saved_themes";

function loadSavedThemes(): SavedTheme[] {
  try {
    return JSON.parse(
      localStorage.getItem(SAVED_THEMES_KEY) ?? "[]",
    ) as SavedTheme[];
  } catch {
    return [];
  }
}
function storeSavedThemes(themes: SavedTheme[]) {
  try {
    localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(themes));
  } catch {
    /* quota */
  }
}

// ─── Constants / maps (exported for use in StudySession) ──────────────────────

export const FONT_FAMILY_MAP: Record<
  CustomQuizTheme["questionFontFamily"],
  string
> = {
  sans: "Heebo, sans-serif",
  display: '"Playfair Display", Heebo, serif',
  serif: "Georgia, serif",
  mono: "monospace",
  david: "David, 'David CLM', serif",
  arial: "Arial, sans-serif",
  frank: "'Frank Ruhl Libre', serif",
  times: "'Times New Roman', serif",
};

export const FONT_SIZE_MAP: Record<
  CustomQuizTheme["questionFontSize"],
  string
> = {
  sm: "14px",
  base: "16px",
  lg: "18px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "30px",
  "4xl": "36px",
  "5xl": "48px",
  "6xl": "60px",
};

export const FONT_WEIGHT_MAP: Record<
  CustomQuizTheme["questionFontWeight"],
  string
> = {
  normal: "400",
  semibold: "600",
  bold: "700",
};

export const BORDER_RADIUS_MAP: Record<
  CustomQuizTheme["optionsBorderRadius"],
  string
> = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  full: "999px",
};

const FONT_FAMILY_OPTIONS: {
  value: CustomQuizTheme["questionFontFamily"];
  label: string;
}[] = [
  { value: "sans", label: "Heebo (ברירת מחדל)" },
  { value: "david", label: "דוד (David)" },
  { value: "arial", label: "Arial" },
  { value: "frank", label: "Frank Ruhl Libre" },
  { value: "display", label: "Playfair (כותרת)" },
  { value: "serif", label: "Georgia (ספרי)" },
  { value: "times", label: "Times New Roman" },
  { value: "mono", label: "Monospace (קוד)" },
];

const FONT_SIZE_OPTIONS: {
  value: CustomQuizTheme["questionFontSize"];
  label: string;
}[] = [
  { value: "sm", label: "קטן מאוד (14)" },
  { value: "base", label: "קטן (16)" },
  { value: "lg", label: "בינוני (18)" },
  { value: "xl", label: "גדול (20)" },
  { value: "2xl", label: "גדול מאוד (24)" },
  { value: "3xl", label: "ענק (30)" },
  { value: "4xl", label: "ענק (36)" },
  { value: "5xl", label: "ענק מאוד (48)" },
  { value: "6xl", label: "ענקק (60)" },
];

const FONT_WEIGHT_OPTIONS: {
  value: CustomQuizTheme["questionFontWeight"];
  label: string;
}[] = [
  { value: "normal", label: "רגיל" },
  { value: "semibold", label: "חצי מודגש" },
  { value: "bold", label: "מודגש" },
];

const BORDER_RADIUS_OPTIONS: {
  value: CustomQuizTheme["optionsBorderRadius"];
  label: string;
}[] = [
  { value: "sm", label: "מרובע" },
  { value: "md", label: "עגול" },
  { value: "lg", label: "עגול מאוד" },
  { value: "full", label: "מעגל" },
];

const OPTION_LABELS = ["א", "ב", "ג", "ד", "ה", "ו"];

export const DEFAULT_CUSTOM_THEME: CustomQuizTheme = {
  questionBg: "#f8f6f0",
  questionText: "#1a1a2e",
  questionBorder: "#c9a84c",
  questionFontFamily: "sans",
  questionFontSize: "2xl",
  questionFontWeight: "semibold",
  answerFontFamily: "sans",
  answerFontSize: "base",
  answerFontWeight: "semibold",
  optionsLayout: "grid",
  optionsBorderRadius: "lg",
  optionWrapperBg: "",
  optionColors: [
    { bg: "#3b82f6", text: "#ffffff", border: "#60a5fa" },
    { bg: "#10b981", text: "#ffffff", border: "#34d399" },
    { bg: "#f97316", text: "#ffffff", border: "#fb923c" },
    { bg: "#8b5cf6", text: "#ffffff", border: "#a78bfa" },
    { bg: "#14b8a6", text: "#ffffff", border: "#2dd4bf" },
    { bg: "#f43f5e", text: "#ffffff", border: "#fb7185" },
  ],
  badgeBorderColor: "#d9a326",
  badgeTextColor: "#0c1c3b",
  breadcrumbColor: "#576175",
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  palette?: string[];
  onPaletteAdd?: (v: string) => void;
}
function ColorField({
  label,
  value,
  onChange,
  palette = [],
  onPaletteAdd,
}: ColorFieldProps) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {label}
        </span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-border p-0.5 bg-transparent shrink-0"
        />
        <span className="text-[10px] font-mono text-muted-foreground">
          {value}
        </span>
        {onPaletteAdd && (
          <button
            type="button"
            title="שמור צבע ללוח הצבעים"
            onClick={() => onPaletteAdd(value)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {palette.length > 0 && (
        <div className="flex flex-wrap gap-1 pr-1">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onChange(c)}
              className={cn(
                "w-5 h-5 rounded-sm border-2 transition-transform hover:scale-110",
                c === value ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SavedThemeCard ───────────────────────────────────────────────────────────

function SavedThemeCard({
  saved,
  onLoad,
  onEdit,
  onDelete,
}: {
  saved: SavedTheme;
  onLoad: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colors = saved.theme.optionColors.slice(0, 4);
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors">
      <div className="flex gap-1 shrink-0">
        <div
          className="w-5 h-10 rounded-md border border-border/50"
          style={{ backgroundColor: saved.theme.questionBg }}
        />
        <div className="flex flex-col gap-1">
          {colors.map((c, i) => (
            <div
              key={i}
              className="w-4 h-[18px] rounded-sm"
              style={{ backgroundColor: c.bg }}
            />
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate text-right">
          {saved.name}
        </p>
        <p className="text-[10px] text-muted-foreground text-right">
          {new Date(saved.createdAt).toLocaleDateString("he-IL")}
        </p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs gap-1"
          onClick={onLoad}
        >
          <FolderOpen className="h-3 w-3" /> טען
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs gap-1 border-gold/40"
          onClick={onEdit}
          title="ערוך ושמור על הערכה הזו"
        >
          <Edit2 className="h-3 w-3" /> ערוך
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── AddColorToPalette ────────────────────────────────────────────────────────

function AddColorToPalette({ onAdd }: { onAdd: (v: string) => void }) {
  const [color, setColor] = useState("#3b82f6");
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/30 border border-border/50">
      <span className="text-xs text-muted-foreground shrink-0">הוסף צבע:</span>
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border border-border p-0.5 bg-transparent"
      />
      <span className="text-[10px] font-mono text-muted-foreground flex-1">
        {color}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs gap-1"
        onClick={() => onAdd(color)}
      >
        <Plus className="h-3 w-3" /> הוסף
      </Button>
    </div>
  );
}

// ─── ThemePreview ─────────────────────────────────────────────────────────────
function ThemePreview({ theme }: { theme: CustomQuizTheme }) {
  const fontFamily = FONT_FAMILY_MAP[theme.questionFontFamily];
  const fontSize = FONT_SIZE_MAP[theme.questionFontSize];
  const fontWeight = FONT_WEIGHT_MAP[theme.questionFontWeight];
  const ansFontFamily = FONT_FAMILY_MAP[theme.answerFontFamily];
  const ansFontSize = FONT_SIZE_MAP[theme.answerFontSize];
  const ansFontWeight = FONT_WEIGHT_MAP[theme.answerFontWeight];
  const radius = BORDER_RADIUS_MAP[theme.optionsBorderRadius];
  const isGrid = theme.optionsLayout === "grid";

  const PREVIEW_OPTS = [
    "תשובה ראשונה",
    "תשובה שנייה",
    "תשובה שלישית",
    "תשובה רביעית",
  ];

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Question box */}
      <div
        className="relative p-4 pt-8 border-b-2"
        style={{
          backgroundColor: theme.questionBg,
          borderColor: theme.questionBorder,
        }}
      >
        {/* Badge (top-right) */}
        <div
          className="absolute top-2 right-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
          style={{
            borderColor: theme.badgeBorderColor,
            color: theme.badgeTextColor,
          }}
        >
          משולבת
        </div>
        {/* Breadcrumb (top-left) */}
        <span
          className="absolute top-2 left-2 text-[10px] max-w-[55%] truncate"
          dir="rtl"
          style={{ color: theme.breadcrumbColor }}
        >
          זרעים ❯ ברכות ❯ ברכות · ג.
        </span>
        <p
          className="text-right leading-relaxed"
          style={{
            color: theme.questionText,
            fontFamily,
            fontSize,
            fontWeight,
          }}
        >
          מנין שיסורין ממרקין כל עוונותיו של אדם?
        </p>
      </div>
      {/* Options */}
      <div
        className={cn(isGrid ? "grid grid-cols-2 gap-2 p-3" : "space-y-2 p-3")}
        style={
          theme.optionWrapperBg
            ? { backgroundColor: theme.optionWrapperBg }
            : {}
        }
      >
        {PREVIEW_OPTS.map((opt, i) => {
          const c = theme.optionColors[i] ?? theme.optionColors[0];
          return (
            <div
              key={i}
              className="flex items-center gap-2 p-2.5 border-2 text-right"
              style={{
                backgroundColor: c.bg,
                color: c.text,
                borderColor: c.border,
                borderRadius: radius,
              }}
            >
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border"
                style={{
                  backgroundColor: c.text + "22",
                  color: c.text,
                  borderColor: c.text + "55",
                }}
              >
                {OPTION_LABELS[i]}
              </span>
              <span
                className="flex-1 text-right"
                style={{
                  fontFamily: ansFontFamily,
                  fontSize: ansFontSize,
                  fontWeight: ansFontWeight,
                }}
              >
                {opt}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  value: CustomQuizTheme;
  onSave: (v: CustomQuizTheme) => void;
  savedThemes?: SavedTheme[];
  onSavedThemesChange?: (themes: SavedTheme[]) => void;
  onPreview?: (v: CustomQuizTheme) => void;
  onClose: () => void;
}

export function QuizThemeEditorDialog({
  open,
  value,
  onSave,
  savedThemes: syncedSavedThemes,
  onSavedThemesChange,
  onPreview,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<CustomQuizTheme>(value);
  const [showOpts, setShowOpts] = useState(true);
  const [tab, setTab] = useState("edit");

  // Track the original theme when dialog opens (for cancel restore)
  const originalValueRef = useRef<CustomQuizTheme>(value);

  // Saved themes
  const [localSavedThemes, setLocalSavedThemes] = useState<SavedTheme[]>(loadSavedThemes);
  const savedThemes = syncedSavedThemes ?? localSavedThemes;
  const {
    favorites: palette,
    addFavorite: addPaletteColor,
    removeFavorite: removePaletteColor,
    moveFavorite: movePaletteColor,
  } = useColorFavorites();

  // Save-as-name flow
  const [showSaveName, setShowSaveName] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null);

  const handleOpenChange = (o: boolean) => {
    if (o) {
      originalValueRef.current = value;
      setDraft(value);
      setShowSaveName(false);
      setSaveName("");
      setEditingSavedId(null);
    } else onClose();
  };

  const update = useCallback(
    <K extends keyof CustomQuizTheme>(key: K, val: CustomQuizTheme[K]) => {
      setDraft((d) => {
        const next = { ...d, [key]: val };
        onPreview?.(next);
        return next;
      });
    },
    [onPreview],
  );

  const updateOptionColor = useCallback(
    (i: number, field: "bg" | "text" | "border", val: string) => {
      setDraft((d) => {
        const colors = [...d.optionColors];
        colors[i] = { ...colors[i], [field]: val };
        const next = { ...d, optionColors: colors };
        onPreview?.(next);
        return next;
      });
    },
    [onPreview],
  );

  const handlePaletteAdd = useCallback((color: string) => {
    addPaletteColor(color);
  }, [addPaletteColor]);

  const handlePaletteDelete = useCallback((color: string) => {
    removePaletteColor(color);
  }, [removePaletteColor]);

  const handleSaveNamed = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    const entry: SavedTheme = {
      id: Date.now().toString(),
      name,
      theme: { ...draft },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [entry, ...savedThemes];
    storeSavedThemes(next);
    onSavedThemesChange?.(next);
    if (!onSavedThemesChange) setLocalSavedThemes(next);
    setShowSaveName(false);
    setSaveName("");
    setEditingSavedId(entry.id);
    setTab("saved");
  }, [draft, onSavedThemesChange, saveName, savedThemes]);

  const handleDeleteSaved = useCallback((id: string) => {
    const next = savedThemes.filter((t) => t.id !== id);
    storeSavedThemes(next);
    onSavedThemesChange?.(next);
    if (!onSavedThemesChange) setLocalSavedThemes(next);
    if (editingSavedId === id) setEditingSavedId(null);
  }, [editingSavedId, onSavedThemesChange, savedThemes]);

  const handleEditSaved = useCallback((saved: SavedTheme) => {
    setDraft({ ...DEFAULT_CUSTOM_THEME, ...saved.theme });
    setEditingSavedId(saved.id);
    setSaveName(saved.name);
    setShowSaveName(false);
    setTab("edit");
  }, []);

  const handleOverwriteSaved = useCallback(() => {
    if (!editingSavedId) return;
    const now = Date.now();
    const next = savedThemes.map((t) => t.id === editingSavedId
      ? { ...t, name: saveName.trim() || t.name, theme: { ...draft }, updatedAt: now }
      : t,
    );
    storeSavedThemes(next);
    onSavedThemesChange?.(next);
    if (!onSavedThemesChange) setLocalSavedThemes(next);
    onSave(draft);
    onClose();
  }, [draft, editingSavedId, onClose, onSave, onSavedThemesChange, saveName, savedThemes]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal={false}>
      <DialogContent
        className="max-h-[92vh] overflow-hidden flex flex-col"
        style={{ maxWidth: "min(56rem, 95vw)" }}
        dir="rtl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>עיצוב ערכת נושא מותאמת אישית</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex-1 overflow-hidden flex flex-col min-h-0"
        >
          <TabsList className="shrink-0 self-start gap-1">
            <TabsTrigger value="edit" className="text-xs gap-1.5">
              <Palette className="h-3.5 w-3.5" /> עריכה
            </TabsTrigger>
            <TabsTrigger value="saved" className="text-xs gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" /> ערכות שמורות
              {savedThemes.length > 0 && (
                <span className="text-[10px] bg-gold/30 text-foreground rounded-full px-1.5 leading-5">
                  {savedThemes.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="palette" className="text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" /> לוח צבעים
              {palette.length > 0 && (
                <span className="text-[10px] bg-gold/30 text-foreground rounded-full px-1.5 leading-5">
                  {palette.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── EDIT TAB ── */}
          <TabsContent
            value="edit"
            className="flex-1 overflow-hidden flex flex-col md:flex-row gap-4 mt-3 min-h-0"
          >
            {/* Left: controls (scrollable) */}
            <div className="flex-1 overflow-y-auto space-y-4 min-w-0 pr-0.5">
              {/* Mobile-only inline preview */}
              <div className="md:hidden">
                <p className="text-xs text-muted-foreground mb-2">
                  תצוגה מקדימה:
                </p>
                <ThemePreview theme={draft} />
              </div>

              {/* Question area */}
              <div className="space-y-3 pt-3 border-t border-border">
                <h4 className="font-semibold text-sm">אזור השאלה</h4>
                <div className="flex flex-wrap gap-x-5 gap-y-3">
                  <ColorField
                    label="רקע"
                    value={draft.questionBg}
                    onChange={(v) => update("questionBg", v)}
                    palette={palette}
                    onPaletteAdd={handlePaletteAdd}
                  />
                  <ColorField
                    label="טקסט"
                    value={draft.questionText}
                    onChange={(v) => update("questionText", v)}
                    palette={palette}
                    onPaletteAdd={handlePaletteAdd}
                  />
                  <ColorField
                    label="מסגרת"
                    value={draft.questionBorder}
                    onChange={(v) => update("questionBorder", v)}
                    palette={palette}
                    onPaletteAdd={handlePaletteAdd}
                  />
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">גופן</Label>
                      <Select
                        value={draft.questionFontFamily}
                        onValueChange={(v) =>
                          update(
                            "questionFontFamily",
                            v as CustomQuizTheme["questionFontFamily"],
                          )
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_FAMILY_OPTIONS.map((f) => (
                            <SelectItem
                              key={f.value}
                              value={f.value}
                              style={{ fontFamily: FONT_FAMILY_MAP[f.value] }}
                            >
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">משקל גופן</Label>
                      <div className="flex gap-1 pt-0.5">
                        {FONT_WEIGHT_OPTIONS.map((w) => (
                          <button
                            key={w.value}
                            type="button"
                            onClick={() =>
                              update("questionFontWeight", w.value)
                            }
                            className={cn(
                              "h-8 flex-1 rounded-md text-xs border transition-colors",
                              draft.questionFontWeight === w.value
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border hover:bg-secondary",
                            )}
                            style={{ fontWeight: FONT_WEIGHT_MAP[w.value] }}
                          >
                            {w.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">גודל גופן</Label>
                      <span className="text-xs font-mono text-muted-foreground">
                        {FONT_SIZE_MAP[draft.questionFontSize]}
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={FONT_SIZE_OPTIONS.length - 1}
                      step={1}
                      value={[
                        Math.max(
                          0,
                          FONT_SIZE_OPTIONS.findIndex(
                            (f) => f.value === draft.questionFontSize,
                          ),
                        ),
                      ]}
                      onValueChange={([i]) =>
                        update("questionFontSize", FONT_SIZE_OPTIONS[i].value)
                      }
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      {FONT_SIZE_OPTIONS.map((f) => (
                        <span key={f.value}>{f.value}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Badge & breadcrumb */}
              <div className="space-y-3 pt-3 border-t border-border">
                <h4 className="font-semibold text-sm">
                  תגית סוג ונתיב קטגוריה
                </h4>
                <div className="flex flex-wrap gap-x-5 gap-y-3">
                  <ColorField
                    label="מסגרת תגית"
                    value={draft.badgeBorderColor}
                    onChange={(v) => update("badgeBorderColor", v)}
                    palette={palette}
                    onPaletteAdd={handlePaletteAdd}
                  />
                  <ColorField
                    label="טקסט תגית"
                    value={draft.badgeTextColor}
                    onChange={(v) => update("badgeTextColor", v)}
                    palette={palette}
                    onPaletteAdd={handlePaletteAdd}
                  />
                  <ColorField
                    label="נתיב קטגוריה"
                    value={draft.breadcrumbColor}
                    onChange={(v) => update("breadcrumbColor", v)}
                    palette={palette}
                    onPaletteAdd={handlePaletteAdd}
                  />
                </div>
              </div>

              {/* Options area */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">אזור התשובות</h4>
                  <button
                    type="button"
                    onClick={() => setShowOpts((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {showOpts ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {showOpts ? "הסתר" : "הצג"}
                  </button>
                </div>
                {showOpts && (
                  <>
                    {/* Answer font controls */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">גופן תשובות</Label>
                          <Select
                            value={draft.answerFontFamily}
                            onValueChange={(v) =>
                              update(
                                "answerFontFamily",
                                v as CustomQuizTheme["answerFontFamily"],
                              )
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FONT_FAMILY_OPTIONS.map((f) => (
                                <SelectItem
                                  key={f.value}
                                  value={f.value}
                                  style={{
                                    fontFamily: FONT_FAMILY_MAP[f.value],
                                  }}
                                >
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">משקל גופן תשובות</Label>
                          <div className="flex gap-1 pt-0.5">
                            {FONT_WEIGHT_OPTIONS.map((w) => (
                              <button
                                key={w.value}
                                type="button"
                                onClick={() =>
                                  update("answerFontWeight", w.value)
                                }
                                className={cn(
                                  "h-8 flex-1 rounded-md text-xs border transition-colors",
                                  draft.answerFontWeight === w.value
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border hover:bg-secondary",
                                )}
                                style={{ fontWeight: FONT_WEIGHT_MAP[w.value] }}
                              >
                                {w.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">גודל גופן תשובות</Label>
                          <span className="text-xs font-mono text-muted-foreground">
                            {FONT_SIZE_MAP[draft.answerFontSize]}
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={FONT_SIZE_OPTIONS.length - 1}
                          step={1}
                          value={[
                            Math.max(
                              0,
                              FONT_SIZE_OPTIONS.findIndex(
                                (f) => f.value === draft.answerFontSize,
                              ),
                            ),
                          ]}
                          onValueChange={([i]) =>
                            update("answerFontSize", FONT_SIZE_OPTIONS[i].value)
                          }
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          {FONT_SIZE_OPTIONS.map((f) => (
                            <span key={f.value}>{f.value}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">פריסה</Label>
                        <Select
                          value={draft.optionsLayout}
                          onValueChange={(v) =>
                            update("optionsLayout", v as "list" | "grid")
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="grid">
                              גריד (2 עמודות)
                            </SelectItem>
                            <SelectItem value="list">רשימה</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">פינות</Label>
                        <Select
                          value={draft.optionsBorderRadius}
                          onValueChange={(v) =>
                            update(
                              "optionsBorderRadius",
                              v as CustomQuizTheme["optionsBorderRadius"],
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BORDER_RADIUS_OPTIONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <ColorField
                      label="רקע אזור תשובות (ריק = שקוף)"
                      value={draft.optionWrapperBg || "#ffffff"}
                      onChange={(v) =>
                        update("optionWrapperBg", v === "#ffffff" ? "" : v)
                      }
                      palette={palette}
                      onPaletteAdd={handlePaletteAdd}
                    />
                    <div className="space-y-2">
                      <Label className="text-xs">צבע לכל תשובה</Label>
                      {draft.optionColors.map((c, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-start gap-x-4 gap-y-2 p-2.5 rounded-lg bg-secondary/30 border border-border/50"
                        >
                          <span
                            className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 border mt-0.5"
                            style={{
                              backgroundColor: c.bg,
                              color: c.text,
                              borderColor: c.border,
                            }}
                          >
                            {OPTION_LABELS[i]}
                          </span>
                          <ColorField
                            label="רקע"
                            value={c.bg}
                            onChange={(v) => updateOptionColor(i, "bg", v)}
                            palette={palette}
                            onPaletteAdd={handlePaletteAdd}
                          />
                          <ColorField
                            label="טקסט"
                            value={c.text}
                            onChange={(v) => updateOptionColor(i, "text", v)}
                            palette={palette}
                            onPaletteAdd={handlePaletteAdd}
                          />
                          <ColorField
                            label="מסגרת"
                            value={c.border}
                            onChange={(v) => updateOptionColor(i, "border", v)}
                            palette={palette}
                            onPaletteAdd={handlePaletteAdd}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            {/* end controls column */}

            {/* Right: sticky live preview (desktop only) */}
            <div className="hidden md:flex flex-col gap-3 w-[290px] shrink-0 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground">
                תצוגה מקדימה
              </p>
              <ThemePreview theme={draft} />
            </div>
          </TabsContent>

          {/* ── SAVED THEMES TAB ── */}
          <TabsContent
            value="saved"
            className="flex-1 overflow-y-auto mt-3 min-h-0 pr-0.5"
          >
            {savedThemes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center gap-3 text-muted-foreground">
                <FolderOpen className="h-10 w-10 opacity-30" />
                <p className="text-sm">אין ערכות שמורות עדיין</p>
                <p className="text-xs">
                  עבור לטאב "עריכה" וכוון את הערכה, אחר כך לחץ "שמור בשם…"
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {savedThemes.map((s) => (
                  <SavedThemeCard
                    key={s.id}
                    saved={s}
                    onLoad={() => {
                      setDraft({ ...DEFAULT_CUSTOM_THEME, ...s.theme });
                      setEditingSavedId(null);
                      setTab("edit");
                    }}
                    onEdit={() => handleEditSaved(s)}
                    onDelete={() => handleDeleteSaved(s.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── PALETTE TAB ── */}
          <TabsContent
            value="palette"
            className="flex-1 overflow-y-auto mt-3 min-h-0 pr-0.5"
          >
            <div className="space-y-4">
              <AddColorToPalette onAdd={handlePaletteAdd} />
              {palette.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-center gap-2">
                  <Palette className="h-8 w-8 opacity-30" />
                  <p className="text-xs">
                    לוח הצבעים ריק — לחץ + ליד כל שדה צבע בטאב העריכה כדי לשמור
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-muted-foreground mb-3">
                    גרור כדי לשנות סדר · לחץ X למחיקה · צבעים אלו זמינים בכל בוררי הצבע באפליקציה
                  </p>
                  <ColorFavoritesRow
                    favorites={palette}
                    onRemove={handlePaletteDelete}
                    onMove={movePaletteColor}
                    emptyText="אין צבעים מועדפים עדיין"
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Actions (always visible) ── */}
        <div className="shrink-0 border-t border-border pt-3">
          {showSaveName ? (
            <div className="flex gap-2 items-center">
              <Input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="שם הערכה (למשל: לילה כחול)"
                className="h-8 text-sm text-right flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveNamed();
                  if (e.key === "Escape") setShowSaveName(false);
                }}
              />
              <Button
                size="sm"
                onClick={handleSaveNamed}
                disabled={!saveName.trim()}
                className="h-8 bg-gradient-navy text-primary-foreground gap-1 shrink-0"
              >
                <Check className="h-3.5 w-3.5" /> שמור
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setShowSaveName(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 justify-end">
              {editingSavedId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOverwriteSaved}
                  className="gap-1 border-gold/60"
                >
                  <Save className="h-3.5 w-3.5" /> שמור ודרוס
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(DEFAULT_CUSTOM_THEME);
                  onPreview?.(DEFAULT_CUSTOM_THEME);
                }}
                className="gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" /> איפוס
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowSaveName(true);
                  setSaveName("");
                  setEditingSavedId(null);
                }}
                className="gap-1"
              >
                <Copy className="h-3.5 w-3.5" /> שכפל ושמור…
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onPreview?.(originalValueRef.current);
                  onClose();
                }}
              >
                ביטול
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onSave(draft);
                  onClose();
                }}
                className="bg-gradient-navy text-primary-foreground gap-1"
              >
                <Check className="h-3.5 w-3.5" /> החל
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
