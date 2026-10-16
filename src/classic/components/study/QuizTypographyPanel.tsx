/**
 * QuizTypographyPanel — non-blocking floating popover for quiz text formatting.
 * Provides quick access to font family, size, weight, line-height, letter spacing,
 * alignment, colours, border-radius, and text shadow.
 * Settings are stored in localStorage and applied as style overrides on top of
 * whatever quiz theme is currently active.
 */

import { useCallback, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorFavoritesRow } from "@/components/ui/color-favorites-row";
import { cn } from "@/lib/utils";
import { useColorFavorites } from "@/lib/study/colorFavorites";
import {
  AlignRight, AlignCenter, AlignLeft, AlignJustify, RotateCcw, Type,
  Bold, Minus, Plus, CaseSensitive, WrapText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuizTypography {
  fontFamily: string;       // CSS font-family string, "" = no override
  fontSize: number;         // px, 0 = no override
  fontWeight: string;       // "400" | "500" | "600" | "700" | "800" | "" = no override
  lineHeight: number;       // e.g. 1.6, 0 = no override
  letterSpacing: number;    // px, 999 = no override sentinel
  align: "right" | "center" | "left" | "justify";
  textColor: string;        // hex, "" = no override
  bgColor: string;          // hex, "" = no override
  borderRadius: number;     // px, -1 = no override
  textShadow: boolean;
  uppercase: boolean;
}

export const QUIZ_TYPOGRAPHY_KEY = "quiz_typography_v1";
export const ANSWER_TYPOGRAPHY_KEY = "answer_typography_v1";

export const DEFAULT_QUIZ_TYPOGRAPHY: QuizTypography = {
  fontFamily: "",
  fontSize: 0,
  fontWeight: "",
  lineHeight: 0,
  letterSpacing: 999,
  align: "right",
  textColor: "",
  bgColor: "",
  borderRadius: -1,
  textShadow: false,
  uppercase: false,
};

export function loadTypography(key: string = QUIZ_TYPOGRAPHY_KEY): QuizTypography {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...DEFAULT_QUIZ_TYPOGRAPHY, ...JSON.parse(raw) } : DEFAULT_QUIZ_TYPOGRAPHY;
  } catch {
    return DEFAULT_QUIZ_TYPOGRAPHY;
  }
}

export function loadAnswerTypography(): QuizTypography {
  return loadTypography(ANSWER_TYPOGRAPHY_KEY);
}

export function storeTypography(t: QuizTypography, key: string = QUIZ_TYPOGRAPHY_KEY) {
  try { localStorage.setItem(key, JSON.stringify(t)); } catch { /* quota */ }
}

export function storeAnswerTypography(t: QuizTypography) {
  storeTypography(t, ANSWER_TYPOGRAPHY_KEY);
}

// ─── Font options ─────────────────────────────────────────────────────────────

export const TYPOGRAPHY_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "ברירת מחדל (Heebo)",     value: "Heebo, sans-serif" },
  { label: "Arial",                   value: "Arial, sans-serif" },
  { label: "דוד (David)",            value: "David, 'David CLM', serif" },
  { label: "Frank Ruhl Libre (ספרי)", value: "'Frank Ruhl Libre', serif" },
  { label: "Playfair Display (כותרת)", value: "'Playfair Display', serif" },
  { label: "Georgia (ספרי)",          value: "Georgia, serif" },
  { label: "Courier / Monospace",     value: "monospace" },
  { label: "Times New Roman",         value: "'Times New Roman', serif" },
];

// ─── Build CSS style from typography settings ─────────────────────────────────

export function typographyToStyle(t: QuizTypography): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (t.fontFamily)              s.fontFamily     = t.fontFamily;
  if (t.fontSize > 0)            s.fontSize       = `${t.fontSize}px`;
  if (t.fontWeight)              s.fontWeight     = t.fontWeight;
  if (t.lineHeight > 0)          s.lineHeight     = t.lineHeight;
  if (t.letterSpacing !== 999)   s.letterSpacing  = `${t.letterSpacing}px`;
  if (t.textColor)               s.color          = t.textColor;
  if (t.textShadow)              s.textShadow     = "0 1px 3px rgba(0,0,0,0.25)";
  if (t.uppercase)               s.textTransform  = "uppercase";
  return s;
}

