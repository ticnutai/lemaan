import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { create } from "zustand";
import {
  BookOpen, ChevronLeft, Compass, Crown, Droplets, Flame, GripVertical, Landmark, Minus, Pin, Play, Scale, Settings, Sparkles, Star, X,
} from "lucide-react";
import { getSetting, setSetting } from "../db";
import { AMUD_LABELS, SEDARIM, hebrewDaf } from "../features/study/shas";
import {
  STATUS_DOT, STATUS_LABEL, dafStatus, dafTotal, emptyDafEntry, masechtaSummary, sederOf, useShasCounts,
} from "../features/study/shasCounts";
import { isPlacePinned, togglePinnedPlace, usePinnedPlaces } from "../features/study/studyPrefs";
import { cn } from "../lib/utils";

/**
 * חלון ניווט צף לכל האתר: סדרים ← מסכתות ← דפים ← עמודים, עם פירורי לחם.
 * הצבעים נגזרים מטוקני ערכת הנושא הפעילה — מתחלפים יחד עם הערכה.
 */

// ---------- מצב החלון (בזיכרון: פתוח + המקום בניווט) ----------
interface NavState {
  open: boolean;
  minimized: boolean;
  seder: string | null;
  masechta: string | null;
  daf: number | null;
  setOpen: (v: boolean) => void;
  setMinimized: (v: boolean) => void;
  go: (seder: string | null, masechta?: string | null, daf?: number | null) => void;
}
export const useShasNavigator = create<NavState>((set) => ({
  open: false,
  minimized: false,
  seder: null,
  masechta: null,
  daf: null,
  setOpen: (open) => set({ open, minimized: false }),
  setMinimized: (minimized) => set({ minimized }),
  go: (seder, masechta = null, daf = null) => set({ seder, masechta, daf }),
}));

// ---------- גוונים לכל סדר — מתוך ערכת הנושא הפעילה ----------
// לכל ערכה שישה צבעי סדרים משלה (--seder-1..6 ב-index.css, ניתנים לעריכה בעורך הערכות).
// הכרטיס: מעבר מצבע הסדר לזהב של הערכה, שקוף למחצה מעל צבע הכרטיס — כך שבערכה
// כהה הכרטיסים כהים ובבהירה בהירים, והכל מתחלף יחד עם הערכה.
const SEDER_LOOK: Record<string, { icon: typeof Star; a: string; b: string }> = {
  זרעים: { icon: Sparkles, a: "--seder-1", b: "--gold" },
  מועד: { icon: Star, a: "--seder-2", b: "--gold-soft" },
  נשים: { icon: Crown, a: "--seder-3", b: "--gold" },
  נזיקין: { icon: Scale, a: "--seder-4", b: "--gold" },
  קדשים: { icon: Flame, a: "--seder-5", b: "--gold-soft" },
  טהרות: { icon: Droplets, a: "--seder-6", b: "--gold" },
};
const lookOf = (seder: string | null) => SEDER_LOOK[seder ?? ""] ?? { icon: BookOpen, a: "--gold", b: "--primary" };

function toneStyle(a: string, b: string, strength = 1): CSSProperties {
  return {
    background: `linear-gradient(135deg, hsl(var(${a}) / ${0.2 * strength}), hsl(var(${b}) / ${0.1 * strength})), hsl(var(--card))`,
    borderColor: `hsl(var(${a}) / 0.55)`,
  };
}

// ---------- מיקום וגודל החלון (נשמרים בין כניסות) ----------
interface Geometry { x: number; y: number; w: number; h: number; compact: boolean }
const GEOMETRY_KEY = "shas-nav-window";
const MIN_W = 340, MIN_H = 360;
const defaultGeometry = (): Geometry => {
  const w = Math.min(560, window.innerWidth - 32);
  const h = Math.min(620, window.innerHeight - 96);
  return { x: Math.max(16, (window.innerWidth - w) / 2), y: 72, w, h, compact: false };
};
const clampGeometry = (g: Geometry): Geometry => {
  const w = Math.min(Math.max(g.w, MIN_W), window.innerWidth - 16);
  const h = Math.min(Math.max(g.h, MIN_H), window.innerHeight - 16);
  return { ...g, w, h, x: Math.min(Math.max(g.x, 8), window.innerWidth - w - 8), y: Math.min(Math.max(g.y, 8), window.innerHeight - 48) };
};

