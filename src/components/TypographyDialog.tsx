import { useEffect, useState, type ReactNode } from "react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Minus, Plus, RotateCcw, Sun, Type, WrapText, X,
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  BASE_SIZE, DEFAULT_TYPOGRAPHY, FONT_OPTIONS, NO_SPACING, typographyToBoxStyle, typographyToStyle,
  useColorFavorites, type Align, type TypoTarget, type Typography,
} from "../features/study/typography";

/**
 * חלון "עיצוב טיפוגרפיה" — כמו במקור: לשונית לשאלות ולשונית לתשובות,
 * ובכל אחת כל אפשרויות העיצוב עם תצוגה מקדימה חיה.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  question: Typography;
  answer: Typography;
  onChange: (target: TypoTarget, next: Typography) => void;
}

const TABS: { id: TypoTarget; label: string; title: string; preview: string }[] = [
  { id: "question", label: "שאלות", title: "עיצוב טקסט שאלה", preview: "מה הפסוק שאמר משה לבני ישראל במדבר?" },
  { id: "answer", label: "תשובות", title: "עיצוב טקסט תשובות", preview: "דוגמה לתשובה במבחן" },
];

export default function TypographyDialog({ open, onClose, question, answer, onChange }: Props) {
  const [tab, setTab] = useState<TypoTarget>("question");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const meta = TABS.find((t) => t.id === tab)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="עיצוב טיפוגרפיה"
        dir="rtl"
        className="gold-frame w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Type className="h-5 w-5 text-gold" /> עיצוב טיפוגרפיה
          </h2>
          <button className="btn-ghost h-8 w-8 p-0 rounded-full" onClick={onClose} aria-label="סגירה" title="סגירה (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={cn(
                "h-9 rounded-lg text-sm font-medium transition-colors",
                tab === t.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Controls
          key={tab}
          value={tab === "question" ? question : answer}
          onChange={(next) => onChange(tab, next)}
          title={meta.title}
          preview={meta.preview}
          baseSize={BASE_SIZE[tab]}
        />
      </div>
    </div>
  );
}

// ---------- הפקדים ----------
function Controls({
  value, onChange, title, preview, baseSize,
}: { value: Typography; onChange: (t: Typography) => void; title: string; preview: string; baseSize: number }) {
  const upd = <K extends keyof Typography>(key: K, v: Typography[K]) => onChange({ ...value, [key]: v });
  const size = value.fontSize > 0 ? value.fontSize : baseSize;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="font-bold flex items-center gap-1.5">
          <Type className="h-4 w-4 text-gold" /> {title}
        </span>
        <button
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          title="החזרת כל ההגדרות לברירת המחדל"
          onClick={() => onChange(DEFAULT_TYPOGRAPHY)}
        >
          <RotateCcw className="h-3.5 w-3.5" /> איפוס
        </button>
      </div>

      {/* תצוגה מקדימה חיה */}
      <div
        className="rounded-2xl border-2 border-gold/50 bg-secondary/40 px-4 py-3 min-h-[64px] flex items-center"
        style={typographyToBoxStyle(value)}
      >
        <p className="w-full leading-snug" style={typographyToStyle(value, baseSize)}>
          {preview}
        </p>
      </div>

      <Row label="גופן">
        <select
          className="input h-9 w-56"
          value={value.fontFamily}
          onChange={(e) => upd("fontFamily", e.target.value)}
          style={value.fontFamily ? { fontFamily: value.fontFamily } : undefined}
        >
          <option value="">ברירת מחדל</option>
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
              {f.label}
            </option>
          ))}
        </select>
      </Row>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>גודל גופן</Label>
          <div className="flex items-center gap-1.5">
            <SmallBtn label="הקטנה" onClick={() => upd("fontSize", Math.max(12, size - 1))}><Minus className="h-3 w-3" /></SmallBtn>
            <span className="text-sm font-mono w-12 text-center" dir="ltr">{value.fontSize > 0 ? `${value.fontSize}px` : "—"}</span>
            <SmallBtn label="הגדלה" onClick={() => upd("fontSize", Math.min(60, size + 1))}><Plus className="h-3 w-3" /></SmallBtn>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-40" style={{ fontSize: 12 }}>א</span>
          <Range min={12} max={60} step={1} value={size} onChange={(v) => upd("fontSize", v)} label="גודל גופן" />
          <span className="opacity-70 font-bold" style={{ fontSize: 22 }}>א</span>
        </div>
      </div>

      <Row label="עובי גופן">
        <div className="flex flex-wrap gap-1.5">
          {([["400", "רגיל"], ["600", "חצי־מודגש"], ["700", "מודגש"], ["800", "כבד"]] as const).map(([w, l]) => (
            <Chip key={w} active={value.fontWeight === w} onClick={() => upd("fontWeight", value.fontWeight === w ? "" : w)} style={{ fontWeight: w }}>
              {l}
            </Chip>
          ))}
        </div>
      </Row>

      <Slider
        name="גובה שורה" icon={<WrapText className="h-3.5 w-3.5" />}
        shown={value.lineHeight > 0 ? value.lineHeight.toFixed(1) : "—"}
        min={1} max={3} step={0.1}
        value={value.lineHeight > 0 ? value.lineHeight : 1.6}
        onChange={(v) => upd("lineHeight", +v.toFixed(1))}
      />

      <Slider
        name="רווח בין אותיות"
        shown={value.letterSpacing !== NO_SPACING ? `${value.letterSpacing}px` : "—"}
        min={-2} max={10} step={0.5}
        value={value.letterSpacing !== NO_SPACING ? value.letterSpacing : 0}
        onChange={(v) => upd("letterSpacing", v)}
      />

      <Row label="יישור">
        <div className="flex gap-1.5">
          {([["right", AlignRight, "ימין"], ["center", AlignCenter, "מרכז"], ["left", AlignLeft, "שמאל"], ["justify", AlignJustify, "מיושר לשני הצדדים"]] as const).map(
            ([a, Icon, l]) => (
              <Chip key={a} active={value.align === a} onClick={() => upd("align", a as Align)} title={l} square>
                <Icon className="h-4 w-4" />
              </Chip>
            )
          )}
        </div>
      </Row>

      <ColorRow label="צבע טקסט" value={value.textColor} fallback="#1a1a2e" onChange={(c) => upd("textColor", c)} />
      <ColorRow label="רקע" value={value.bgColor} fallback="#f8f6f0" onChange={(c) => upd("bgColor", c)} />

      <Slider
        name="עיגול פינות"
        shown={value.borderRadius >= 0 ? `${value.borderRadius}px` : "—"}
        min={0} max={48} step={2}
        value={value.borderRadius >= 0 ? value.borderRadius : 16}
        onChange={(v) => upd("borderRadius", v)}
      />

      <div className="flex flex-wrap gap-2 pt-3 border-t">
        <Chip active={value.textShadow} onClick={() => upd("textShadow", !value.textShadow)}>
          <Sun className="h-3.5 w-3.5" /> הצללת טקסט
        </Chip>
      </div>
    </div>
  );
}

