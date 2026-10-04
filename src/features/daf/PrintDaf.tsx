import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { sanitizeSegment } from "./buildHtml";
import { FONT_FAMILY, type DafStyle } from "./dafStyle";

/** גיאומטריית עמוד דפוס: גושי טקסט במיקום/רוחב מדויקים (נמדדו מהדפוס). */
export interface PrintSlab {
  s: "gemara" | "rashi" | "tosafot";
  l: number; t: number; w: number; h: number;
  fs: number; lh: number;
  /** גמרא — שורה-שורה כמו בספר, עם ריווח המילים המדויק של הדפוס (px במידות העמוד) */
  /** ws=null: ריווח לא נמדד — השורה מיושרת לשני הצדדים ברוחב w (כמו בדפוס) */
  lines?: { t: string; ws: number | null; w: number | null; i?: number }[];
  text?: string;    // רש"י/תוספות — זורם בתוך הגוש (כשאין שורות)
}
export interface PrintLayout {
  page: { w: number; h: number };
  slabs: PrintSlab[];
  header: { l: number; t: number; fs: number; text: string }[];
  /** דף פתיחת מסכת: המילה הראשונה במסגרת מעוטרת */
  box?: { l: number; t: number; w: number; h: number; text: string };
  /** מילות הקישור בתחתית העמוד: המילה הראשונה של העמוד הבא, בגופן הזרם שלה; base = קו הבסיס */
  catch?: { s: PrintSlab["s"]; l: number; base: number; fs: number; text: string }[];
}

/**
 * רש"י/תוספות: הדגשת דיבור-המתחיל — הטקסט שלפני הנקודה הראשונה בכל פיסקה
 * (פיסקאות מסתיימות בנקודתיים, כמו בדפוס).
 */
function sideHtml(text: string, query: string): string {
  return text
    .split(/(?<=:)\s+/)
    .map((para) => {
      const i = para.indexOf(". ");
      if (i > 1 && i < 60) {
        return `<b class="daf-dh">${sanitizeSegment(para.slice(0, i + 1), query)}</b> ${sanitizeSegment(para.slice(i + 2), query)}`;
      }
      return sanitizeSegment(para, query);
    })
    .join(" ");
}

interface Props {
  layout: PrintLayout;
  width: number; // רוחב התצוגה בפיקסלים — הכל מתרחב ביחס
  style: DafStyle;
  query: string;
}

/**
 * דפוס מדויק: כל גוש במקומו ובמידותיו כמו בדף הווילנא, בלי שום חישוב פריסה.
 * שורות הגמרא זהות לספר; הגופן נעול למקורי; צבע וחיפוש על טקסט חי.
 */
