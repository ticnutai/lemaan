import { useState } from "react";
import { Check, ChevronDown, Copy, Palette, RotateCcw, Trash2 } from "lucide-react";
import {
  BUILTIN_THEMES,
  COLOR_TOKEN_GROUPS,
  RAW_TOKENS,
  hexToHslString,
  hslStringToHex,
  useTheme,
} from "../theme/ThemeProvider";

export default function ThemeStudio() {
  const { themeId, setTheme, allThemes, readToken, setToken, isDirty, resetTheme, duplicateAs, deleteCustom } = useTheme();
  const [editorOpen, setEditorOpen] = useState(false);
  // מונה רענון כדי שקלטי הצבע יציגו ערך עדכני אחרי החלפת ערכה/איפוס
  const [refresh, setRefresh] = useState(0);

  const isCustom = (id: string) => !BUILTIN_THEMES.some((t) => t.id === id);

  return (
    <div className="card-panel space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Palette className="h-4 w-4 text-gold" /> ערכות נושא
      </h3>

      {/* בחירת ערכה */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {allThemes.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTheme(t.id);
              setTimeout(() => setRefresh((r) => r + 1), 50);
            }}
            className={`relative rounded-xl border-2 p-3 text-right transition-all ${
              themeId === t.id ? "border-gold shadow-gold" : "border-border hover:border-gold/60"
            }`}
          >
            {themeId === t.id && (
              <span className="absolute top-2 left-2 h-5 w-5 rounded-full bg-gradient-gold flex items-center justify-center">
                <Check className="h-3 w-3 text-navy" />
              </span>
            )}
            <div className="flex gap-1 mb-2">
              {t.swatch.map((c, i) => (
                <span key={i} className="h-5 w-5 rounded-full border border-black/10" style={{ background: c }} />
              ))}
            </div>
            <div className="text-sm font-medium">{t.label}</div>
            <div className="text-[11px] text-muted-foreground">{t.description}</div>
            {isCustom(t.id) && (
              <span
                role="button"
                title="מחיקת ערכה אישית"
                className="absolute bottom-2 left-2 text-destructive/70 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`למחוק את הערכה "${t.label}"?`)) deleteCustom(t.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
        ))}
      </div>

      {/* עורך חי */}
      <button className="btn-outline w-full justify-between" onClick={() => setEditorOpen(!editorOpen)}>
        <span className="flex items-center gap-2">
          <Palette className="h-4 w-4" /> עריכה חיה של הערכה הנוכחית
          {isDirty && <span className="text-xs text-gold">(שונתה)</span>}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${editorOpen ? "rotate-180" : ""}`} />
      </button>

      {editorOpen && (
        <div className="space-y-4 animate-fade-in" key={`${themeId}-${refresh}`}>
          {COLOR_TOKEN_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{group.title}</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {group.tokens.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer hover:border-gold/60">
                    <input
                      type="color"
                      className="h-7 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                      defaultValue={hslStringToHex(readToken(key))}
                      onChange={(e) => setToken(key, hexToHslString(e.target.value))}
                    />
                    <span className="truncate">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div>
            <h4 className="text-sm font-semibold mb-2 text-muted-foreground">מתקדם — גרדיאנטים וצללים</h4>
            <div className="space-y-2">
              {RAW_TOKENS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs w-24 shrink-0">{label}</span>
                  <input
                    className="input h-8 text-xs"
                    dir="ltr"
                    defaultValue={readToken(key)}
                    onBlur={(e) => e.target.value.trim() && setToken(key, e.target.value.trim())}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              className="btn-outline h-9"
              disabled={!isDirty}
              onClick={() => {
                resetTheme();
                setTimeout(() => setRefresh((r) => r + 1), 50);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> איפוס לברירת המחדל
            </button>
            <button
              className="btn-gold h-9"
              onClick={() => {
                const name = prompt("שם לערכה החדשה:");
                if (name?.trim()) duplicateAs(name.trim());
              }}
            >
              <Copy className="h-3.5 w-3.5" /> שמירה כערכה אישית
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
