/**
 * בניית שלושת זרמי ה-HTML לצורת הדף מהקטעים שלנו (ספריא):
 * כל קטע עטוף ב-span עם מזהה — לחיפוש, צביעה וזיהוי מהיר.
 *
 * טקסטי ספריא מכילים תגיות עיצוב (<b> לדיבור-המתחיל, <big><strong> לפתיחת
 * משנה, <i>, <sup>, <small>, <br>, <img>). נשמרות רק תגיות עיצוב מותרות;
 * כל השאר מוסר — כך לעולם לא מופיע טקסט לטיני/תגית בתוך הדף.
 */

/** הסרת ניקוד וטעמים (U+0591–U+05C7) — להצגה כמו בדפוס וילנא. */
export const stripNikud = (s: string) => s.replace(/[֑-ׇ]/g, "");

const ALLOWED: Record<string, string> = { b: "b", strong: "b", big: "big", i: "i", sup: "sup", small: "small" };

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ישויות HTML נפוצות בטקסט המקור → תווים. */
const unescapeEntities = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/**
 * מנקה קטע מקור: טקסט (עם הדגשת חיפוש) + תגיות עיצוב מותרות בלבד.
 * מחזיר HTML בטוח. <br> הופך לרווח (שבירת שורות נקבעת ע"י הפריסה, לא ע"י המקור).
 */
export function sanitizeSegment(raw: string, query = ""): string {
  const src = unescapeEntities(raw);
  const q = query.trim();
  const text = (t: string) => {
    if (!t) return "";
    if (!q) return escapeText(t);
    const parts = t.split(q);
    if (parts.length === 1) return escapeText(t);
    return parts.map(escapeText).join(`<mark class="daf-hit">${escapeText(q)}</mark>`);
  };
  let out = "";
  const re = /<\s*(\/?)\s*([a-zA-Z0-9]+)[^>]*>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out += text(src.slice(last, m.index));
    last = re.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "br") out += " ";
    else if (ALLOWED[tag]) out += closing ? `</${ALLOWED[tag]}>` : `<${ALLOWED[tag]}>`;
    // img / a / כל תגית אחרת — מוסרת לחלוטין
  }
  out += text(src.slice(last));
  return out;
}

export function buildMainHtml(segments: string[], query = ""): string {
  return segments
    .map((seg, i) => `<span class="daf-seg" data-stream="main" data-i="${i}">${sanitizeSegment(seg, query)} </span>`)
    .join("");
}

export function buildSideHtml(segments: string[], stream: "inner" | "outer", query = ""): string {
  return segments
    .map((seg, i) => {
      // דיבור המתחיל: אם המקור לא הדגיש בעצמו, מדגישים את הטקסט שלפני " - "
      const hasBold = /<\s*(b|strong)\b/i.test(seg);
      const m = !hasBold ? seg.match(/^(.{2,80}?)\s[-–]\s([\s\S]*)$/) : null;
      const body = m
        ? `<b class="daf-dh">${sanitizeSegment(m[1], query)}</b> — ${sanitizeSegment(m[2], query)}`
        : sanitizeSegment(seg, query);
      return `<span class="daf-seg" data-stream="${stream}" data-i="${i}">${body} </span>`;
    })
    .join("");
}


/** טקסט נקי (בלי תגיות) — לספירת מופעים. */
const plain = (s: string) => unescapeEntities(s).replace(/<[^>]+>/g, "");

/** כמה פעמים מופיע הביטוי בכל הזרמים (למונה החיפוש). */
export function countHits(query: string, ...streams: string[][]): number {
  const q = query.trim();
  if (!q) return 0;
  let n = 0;
  for (const segs of streams) for (const s of segs) n += plain(s).split(q).length - 1;
  return n;
}