export default function PrintDaf({ layout, width, style, query }: Props) {
  const k = width / layout.page.w;
  const rootRef = useRef<HTMLDivElement>(null);

  // שורת גמרא שרחבה מגוש הדפוס (הבדלי מטריקה בין הגופן לדפוס) מתכווצת
  // אופקית למידת הגוש — כך כל שורה מסתיימת בדיוק היכן שהיא מסתיימת בספר.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fit = () => {
      root.querySelectorAll<HTMLElement>(".daf-pline").forEach((el) => {
        el.style.transform = "";
        const ratio = el.clientWidth / el.scrollWidth;
        if (ratio < 0.999) {
          el.style.transformOrigin = "right";
          el.style.transform = `scaleX(${ratio.toFixed(4)})`;
        }
      });
    };
    document.fonts.ready.then(fit);
    fit();
  }, [layout, width, query, style]);
  const colorOf = (s: PrintSlab["s"]) => (s === "gemara" ? style.colors.main : s === "rashi" ? style.colors.inner : style.colors.outer);

  // הגוש האחרון של הגמרא בעמוד: השורה האחרונה שלו, אם היא מילה-שתיים "תלויות",
  // מיושרת לשמאל — כך בדפוס וילנא (העין ממשיכה לעמוד הבא).
  const lastGemara = [...layout.slabs].reverse().find((sl) => sl.s === "gemara");
  const slabs = useMemo(
    () =>
      layout.slabs.map((slab) => ({
        slab,
        html: slab.lines
          ? slab.lines
              .map((line, i, arr) => {
                const hanging = slab.s === "gemara" && slab === lastGemara && i === arr.length - 1 && line.t.trim().split(/\s+/).length <= 2;
                const justify = line.ws == null ? (line.w && !hanging ? "text-align-last:justify" : "") : `word-spacing:${(line.ws * k).toFixed(2)}px`;
                const width = line.w && !hanging ? `;width:${(line.w * k).toFixed(1)}px` : "";
                const indent = line.i ? `;margin-right:${(line.i * k).toFixed(1)}px` : "";
                // גובה קבוע לכל שורה: ד"ה באותיות מרובעות (גופן אחר, יחסי גובה אחרים) הגביה את שורתו ב-4%,
                // והסטייה הצטברה לאורך העמודה
                const fixedH = `;height:${(slab.lh * k).toFixed(3)}px`;
                const stream = slab.s === "gemara" ? "main" : slab.s === "rashi" ? "inner" : "outer";
                return `<span class="daf-seg daf-pline${hanging ? " daf-hanging" : ""}" data-stream="${stream}" data-i="${i}" style="${justify}${width}${indent}${fixedH}">${sanitizeSegment(line.t, query) || "&nbsp;"}</span>`;
              })
              .join("")
          : `<span class="daf-seg" data-stream="${slab.s === "rashi" ? "inner" : "outer"}">${sideHtml(slab.text ?? "", query)}</span>`,
      })),
    [layout, query, k, lastGemara]
  );

  return (
    <div
      ref={rootRef}
      className="lemaan-daf lemaan-print relative mx-auto bg-white"
      dir="rtl"
      style={{
        width,
        // גובה לפי תחתית הגוש האחרון (ולא כל שולי הדף הריקים של הסריקה)
        height: (Math.min(layout.page.h, Math.max(...layout.slabs.map((sl) => sl.t + sl.h), ...(layout.catch ?? []).map((c) => c.base + 3)) + 14)) * k,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {layout.box && (
        <div
          className="absolute flex items-center justify-center font-bold"
          style={{
            left: layout.box.l * k, top: layout.box.t * k, width: layout.box.w * k, height: layout.box.h * k,
            fontFamily: FONT_FAMILY.Vilna, color: style.colors.main,
            fontSize: Math.min(layout.box.h * 0.5, (layout.box.w * 0.72) / Math.max(2, layout.box.text.length * 0.62)) * k,
            lineHeight: 1,
          }}
        >
          <OrnateFrame w={layout.box.w * k} h={layout.box.h * k} color={style.colors.main} />
          <span className="daf-seg relative" data-stream="main" dangerouslySetInnerHTML={{ __html: sanitizeSegment(layout.box.text, query) }} />
        </div>
      )}
      {(layout.catch ?? []).map((c, i) => (
        <span
          key={`c${i}`}
          className="absolute whitespace-nowrap daf-seg"
          data-stream={c.s === "gemara" ? "main" : c.s === "rashi" ? "inner" : "outer"}
          style={{
            left: c.l * k, top: (c.base - c.fs) * k, fontSize: c.fs * k, lineHeight: `${c.fs * k}px`,
            fontFamily: c.s === "gemara" ? FONT_FAMILY.Vilna : FONT_FAMILY.Rashi, fontWeight: c.s === "gemara" ? 600 : 400,
            color: colorOf(c.s),
          }}
          dangerouslySetInnerHTML={{ __html: sanitizeSegment(c.text, query) }}
        />
      ))}
      {layout.header.map((hl, i) => (
        <span
          key={`h${i}`}
          className="absolute whitespace-nowrap font-bold"
          style={{
            left: hl.l * k, top: hl.t * k, fontSize: hl.fs * k, lineHeight: 1,
            fontFamily: FONT_FAMILY.Vilna, color: style.colors.headers,
          }}
        >
          {hl.text}
        </span>
      ))}
      {slabs.map(({ slab, html }, i) => (
        <div
          key={i}
          className={`absolute ${slab.s === "gemara" ? "daf-print-gemara" : `daf-print-side daf-print-${slab.s}`}`}
          style={{
            left: slab.l * k, top: slab.t * k, width: slab.w * k, height: slab.h * k,
            fontSize: slab.fs * k, lineHeight: `${slab.lh * k}px`,
            fontFamily: slab.s === "gemara" ? FONT_FAMILY.Vilna : FONT_FAMILY.Rashi,
            fontWeight: slab.s === "gemara" ? 600 : 400,
            color: colorOf(slab.s),
            textAlign: "justify",
            overflow: "hidden",
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ))}
    </div>
  );
}

/**
 * המסגרת המעוטרת של מילת הפתיחה במסכת — כמו בדפוס וילנא: קו חיצוני וקו פנימי, וביניהם פס של
 * טבעות שזורות (דוגמה חוזרת). ב-SVG, בצבע הטקסט, כך שהיא משתנה עם ערכת הנושא.
 */
function OrnateFrame({ w, h, color }: { w: number; h: number; color: string }) {
  const id = useId().replace(/:/g, "");
  const b = Math.max(4, Math.min(w, h) * 0.13); // עובי הפס המעוטר
  const t = b; // גודל אריח הדוגמה
  const sw = Math.max(0.6, b * 0.07);
  const band = `M0 0H${w}V${h}H0Z M${b} ${b}V${h - b}H${w - b}V${b}Z`;
  return (
    <svg className="absolute inset-0" width={w} height={h} aria-hidden="true" style={{ overflow: "visible" }}>
      <defs>
        <pattern id={`orn${id}`} width={t} height={t} patternUnits="userSpaceOnUse">
          <circle cx={t / 2} cy={t / 2} r={t * 0.3} fill="none" stroke={color} strokeWidth={sw} />
          <circle cx={t / 2} cy={t / 2} r={t * 0.1} fill={color} />
          <path d={`M0 ${t / 2}Q${t / 4} ${t * 0.15} ${t / 2} ${t * 0.2}M${t / 2} ${t * 0.8}Q${t * 0.75} ${t * 0.85} ${t} ${t / 2}`}
            fill="none" stroke={color} strokeWidth={sw} />
          <path d={`M${t / 2} 0Q${t * 0.85} ${t / 4} ${t * 0.8} ${t / 2}M${t * 0.2} ${t / 2}Q${t * 0.15} ${t * 0.75} ${t / 2} ${t}`}
            fill="none" stroke={color} strokeWidth={sw} />
        </pattern>
      </defs>
      <path d={band} fill={`url(#orn${id})`} fillRule="evenodd" />
      <rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} fill="none" stroke={color} strokeWidth={sw * 1.6} />
      <rect x={b} y={b} width={w - 2 * b} height={h - 2 * b} fill="none" stroke={color} strokeWidth={sw * 1.3} />
    </svg>
  );
}
