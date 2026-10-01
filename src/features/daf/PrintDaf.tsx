import { useLayoutEffect, useMemo, useRef } from "react";
import { sanitizeSegment } from "./buildHtml";
import { FONT_FAMILY, type DafStyle } from "./dafStyle";

/** גיאומטריית עמוד דפוס: גושי טקסט במיקום/רוחב מדויקים (נמדדו מהדפוס). */
export interface PrintSlab {
  s: "gemara" | "rashi" | "tosafot";
  l: number; t: number; w: number; h: number;
  fs: number; lh: number;
  lines?: string[]; // גמרא — שורה-שורה כמו בספר
  text?: string;    // רש"י/תוספות — זורם בתוך הגוש
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

  const slabs = useMemo(
    () =>
      layout.slabs.map((slab) => ({
        slab,
        html:
          slab.s === "gemara"
            ? (slab.lines ?? [])
                .map((line, i) => `<span class="daf-seg daf-pline" data-stream="main" data-i="${i}">${sanitizeSegment(line, query)}</span>`)
                .join("")
            : `<span class="daf-seg" data-stream="${slab.s === "rashi" ? "inner" : "outer"}">${sideHtml(slab.text ?? "", query)}</span>`,
      })),
    [layout, query]
  );

  return (
    <div
      ref={rootRef}
      className="lemaan-daf lemaan-print relative mx-auto bg-white"
      dir="rtl"
      style={{ width, height: layout.page.h * k, position: "relative", overflow: "hidden" }}
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