// ---------- רכיבים קטנים ----------
function Label({ children }: { children: ReactNode }) {
  return <span className="text-sm text-muted-foreground flex items-center gap-1">{children}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SmallBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className="h-7 w-7 rounded-md border border-gold/60 flex items-center justify-center hover:bg-secondary"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function Chip({
  active, onClick, children, title, square, style,
}: { active: boolean; onClick: () => void; children: ReactNode; title?: string; square?: boolean; style?: React.CSSProperties }) {
  return (
    <button
      className={cn(
        "h-9 rounded-full border text-sm flex items-center justify-center gap-1.5 transition-colors",
        square ? "w-9" : "px-3.5",
        active ? "bg-gradient-navy text-primary-foreground border-transparent" : "border-gold/60 hover:bg-secondary"
      )}
      aria-pressed={active}
      title={title}
      aria-label={title}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
}

function Range({ min, max, step, value, onChange, label }: { min: number; max: number; step: number; value: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      type="range"
      className="typo-range flex-1"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
    />
  );
}

function Slider({
  name, icon, shown, ...r
}: { name: string; icon?: ReactNode; shown: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{icon}{name}</Label>
        <span className="text-sm font-mono" dir="ltr">{shown}</span>
      </div>
      <div className="flex">
        <Range {...r} label={name} />
      </div>
    </div>
  );
}

function ColorRow({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (c: string) => void }) {
  const { favorites, addFavorite, removeFavorite } = useColorFavorites();
  const current = value || fallback;
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <span className="pt-2"><Label>{label}</Label></span>
      <div className="space-y-2 min-w-0">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={current}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-9 rounded-md cursor-pointer border border-gold/60 p-0.5 bg-transparent"
            aria-label={`בחירת ${label}`}
          />
          <span className="text-xs text-muted-foreground">{value ? <span dir="ltr" className="font-mono">{value}</span> : "ברירת מחדל"}</span>
          {value && (
            <button className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => onChange("")}>
              ניקוי
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">צבעים מועדפים</span>
          <button
            className="h-7 rounded-full border border-gold/60 px-2.5 text-xs flex items-center gap-1 hover:bg-secondary"
            onClick={() => addFavorite(current)}
            title="שמירת הצבע הנוכחי ברשימת המועדפים"
          >
            <Plus className="h-3 w-3" /> הוסף נוכחי
          </button>
        </div>
        {favorites.length === 0 ? (
          <p className="text-xs text-muted-foreground">אין צבעים מועדפים עדיין</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {favorites.map((c) => (
              <span key={c} className="relative group">
                <button
                  className={cn("h-7 w-7 rounded-full border-2", current.toLowerCase() === c ? "border-gold" : "border-border")}
                  style={{ backgroundColor: c }}
                  onClick={() => onChange(c)}
                  title={`בחירת הצבע ${c}`}
                  aria-label={`בחירת הצבע ${c}`}
                />
                <button
                  className="absolute -top-1.5 -left-1.5 h-4 w-4 rounded-full bg-card border text-[10px] leading-none flex items-center justify-center"
                  onClick={() => removeFavorite(c)}
                  title="הסרה מהמועדפים"
                  aria-label={`הסרת הצבע ${c} מהמועדפים`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