const useIsPhone = () => {
  const [phone, setPhone] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    window.addEventListener("resize", on); // גם שינוי גודל חלון הדפדפן / סיבוב הטלפון
    return () => {
      mq.removeEventListener("change", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return phone;
};

/** הכפתור הצף + החלון. מוצב פעם אחת במבנה הכללי של האתר. */
export default function ShasNavigator() {
  const { open, minimized, setOpen } = useShasNavigator();
  return (
    <>
      <button
        className={cn(
          "fixed bottom-4 left-4 z-40 h-14 w-14 rounded-full flex items-center justify-center transition-transform hover:scale-105",
          "bg-gradient-navy text-primary-foreground shadow-elegant ring-4 ring-gold/40",
          open && !minimized && "ring-gold"
        )}
        style={{ boxShadow: "0 8px 28px -6px hsl(var(--primary) / 0.55)" }}
        onClick={() => setOpen(!(open && !minimized))}
        aria-label={open && !minimized ? "סגירת ניווט הש\"ס" : "פתיחת ניווט הש\"ס"}
        title='ניווט מהיר בש"ס'
      >
        <BookOpen className="h-6 w-6" />
      </button>
      {open && <NavigatorWindow />}
    </>
  );
}

function NavigatorWindow() {
  const navigate = useNavigate();
  const { minimized, seder, masechta, daf, setOpen, setMinimized, go } = useShasNavigator();
  const { cards, counts } = useShasCounts();
  const pinnedPlaces = usePinnedPlaces();
  const phone = useIsPhone();
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const geoRef = useRef<Geometry | null>(null);
  geoRef.current = geo;

  // טעינת המיקום השמור
  useEffect(() => {
    getSetting(GEOMETRY_KEY, "").then((raw) => {
      try {
        setGeo(clampGeometry(raw ? { ...defaultGeometry(), ...JSON.parse(raw) } : defaultGeometry()));
      } catch {
        setGeo(defaultGeometry());
      }
    });
  }, []);
  const saveGeo = (g: Geometry) => void setSetting(GEOMETRY_KEY, JSON.stringify(g));

  // החלון לעולם לא חורג מהמסך — גם אחרי הקטנת חלון הדפדפן
  useEffect(() => {
    const fit = () => setGeo((g) => (g ? clampGeometry(g) : g));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Esc סוגר
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // גרירת החלון מפס הכותרת, ושינוי גודל מהפינה (פינה שמאלית-תחתונה, כמקובל מימין לשמאל)
  const startPointer = (e: ReactPointerEvent, kind: "move" | "resize") => {
    if (phone || !geoRef.current || e.button !== 0) return;
    if (kind === "move" && (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const start = { ...geoRef.current }, sx = e.clientX, sy = e.clientY;
    let latest = start; // נשמר בסוף הגרירה — גם אם התצוגה עוד לא התעדכנה
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      const next = kind === "move"
        ? { ...start, x: start.x + dx, y: start.y + dy }
        : { ...start, x: start.x + dx, w: start.w - dx, h: start.h + dy };
      if (kind === "resize" && next.w < MIN_W) { next.x -= MIN_W - next.w; next.w = MIN_W; }
      latest = clampGeometry(next);
      setGeo(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      saveGeo(latest);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!geo) return null;
  const compact = geo.compact;

  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: "סדרים", onClick: () => go(null) },
    ...(seder ? [{ label: `סדר ${seder}`, onClick: () => go(seder) }] : []),
    ...(masechta ? [{ label: masechta, onClick: () => go(seder, masechta) }] : []),
    ...(masechta && daf !== null ? [{ label: `דף ${hebrewDaf(daf)}` }] : []),
  ];
  const look = lookOf(seder ?? (masechta ? sederOf(masechta) : null));

  const practice = (m: string, d: number, amud: "1" | "2" | null) => {
    navigate(`/study?m=${encodeURIComponent(m)}&daf=${d}${amud ? `&amud=${amud}` : ""}`);
    setMinimized(true);
  };
  const openGemara = (m: string, d: number, amud: "1" | "2" | null) => {
    navigate(`/shas?he=${encodeURIComponent(m)}&daf=${d}${amud === "2" ? "&amud=2" : ""}`);
    setMinimized(true);
  };

  const frameStyle: CSSProperties = phone
    ? {}
    : { left: geo.x, top: geo.y, width: geo.w, height: minimized ? undefined : geo.h };

  return (
    <div
      role="dialog"
      aria-label='ניווט בש"ס'
      dir="rtl"
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-2xl border-2 border-gold/70 bg-card text-card-foreground animate-fade-in",
        phone && (minimized ? "inset-x-2 bottom-20" : "inset-x-2 top-16 bottom-20")
      )}
      style={{ ...frameStyle, boxShadow: "0 24px 60px -18px hsl(var(--primary) / 0.45), 0 0 0 1px hsl(var(--gold) / 0.25)" }}
    >
      {/* פס כותרת — גוררים ממנו את החלון */}
      <div
        className={cn("flex items-center justify-between gap-2 px-3 h-14 shrink-0 border-b border-gold/40 select-none", !phone && "cursor-move")}
        style={{ background: "linear-gradient(90deg, hsl(var(--secondary)), hsl(var(--card)))" }}
        onPointerDown={(e) => startPointer(e, "move")}
      >
        <div className="flex items-center gap-2 min-w-0">
          {!phone && <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />}
          <Compass className="h-5 w-5 text-gold shrink-0" />
          <span className="font-display font-bold text-lg truncate">ששת סדרי הש"ס</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary" title="הגדרות החלון" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
            <Settings className="h-4 w-4" />
          </button>
          <button className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary" title={minimized ? "הרחבה" : "מזעור"} onClick={() => setMinimized(!minimized)}>
            <Minus className="h-4 w-4" />
          </button>
          <button className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary" title="סגירה (Esc)" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {settingsOpen && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-secondary/60 text-xs animate-slide-in-down">
              <button
                className={cn("btn-outline h-8 rounded-full", compact && "border-gold text-gold bg-gold/10")}
                onClick={() => { const g = { ...geo, compact: !compact }; setGeo(g); saveGeo(g); }}
              >
                {compact ? "כרטיסים רגילים" : "כרטיסים קטנים"}
              </button>
              {!phone && (
                <button className="btn-outline h-8 rounded-full" onClick={() => { const g = { ...defaultGeometry(), compact }; setGeo(g); saveGeo(g); }}>
                  החזרת החלון למקום ולגודל ההתחלתיים
                </button>
              )}
            </div>
          )}

          {/* פירורי לחם */}
          <nav aria-label="מיקום בניווט" className="flex items-center flex-wrap gap-x-1 px-4 py-2.5 border-b border-gold/30 text-sm">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <span key={i} className="flex items-center gap-1">
                  {last || !c.onClick ? (
                    <span className={last ? "font-bold" : "text-muted-foreground"}>{c.label}</span>
                  ) : (
                    <button className="text-muted-foreground hover:text-gold hover:underline" onClick={c.onClick}>{c.label}</button>
                  )}
                  {!last && <ChevronLeft className="h-3.5 w-3.5 text-gold/70" />}
                </span>
              );
            })}
            {masechta && (
              <button
                className={cn("ms-auto h-7 px-2 rounded-full border text-xs flex items-center gap-1", isPlacePinned(pinnedPlaces, { masechta, daf: daf ?? undefined }) ? "border-gold text-gold bg-gold/10" : "hover:border-gold")}
                onClick={() => void togglePinnedPlace({ masechta, daf: daf ?? undefined })}
                title="הצמדה לראש מסך התרגול"
              >
                <Pin className="h-3 w-3" /> {isPlacePinned(pinnedPlaces, { masechta, daf: daf ?? undefined }) ? "נעוץ" : "הצמדה"}
              </button>
            )}
          </nav>

          <div className="flex-1 overflow-y-auto p-4">
            {cards === undefined ? (
              <p className="text-center text-sm text-muted-foreground py-10">טוען את מאגר השאלות…</p>
            ) : !seder && !masechta ? (
              /* ---- סדרים ---- */
              <div className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
                {SEDARIM.map((s) => {
                  const L = lookOf(s.name);
                  const withContent = s.masechtot.filter((m) => masechtaSummary(counts, m).questions > 0);
                  const practiced = s.masechtot.reduce((n, m) => n + masechtaSummary(counts, m).practiced, 0);
                  return (
                    <button
                      key={s.name}
                      disabled={!withContent.length}
                      onClick={() => go(s.name)}
                      className={cn("rounded-2xl border-2 text-right transition-all hover:-translate-y-0.5 hover:shadow-gold disabled:opacity-40", compact ? "p-3" : "p-4")}
                      style={toneStyle(L.a, L.b)}
                    >
                      <span className={cn("rounded-xl flex items-center justify-center bg-card/80 shadow-sm", compact ? "h-9 w-9 mb-2" : "h-11 w-11 mb-4")}>
                        <L.icon className="h-5 w-5" style={{ color: `hsl(var(${L.a}))` }} />
                      </span>
                      <span className={cn("block font-display font-bold", compact ? "text-base" : "text-xl")}>סדר {s.name}</span>
                      <span className="flex items-center justify-between gap-2 mt-1 text-sm text-muted-foreground">
                        <span>{withContent.length} מסכתות</span>
                        <span>{practiced} דפים תורגלו</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : masechta === null ? (
              /* ---- מסכתות הסדר ---- */
              <div className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
                {SEDARIM.find((s) => s.name === seder)?.masechtot.map((m) => {
                  const sum = masechtaSummary(counts, m);
                  const pct = sum.dafs ? Math.round((sum.practiced / sum.dafs) * 100) : 0;
                  return (
                    <button
                      key={m}
                      disabled={!sum.questions}
                      onClick={() => go(seder, m)}
                      className={cn("rounded-2xl border-2 text-right transition-all hover:-translate-y-0.5 hover:shadow-gold disabled:opacity-40", compact ? "p-3" : "p-4")}
                      style={toneStyle(look.a, look.b, 0.85)}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("font-display font-bold", compact ? "text-base" : "text-lg")}>{m}</span>
                        {isPlacePinned(pinnedPlaces, { masechta: m }) && <Pin className="h-3.5 w-3.5 text-gold" />}
                      </span>
                      <span className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{sum.questions} שאלות · {sum.dafs} דפים</span>
                        {sum.due > 0 && <span className="text-gold font-bold">{sum.due} לחזרה</span>}
                      </span>
                      <span className="block mt-2 h-1.5 rounded-full bg-muted overflow-hidden" title={`${pct}% מהדפים תורגלו`}>
                        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: `hsl(var(${look.a}))` }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : daf === null ? (
              /* ---- דפים ---- */
              <div className={cn("grid gap-2", compact ? "grid-cols-5 sm:grid-cols-7" : "grid-cols-4 sm:grid-cols-5")}>
                {[...(counts.get(masechta)?.entries() ?? [])].sort((x, y) => x[0] - y[0]).map(([d, e]) => {
                  const st = dafStatus(e);
                  return (
                    <button
                      key={d}
                      onClick={() => go(seder ?? sederOf(masechta), masechta, d)}
                      title={STATUS_LABEL[st]}
                      className="relative rounded-xl border-2 py-2.5 text-center transition-all hover:-translate-y-0.5 hover:shadow-gold"
                      style={toneStyle(look.a, look.b, 0.6)}
                    >
                      {st !== "new" && <span className={cn("absolute top-1.5 left-1.5 h-2 w-2 rounded-full", STATUS_DOT[st])} />}
                      <span className="block font-bold">{hebrewDaf(d)}</span>
                      <span className="block text-[11px] text-muted-foreground">{dafTotal(e)} שאלות</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* ---- עמודים: תרגול או פתיחה בגמרא ---- */
              (() => {
                const e = counts.get(masechta)?.get(daf) ?? emptyDafEntry();
                const options: { amud: "1" | "2" | null; title: string; n: number }[] = [
                  { amud: "1", title: AMUD_LABELS["1"], n: e.a + e.none },
                  { amud: "2", title: AMUD_LABELS["2"], n: e.b + e.none },
                  { amud: null, title: "כל הדף", n: dafTotal(e) },
                ];
                return (
                  <div className="space-y-3">
                    <div className={cn("grid gap-3", compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3")}>
                      {options.map((o) => (
                        <div key={o.title} className={cn("rounded-2xl border-2 flex flex-col gap-3", compact ? "p-3" : "p-4")} style={toneStyle(look.a, look.b, o.amud ? 0.8 : 1.1)}>
                          <div>
                            <p className="font-display font-bold text-lg">{o.title}</p>
                            <p className="text-xs text-muted-foreground">{o.n} שאלות</p>
                          </div>
                          <div className="flex flex-col gap-2 mt-auto">
                            <button className="btn-gold h-9 rounded-full text-sm whitespace-nowrap px-3 disabled:opacity-40" disabled={!o.n} onClick={() => practice(masechta, daf, o.amud)}>
                              <Play className="h-3.5 w-3.5" /> תרגול
                            </button>
                            <button className="btn-outline h-9 rounded-full text-xs whitespace-nowrap px-3 bg-card/70" onClick={() => openGemara(masechta, daf, o.amud)}>
                              <Landmark className="h-3.5 w-3.5" /> פתיחה בגמרא
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {e.none > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {e.none} שאלות עוד לא שויכו לעמוד, ולכן מופיעות גם בעמוד א' וגם בעמוד ב'.
                      </p>
                    )}
                  </div>
                );
              })()
            )}
          </div>

          {/* פס תחתון + ידית שינוי גודל */}
          {!phone && (
            <div className="relative h-6 shrink-0 border-t border-gold/30 flex items-center justify-center">
              <span className="h-1 w-12 rounded-full bg-gold/70" />
              <span
                className="absolute left-1 bottom-1 h-4 w-4 cursor-nesw-resize text-muted-foreground"
                onPointerDown={(e) => startPointer(e, "resize")}
                title="גרירה לשינוי הגודל"
                aria-hidden
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4"><path d="M2 2 L14 14 M2 8 L8 14" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
