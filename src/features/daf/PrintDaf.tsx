import { useLayoutEffect, useMemo, useRef } from "react";
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
                const stream = slab.s === "gemara" ? "main" : slab.s === "rashi" ? "inner" : "outer";
                return `<span class="daf-seg daf-pline${hanging ? " daf-hanging" : ""}" data-stream="${stream}" data-i="${i}" style="${justify}${width}${indent}">${sanitizeSegment(line.t, query) || "&nbsp;"}</span>`;
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
        height: (Math.min(layout.page.h, Math.max(...layout.slabs.map((sl) => sl.t + sl.h)) + 14)) * k,
        position: "relative",
        overflow: "hidden",
      }}
    >
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
          className={`absolute ${slab.s === "gemara" ? "daf-print-gemara" : "daf-print-side"}`}
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
