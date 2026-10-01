/**
 * בניית שלושת זרמי ה-HTML לצורת הדף מהקטעים שלנו (ספריא):
 * כל קטע עטוף ב-span עם מזהה — לחיפוש, צביעה וזיהוי מהיר.
 * ברש"י ובתוספות — דיבור המתחיל מודגש (הטקסט שלפני " - " / " – ").
 */

/** הסרת ניקוד וטעמים (U+0591–U+05C7) — להצגה כמו בדפוס וילנא. */
export const stripNikud = (s: string) => s.replace(/[֑-ׇ]/g, "");

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function highlight(text: string, query: string, cls: string): string {
  if (!query) return escapeHtml(text);
  const q = query.trim();
  if (!q) return escapeHtml(text);
  const parts = text.split(q);
  if (parts.length === 1) return escapeHtml(text);
  return parts.map(escapeHtml).join(`<mark class="${cls}">${escapeHtml(q)}</mark>`);
}

export function buildMainHtml(segments: string[], query = ""): string {
  return segments
    .map((seg, i) => `<span class="daf-seg" data-stream="main" data-i="${i}">${highlight(seg, query, "daf-hit")} </span>`)
    .join("");
}

export function buildSideHtml(segments: string[], stream: "inner" | "outer", query = ""): string {
  return segments
    .map((seg, i) => {
      const m = seg.match(/^(.{2,80}?)\s[-–]\s([\s\S]*)$/);
      const body = m
        ? `<b class="daf-dh">${highlight(m[1], query, "daf-hit")}</b> — ${highlight(m[2], query, "daf-hit")}`
        : highlight(seg, query, "daf-hit");
      return `<span class="daf-seg" data-stream="${stream}" data-i="${i}">${body} </span>`;
    })
    .join("");
}

/** כמה פעמים מופיע הביטוי בכל הזרמים (למונה החיפוש). */
export function countHits(query: string, ...streams: string[][]): number {
  const q = query.trim();
  if (!q) return 0;
  let n = 0;
  for (const segs of streams) for (const s of segs) n += s.split(q).length - 1;
  return n;
}