export function typographyToBgStyle(t: QuizTypography): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (t.bgColor)        s.backgroundColor = t.bgColor;
  if (t.borderRadius >= 0) s.borderRadius = `${t.borderRadius}px`;
  return s;
}

// ─── Small control helpers ────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-8">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function AlignBtn({ cur, val, onClick }: { cur: string; val: "right" | "center" | "left" | "justify"; onClick: () => void }) {
  const Icon = val === "right" ? AlignRight : val === "center" ? AlignCenter : val === "left" ? AlignLeft : AlignJustify;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-7 h-7 rounded-md flex items-center justify-center border transition-colors",
        cur === val
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border hover:bg-secondary"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function WeightBtn({ cur, val, label, onClick }: { cur: string; val: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 px-2 rounded-md text-xs border transition-colors",
        cur === val
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border hover:bg-secondary"
      )}
      style={{ fontWeight: val }}
    >
      {label}
    </button>
  );
}

// ─── Mini preview ─────────────────────────────────────────────────────────────

function PreviewWithText({ t, text }: { t: QuizTypography; text: string }) {
  return (
    <div
      className="rounded-xl border-2 border-border/60 p-3 text-right transition-all"
      style={{ ...typographyToBgStyle(t), minHeight: 56, background: t.bgColor || "hsl(var(--secondary)/0.4)" }}
    >
      <p
        className={cn("leading-snug truncate", t.uppercase && "uppercase")}
        style={typographyToStyle(t)}
        dir="rtl"
      >
        {text}
      </p>
    </div>
  );
}

// ─── Reusable inner controls (used by both panel and combined dialog) ─────────

interface ControlsProps {
  value: QuizTypography;
  onChange: (t: QuizTypography) => void;
  storageKey: string;
  title: string;
  previewText: string;
}

