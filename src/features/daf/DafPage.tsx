import { useEffect, useLayoutEffect, useRef, useState } from "react";
import dafRenderer from "./vendor/renderer";
import { Palette, Search, X } from "lucide-react";
import { buildMainHtml, buildPrintLinesHtml, buildSideHtml, countHits, stripNikud } from "./buildHtml";
import { DEFAULT_DAF_STYLE, FONT_FAMILY, loadDafStyle, saveDafStyle, type DafStyle } from "./dafStyle";

interface Props {
  gemara: string[];
  rashi: string[];
  tosafot: string[];
  amud: "a" | "b";
  title: string;
  /** שורות הגמרא כפי שנשברו בדפוס וילנא — מאפשר מצב "דפוס מדויק" */
  printLines?: string[];
}

type Renderer = ReturnType<typeof dafRenderer>;

/**
 * צורת הדף חיה: הגמרא במרכז, רש"י פנימה, תוספות בחוץ — מהטקסט שלנו,
 * בלי OCR. חיפוש מדגיש בכל הזרמים; פאנל עיצוב קובע גופן, גודל וצבעים
 * והפריסה מחושבת מחדש כך שהכל נשאר באותו דף.
 */
export default function DafPage({ gemara, rashi, tosafot, amud, title, printLines }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [style, setStyle] = useState<DafStyle>(DEFAULT_DAF_STYLE);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [showStyle, setShowStyle] = useState(false);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    loadDafStyle().then((s) => { setStyle(s); setStyleLoaded(true); });
  }, []);

  // רוחב הדף לפי המיכל (עד 760px) — הפריסה מתאימה את עצמה
  useLayoutEffect(() => {
    const el = hostRef.current?.parentElement;
    if (!el) return;
    const update = () => setWidth(Math.max(320, Math.min(760, el.clientWidth - 8)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // רינדור: נוצר מחדש בכל שינוי עיצוב/טקסט/חיפוש (זול — עמוד אחד)
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !styleLoaded) return;
    let cancelled = false;
    host.innerHTML = "";
    const print = style.mode === "print" && !!printLines?.length;
    const base = 15 * style.scale;
    // גיאומטריית דפוס וילנא (נמדדה מהדפים המעוגנים): אזור טקסט 434px —
    // גמרא 40%, רש״י/תוספות ~27% כל אחד; גופן גמרא 12.6px, רש״י 7.7px, תוספות 6.9px.
    // במצב דפוס הכל נמדד ביחס לרוחב הדף, כך שהשורות נשארות זהות לספר בכל גודל.
    const pageW = print ? Math.round(width * style.scale) : width;
    const k = pageW / 434.36;
    const renderer = dafRenderer(host, {
      contentWidth: `${pageW}px`,
      mainWidth: print ? "40%" : "50%",
      padding: print ? { vertical: `${4 * k}px`, horizontal: `${6 * k}px` } : { vertical: "8px", horizontal: "14px" },
      // במצב דפוס הגופן נעול לווילנא/רש״י המקוריים — כך השורות תואמות לספר
      fontFamily: print
        ? { main: FONT_FAMILY.Vilna, inner: FONT_FAMILY.Rashi, outer: FONT_FAMILY.Rashi }
        : { main: FONT_FAMILY[style.mainFont], inner: FONT_FAMILY[style.sideFont], outer: FONT_FAMILY[style.sideFont] },
      direction: "rtl",
      fontSize: print
        ? { main: `${12.6 * k}px`, side: `${7.4 * k}px` }
        : { main: `${base}px`, side: `${base * 0.72}px` },
      lineHeight: print
        ? { main: `${12.03 * k}px`, side: `${10.6 * k}px` }
        : { main: `${base * 1.15}px`, side: `${base * 0.72 * 1.33}px` },
    });
    rendererRef.current = renderer;
    const prep = (segs: string[]) => (style.nikud ? segs : segs.map(stripNikud));
    const q = style.nikud ? query : stripNikud(query);
    const mainBody = print ? buildPrintLinesHtml(printLines!, q) : buildMainHtml(prep(gemara), q);
    const main = `<span style="color:${style.colors.main}">${mainBody}</span>`;
    const inner = `<span style="color:${style.colors.inner}">${buildSideHtml(prep(rashi), "inner", q)}</span>`;
    const outer = `<span style="color:${style.colors.outer}">${buildSideHtml(prep(tosafot), "outer", q)}</span>`;
    // הספרייה דורשת שהגופנים יהיו טעונים לפני חישוב הפריסה
    document.fonts.ready.then(() => {
      if (cancelled) return;
      try {
        renderer.render(main, inner, outer, amud);
      } catch (e) {
        host.innerHTML = `<p style="padding:1rem;color:#a00">שגיאה בפריסת הדף: ${String(e)}</p>`;
      }
    });
    return () => { cancelled = true; };
  }, [gemara, rashi, tosafot, amud, style, query, width, styleLoaded, printLines]);

  const isPrint = style.mode === "print" && !!printLines?.length;
  const mainForCount = isPrint ? printLines! : gemara;
  const hits = style.nikud
    ? countHits(query, mainForCount, rashi, tosafot)
    : countHits(stripNikud(query), mainForCount.map(stripNikud), rashi.map(stripNikud), tosafot.map(stripNikud));

  const update = (patch: Partial<DafStyle>) => {
    const next = { ...style, ...patch, colors: { ...style.colors, ...(patch.colors ?? {}) } };
    setStyle(next);
    void saveDafStyle(next);
  };

  return (
    <div className="space-y-2">
      {/* סרגל: חיפוש + עיצוב */}
      <div className="card-panel py-2 px-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className="input h-9 pr-8"
            placeholder="חיפוש בדף — גמרא, רש״י, תוספות"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="absolute left-2 top-2 text-muted-foreground hover:text-foreground" onClick={() => setQuery("")}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {query && <span className="text-sm text-gold font-medium">{hits} מופעים</span>}
        <button
          className={`btn-outline h-9 ${showStyle ? "border-gold text-gold bg-gold/10" : ""}`}
          onClick={() => setShowStyle((v) => !v)}
        >
          <Palette className="h-4 w-4" /> עיצוב
        </button>
      </div>

      {showStyle && (
        <div className="card-panel py-3 px-3 grid md:grid-cols-2 gap-3 text-sm animate-slide-in-down">
          <div className="md:col-span-2 flex items-center gap-2 flex-wrap">
            <span className="font-medium">מצב פריסה:</span>
            <button
              className={`btn-outline h-8 text-xs ${style.mode === "print" ? "border-gold text-gold bg-gold/10" : ""} ${!printLines?.length ? "opacity-50" : ""}`}
              disabled={!printLines?.length}
              title={printLines?.length ? "שורות זהות לדפוס וילנא; הגופן נעול למקורי" : "אין עדיין נתוני שורות דפוס למסכת זו"}
              onClick={() => update({ mode: "print" })}
            >
              דפוס מדויק{printLines?.length ? "" : " (לא זמין)"}
            </button>
            <button
              className={`btn-outline h-8 text-xs ${style.mode === "live" || !printLines?.length ? "border-gold text-gold bg-gold/10" : ""}`}
              onClick={() => update({ mode: "live" })}
            >
              פריסה חיה
            </button>
            {isPrint && <span className="text-xs text-muted-foreground">בדפוס מדויק הגופן נשאר וילנא/רש״י; צבע וגודל ניתנים לשינוי</span>}
          </div>
          <label className={`flex items-center justify-between gap-2 ${isPrint ? "opacity-50" : ""}`}>
            גופן גמרא
            <select className="input h-9 w-44" disabled={isPrint} value={style.mainFont} onChange={(e) => update({ mainFont: e.target.value as DafStyle["mainFont"] })}>
              <option value="Vilna">וילנא (מקורי)</option>
              <option value="FrankRuhl">פרנק-רוהל</option>
              <option value="Heebo">Heebo</option>
            </select>
          </label>
          <label className={`flex items-center justify-between gap-2 ${isPrint ? "opacity-50" : ""}`}>
            גופן רש״י/תוספות
            <select className="input h-9 w-44" disabled={isPrint} value={style.sideFont} onChange={(e) => update({ sideFont: e.target.value as DafStyle["sideFont"] })}>
              <option value="Rashi">כתב רש״י (מקורי)</option>
              <option value="FrankRuhl">פרנק-רוהל</option>
              <option value="Heebo">Heebo</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            גודל טקסט
            <input type="range" min={0.85} max={1.6} step={0.05} value={style.scale} className="w-44"
              onChange={(e) => update({ scale: Number(e.target.value) })} />
          </label>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            צבעים
            <span className="flex items-center gap-2">
              <label className="flex items-center gap-1">גמרא <input type="color" value={style.colors.main} onChange={(e) => update({ colors: { ...style.colors, main: e.target.value } })} /></label>
              <label className="flex items-center gap-1">רש״י <input type="color" value={style.colors.inner} onChange={(e) => update({ colors: { ...style.colors, inner: e.target.value } })} /></label>
              <label className="flex items-center gap-1">תוס׳ <input type="color" value={style.colors.outer} onChange={(e) => update({ colors: { ...style.colors, outer: e.target.value } })} /></label>
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="accent-[hsl(var(--gold))] h-4 w-4" checked={style.nikud} onChange={(e) => update({ nikud: e.target.checked })} />
            הצג ניקוד וטעמים (ברירת המחדל כמו בדפוס וילנא — ללא)
          </label>
          <div className="flex justify-end">
            <button className="btn-ghost h-8 text-xs" onClick={() => update(DEFAULT_DAF_STYLE)}>איפוס לברירת מחדל</button>
          </div>
        </div>
      )}

      {/* הדף עצמו */}
      <div className="gold-frame bg-white p-2 overflow-x-auto">
        <p className="text-center font-bold mb-1" style={{ color: style.colors.headers, fontFamily: FONT_FAMILY.Vilna }}>
          {title}
        </p>
        <div ref={hostRef} className="lemaan-daf mx-auto" style={{ width: isPrint ? Math.round(width * style.scale) : width }} dir="rtl" />
      </div>
    </div>
  );
}