export function TypographyControlsPanel({ value, onChange, storageKey, title, previewText }: ControlsProps) {
  const { favorites, addFavorite, removeFavorite, moveFavorite } = useColorFavorites();

  const upd = useCallback(
    <K extends keyof QuizTypography>(key: K, val: QuizTypography[K]) => {
      const next = { ...value, [key]: val };
      onChange(next);
      storeTypography(next, storageKey);
    },
    [value, onChange, storageKey]
  );

  const reset = useCallback(() => {
    onChange(DEFAULT_QUIZ_TYPOGRAPHY);
    storeTypography(DEFAULT_QUIZ_TYPOGRAPHY, storageKey);
  }, [onChange, storageKey]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm flex items-center gap-1.5">
          <Type className="h-4 w-4 text-gold" /> {title}
        </span>
        <button
          type="button"
          onClick={reset}
          title="אפס הכל"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          <RotateCcw className="h-3 w-3" /> איפוס
        </button>
      </div>

      {/* Live preview */}
      <PreviewWithText t={value} text={previewText} />

      {/* Font family */}
      <Row label="גופן">
        <Select
          value={value.fontFamily || "__default__"}
          onValueChange={(v) => upd("fontFamily", v === "__default__" ? "" : v)}
        >
          <SelectTrigger className="h-7 text-xs w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">ברירת מחדל</SelectItem>
            {TYPOGRAPHY_FONT_OPTIONS.map((f) => (
              <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      {/* Font size */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">גודל גופן</Label>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => upd("fontSize", Math.max(12, (value.fontSize || 22) - 1))} className="w-5 h-5 rounded flex items-center justify-center border border-border hover:bg-secondary">
              <Minus className="h-2.5 w-2.5" />
            </button>
            <span className="text-xs font-mono w-8 text-center">{value.fontSize > 0 ? `${value.fontSize}px` : "—"}</span>
            <button type="button" onClick={() => upd("fontSize", Math.min(60, (value.fontSize || 22) + 1))} className="w-5 h-5 rounded flex items-center justify-center border border-border hover:bg-secondary">
              <Plus className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-40" style={{ fontSize: 12 }}>א</span>
          <Slider
            min={12}
            max={60}
            step={1}
            value={[value.fontSize > 0 ? value.fontSize : 22]}
            onValueChange={([v]) => upd("fontSize", v)}
            className="flex-1"
          />
          <span className="text-base opacity-70 font-bold" style={{ fontSize: 20 }}>א</span>
        </div>
      </div>

      {/* Font weight */}
      <Row label="עובי גופן">
        <div className="flex gap-1">
          <WeightBtn cur={value.fontWeight} val="400" label="רגיל"    onClick={() => upd("fontWeight", value.fontWeight === "400"  ? "" : "400")} />
          <WeightBtn cur={value.fontWeight} val="600" label="חצי-מודגש" onClick={() => upd("fontWeight", value.fontWeight === "600" ? "" : "600")} />
          <WeightBtn cur={value.fontWeight} val="700" label="מודגש"   onClick={() => upd("fontWeight", value.fontWeight === "700"  ? "" : "700")} />
          <WeightBtn cur={value.fontWeight} val="800" label="כבד"     onClick={() => upd("fontWeight", value.fontWeight === "800"  ? "" : "800")} />
        </div>
      </Row>

      {/* Line height */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground flex items-center gap-1"><WrapText className="h-3 w-3" /> גובה שורה</Label>
          <span className="text-xs font-mono">{value.lineHeight > 0 ? value.lineHeight.toFixed(1) : "—"}</span>
        </div>
        <Slider
          min={1.0}
          max={3.0}
          step={0.1}
          value={[value.lineHeight > 0 ? value.lineHeight : 1.6]}
          onValueChange={([v]) => upd("lineHeight", parseFloat(v.toFixed(1)))}
        />
      </div>

      {/* Letter spacing */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">רווח בין אותיות</Label>
          <span className="text-xs font-mono">{value.letterSpacing !== 999 ? `${value.letterSpacing}px` : "—"}</span>
        </div>
        <Slider
          min={-2}
          max={10}
          step={0.5}
          value={[value.letterSpacing !== 999 ? value.letterSpacing : 0]}
          onValueChange={([v]) => upd("letterSpacing", v)}
        />
      </div>

      {/* Alignment */}
      <Row label="יישור">
        <div className="flex gap-1">
          <AlignBtn cur={value.align} val="right"   onClick={() => upd("align", "right")} />
          <AlignBtn cur={value.align} val="center"  onClick={() => upd("align", "center")} />
          <AlignBtn cur={value.align} val="left"    onClick={() => upd("align", "left")} />
          <AlignBtn cur={value.align} val="justify" onClick={() => upd("align", "justify")} />
        </div>
      </Row>

      {/* Text colour */}
      <Row label="צבע טקסט">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.textColor || "#1a1a2e"}
              onChange={(e) => upd("textColor", e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-border p-0.5 bg-transparent"
            />
            <span className="text-[10px] font-mono text-muted-foreground">{value.textColor || "ברירת מחדל"}</span>
            {value.textColor && (
              <button type="button" onClick={() => upd("textColor", "")} className="text-[10px] text-muted-foreground hover:text-foreground underline">נקה</button>
            )}
          </div>
          <ColorFavoritesRow
            favorites={favorites}
            currentColor={value.textColor || "#1a1a2e"}
            onAddCurrent={() => addFavorite(value.textColor || "#1a1a2e")}
            onPick={(color) => upd("textColor", color)}
            onRemove={removeFavorite}
            onMove={moveFavorite}
            className="pt-0.5"
          />
        </div>
      </Row>

      {/* Background colour */}
      <Row label="רקע">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.bgColor || "#f8f6f0"}
              onChange={(e) => upd("bgColor", e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-border p-0.5 bg-transparent"
            />
            <span className="text-[10px] font-mono text-muted-foreground">{value.bgColor || "ברירת מחדל"}</span>
            {value.bgColor && (
              <button type="button" onClick={() => upd("bgColor", "")} className="text-[10px] text-muted-foreground hover:text-foreground underline">נקה</button>
            )}
          </div>
          <ColorFavoritesRow
            favorites={favorites}
            currentColor={value.bgColor || "#f8f6f0"}
            onAddCurrent={() => addFavorite(value.bgColor || "#f8f6f0")}
            onPick={(color) => upd("bgColor", color)}
            onRemove={removeFavorite}
            onMove={moveFavorite}
            className="pt-0.5"
          />
        </div>
      </Row>

      {/* Border radius */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">עיגול פינות</Label>
          <span className="text-xs font-mono">{value.borderRadius >= 0 ? `${value.borderRadius}px` : "—"}</span>
        </div>
        <Slider
          min={0}
          max={48}
          step={2}
          value={[value.borderRadius >= 0 ? value.borderRadius : 16]}
          onValueChange={([v]) => upd("borderRadius", v)}
        />
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
        <button
          type="button"
          onClick={() => upd("textShadow", !value.textShadow)}
          className={cn(
            "flex items-center gap-1.5 h-7 px-3 rounded-lg border text-xs transition-colors",
            value.textShadow ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"
          )}
        >
          <Bold className="h-3 w-3" /> הצל טקסט
        </button>
        <button
          type="button"
          onClick={() => upd("uppercase", !value.uppercase)}
          className={cn(
            "flex items-center gap-1.5 h-7 px-3 rounded-lg border text-xs transition-colors",
            value.uppercase ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"
          )}
        >
          <CaseSensitive className="h-3.5 w-3.5" /> UPPERCASE
        </button>
      </div>
    </div>
  );
}

// ─── Main panel component ─────────────────────────────────────────────────────

interface Props {
  value: QuizTypography;
  onChange: (t: QuizTypography) => void;
  storageKey?: string;
  title?: string;
  previewText?: string;
  buttonTitle?: string;
}

export function QuizTypographyPanel({ value, onChange, storageKey = QUIZ_TYPOGRAPHY_KEY, title = "עיצוב טקסט שאלה", previewText = "מה הפסוק שאמר משה לבני ישראל במדבר?", buttonTitle = "עיצוב טיפוגרפיה של שאלה" }: Props) {
  const [open, setOpen] = useState(false);
  const { favorites, addFavorite, removeFavorite, moveFavorite } = useColorFavorites();

  const upd = useCallback(
    <K extends keyof QuizTypography>(key: K, val: QuizTypography[K]) => {
      const next = { ...value, [key]: val };
      onChange(next);
      storeTypography(next, storageKey);
    },
    [value, onChange, storageKey]
  );

  const reset = useCallback(() => {
    onChange(DEFAULT_QUIZ_TYPOGRAPHY);
    storeTypography(DEFAULT_QUIZ_TYPOGRAPHY, storageKey);
  }, [onChange, storageKey]);

  const isActive =
    value.fontFamily !== DEFAULT_QUIZ_TYPOGRAPHY.fontFamily ||
    value.fontSize !== DEFAULT_QUIZ_TYPOGRAPHY.fontSize ||
    value.fontWeight !== DEFAULT_QUIZ_TYPOGRAPHY.fontWeight ||
    value.lineHeight !== DEFAULT_QUIZ_TYPOGRAPHY.lineHeight ||
    value.letterSpacing !== DEFAULT_QUIZ_TYPOGRAPHY.letterSpacing ||
    value.textColor !== DEFAULT_QUIZ_TYPOGRAPHY.textColor ||
    value.bgColor !== DEFAULT_QUIZ_TYPOGRAPHY.bgColor ||
    value.borderRadius !== DEFAULT_QUIZ_TYPOGRAPHY.borderRadius ||
    value.textShadow !== DEFAULT_QUIZ_TYPOGRAPHY.textShadow ||
    value.uppercase !== DEFAULT_QUIZ_TYPOGRAPHY.uppercase;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title={buttonTitle}
          className={cn(
            "h-7 w-7 p-0 border-gold/50 hover:bg-gold/10 relative",
            isActive && "bg-gold/10 border-gold/80"
          )}
        >
          <Type className="h-3.5 w-3.5 text-gold" />
          {isActive && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-gold border border-background" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-80 p-4 space-y-4 max-h-[85vh] overflow-y-auto"
        dir="rtl"
        // Keep popover open when interacting with colour inputs etc.
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t?.tagName === "INPUT" && t.getAttribute("type") === "color") e.preventDefault();
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm flex items-center gap-1.5">
            <Type className="h-4 w-4 text-gold" /> {title}
          </span>
          <button
            type="button"
            onClick={reset}
            title="אפס הכל"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <RotateCcw className="h-3 w-3" /> איפוס
          </button>
        </div>

        {/* Live preview */}
        <PreviewWithText t={value} text={previewText} />

        {/* Font family */}
        <Row label="גופן">
          <Select
            value={value.fontFamily || "__default__"}
            onValueChange={(v) => upd("fontFamily", v === "__default__" ? "" : v)}
          >
            <SelectTrigger className="h-7 text-xs w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">ברירת מחדל</SelectItem>
              {TYPOGRAPHY_FONT_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        {/* Font size */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">גודל גופן</Label>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => upd("fontSize", Math.max(12, (value.fontSize || 22) - 1))} className="w-5 h-5 rounded flex items-center justify-center border border-border hover:bg-secondary">
                <Minus className="h-2.5 w-2.5" />
              </button>
              <span className="text-xs font-mono w-8 text-center">{value.fontSize > 0 ? `${value.fontSize}px` : "—"}</span>
              <button type="button" onClick={() => upd("fontSize", Math.min(60, (value.fontSize || 22) + 1))} className="w-5 h-5 rounded flex items-center justify-center border border-border hover:bg-secondary">
                <Plus className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-40" style={{ fontSize: 12 }}>א</span>
            <Slider
              min={12}
              max={60}
              step={1}
              value={[value.fontSize > 0 ? value.fontSize : 22]}
              onValueChange={([v]) => upd("fontSize", v)}
              className="flex-1"
            />
            <span className="text-base opacity-70 font-bold" style={{ fontSize: 20 }}>א</span>
          </div>
        </div>

        {/* Font weight */}
        <Row label="עובי גופן">
          <div className="flex gap-1">
            <WeightBtn cur={value.fontWeight} val="400" label="רגיל"    onClick={() => upd("fontWeight", value.fontWeight === "400"  ? "" : "400")} />
            <WeightBtn cur={value.fontWeight} val="600" label="חצי-מודגש" onClick={() => upd("fontWeight", value.fontWeight === "600" ? "" : "600")} />
            <WeightBtn cur={value.fontWeight} val="700" label="מודגש"   onClick={() => upd("fontWeight", value.fontWeight === "700"  ? "" : "700")} />
            <WeightBtn cur={value.fontWeight} val="800" label="כבד"     onClick={() => upd("fontWeight", value.fontWeight === "800"  ? "" : "800")} />
          </div>
        </Row>

        {/* Line height */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><WrapText className="h-3 w-3" /> גובה שורה</Label>
            <span className="text-xs font-mono">{value.lineHeight > 0 ? value.lineHeight.toFixed(1) : "—"}</span>
          </div>
          <Slider
            min={1.0}
            max={3.0}
            step={0.1}
            value={[value.lineHeight > 0 ? value.lineHeight : 1.6]}
            onValueChange={([v]) => upd("lineHeight", parseFloat(v.toFixed(1)))}
          />
        </div>

        {/* Letter spacing */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">רווח בין אותיות</Label>
            <span className="text-xs font-mono">{value.letterSpacing !== 999 ? `${value.letterSpacing}px` : "—"}</span>
          </div>
          <Slider
            min={-2}
            max={10}
            step={0.5}
            value={[value.letterSpacing !== 999 ? value.letterSpacing : 0]}
            onValueChange={([v]) => upd("letterSpacing", v)}
          />
        </div>

        {/* Alignment */}
        <Row label="יישור">
          <div className="flex gap-1">
            <AlignBtn cur={value.align} val="right"   onClick={() => upd("align", "right")} />
            <AlignBtn cur={value.align} val="center"  onClick={() => upd("align", "center")} />
            <AlignBtn cur={value.align} val="left"    onClick={() => upd("align", "left")} />
            <AlignBtn cur={value.align} val="justify" onClick={() => upd("align", "justify")} />
          </div>
        </Row>

        {/* Text colour */}
        <Row label="צבע טקסט">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.textColor || "#1a1a2e"}
              onChange={(e) => upd("textColor", e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-border p-0.5 bg-transparent"
            />
            <span className="text-[10px] font-mono text-muted-foreground">{value.textColor || "ברירת מחדל"}</span>
            {value.textColor && (
              <button type="button" onClick={() => upd("textColor", "")} className="text-[10px] text-muted-foreground hover:text-foreground underline">נקה</button>
            )}
            </div>
            <ColorFavoritesRow
              favorites={favorites}
              currentColor={value.textColor || "#1a1a2e"}
              onAddCurrent={() => addFavorite(value.textColor || "#1a1a2e")}
              onPick={(color) => upd("textColor", color)}
              onRemove={removeFavorite}
              onMove={moveFavorite}
              className="pt-0.5"
            />
          </div>
        </Row>

        {/* Background colour */}
        <Row label="רקע שאלה">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.bgColor || "#f8f6f0"}
              onChange={(e) => upd("bgColor", e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-border p-0.5 bg-transparent"
            />
            <span className="text-[10px] font-mono text-muted-foreground">{value.bgColor || "ברירת מחדל"}</span>
            {value.bgColor && (
              <button type="button" onClick={() => upd("bgColor", "")} className="text-[10px] text-muted-foreground hover:text-foreground underline">נקה</button>
            )}
            </div>
            <ColorFavoritesRow
              favorites={favorites}
              currentColor={value.bgColor || "#f8f6f0"}
              onAddCurrent={() => addFavorite(value.bgColor || "#f8f6f0")}
              onPick={(color) => upd("bgColor", color)}
              onRemove={removeFavorite}
              onMove={moveFavorite}
              className="pt-0.5"
            />
          </div>
        </Row>

        {/* Border radius */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">עיגול פינות</Label>
            <span className="text-xs font-mono">{value.borderRadius >= 0 ? `${value.borderRadius}px` : "—"}</span>
          </div>
          <Slider
            min={0}
            max={48}
            step={2}
            value={[value.borderRadius >= 0 ? value.borderRadius : 16]}
            onValueChange={([v]) => upd("borderRadius", v)}
          />
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
          <button
            type="button"
            onClick={() => upd("textShadow", !value.textShadow)}
            className={cn(
              "flex items-center gap-1.5 h-7 px-3 rounded-lg border text-xs transition-colors",
              value.textShadow ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"
            )}
          >
            <Bold className="h-3 w-3" /> הצל טקסט
          </button>
          <button
            type="button"
            onClick={() => upd("uppercase", !value.uppercase)}
            className={cn(
              "flex items-center gap-1.5 h-7 px-3 rounded-lg border text-xs transition-colors",
              value.uppercase ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"
            )}
          >
            <CaseSensitive className="h-3.5 w-3.5" /> UPPERCASE
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Combined Typography Dialog ───────────────────────────────────────────────

interface CombinedTypographyDialogProps {
  questionValue: QuizTypography;
  onQuestionChange: (t: QuizTypography) => void;
  answerValue: QuizTypography;
  onAnswerChange: (t: QuizTypography) => void;
}

export function CombinedTypographyDialog({
  questionValue,
  onQuestionChange,
  answerValue,
  onAnswerChange,
}: CombinedTypographyDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        title="עיצוב טיפוגרפיה"
        aria-label="עיצוב טקסט שאלות ותשובות"
        className="h-7 w-7 p-0 border-gold/50 hover:bg-gold/10"
        onClick={() => setOpen(true)}
      >
        <Type className="h-3.5 w-3.5 text-gold" />
      </Button>
      <DialogContent
        className="max-w-2xl w-full"
        dir="rtl"
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t?.tagName === "INPUT" && t.getAttribute("type") === "color") e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="h-4 w-4 text-gold" /> עיצוב טיפוגרפיה
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="question" dir="rtl">
          <TabsList className="w-full">
            <TabsTrigger value="question" className="flex-1">שאלות</TabsTrigger>
            <TabsTrigger value="answer" className="flex-1">תשובות</TabsTrigger>
          </TabsList>
          <TabsContent value="question" className="mt-4 px-1">
            <TypographyControlsPanel
              value={questionValue}
              onChange={onQuestionChange}
              storageKey={QUIZ_TYPOGRAPHY_KEY}
              title="עיצוב טקסט שאלה"
              previewText="מה הפסוק שאמר משה לבני ישראל במדבר?"
            />
          </TabsContent>
          <TabsContent value="answer" className="mt-4 px-1">
            <TypographyControlsPanel
              value={answerValue}
              onChange={onAnswerChange}
              storageKey={ANSWER_TYPOGRAPHY_KEY}
              title="עיצוב טקסט תשובות"
              previewText="דוגמה לתשובה במבחן"
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
