import { normHe } from "./printSearchCore";
import { unescapeEntities } from "./buildHtml";

/**
 * הדגשת חיפוש בדף הדפוס המדויק — באותה השוואה כמו החיפוש בכל הש"ס (printSearchCore.normHe):
 * בלי ניקוד, גרשיים ופיסוק, ועל פני הזרם כולו (ביטוי שעובר משורה לשורה).
 *
 * קודם ההדגשה חיפשה את המחרוזת הגולמית בתוך כל שורה לחוד, ולכן עמוד שנפתח מתוצאת חיפוש הוצג לעתים
 * בלי אף הדגשה ("0 מופעים") — בביטוי שחוצה שורה, עם ניקוד, או עם גרש עברי במקום גרש רגיל.
 *
 * הפלט: לכל שורה — טווחים [התחלה, סוף) בטקסט הגלוי שלה (הטקסט שבין התגיות, כפי ש-sanitizeSegment מציג).
 */
export type Ranges = [number, number][];

const NIKUD = /[֑-ׇ]/;
const PUNCT = /["'״׳.,:;!?()[\]{}־-]/;
const TAG = /<\s*(\/?)\s*([a-zA-Z0-9]+)[^>]*>/g;

/** הטקסט הגלוי של שורה וגבולות התגיות שבה (כמו sanitizeSegment: תגיות לא נספרות, <br> = רווח) */
function visible(rawIn: string): { text: string; breaks: Set<number> } {
  const raw = unescapeEntities(rawIn);
  let text = "";
  const breaks = new Set<number>();
  let last = 0;
  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(raw))) {
    text += raw.slice(last, m.index);
    last = TAG.lastIndex;
    if (m[2].toLowerCase() === "br") text += " ";
    else breaks.add(text.length); // גבול תגית — כמו רווח בהשוואה (strip ב-PrintSearch מחליף תגית ברווח)
  }
  text += raw.slice(last);
  return { text, breaks };
}

/**
 * הטקסט המנורמל של זרם שלם (השורות מחוברות ברווח), ולכל תו בו — מאיזו שורה ומאיזה מקום בטקסט הגלוי שלה.
 * זהה ל-lines.map(normHe).join(" ") אחרי איחוד רווחים.
 */
export function normalizeStream(lines: string[]): { norm: string; line: Int32Array; pos: Int32Array } {
  let norm = "";
  const line: number[] = [], pos: number[] = [];
  let space = true; // בתחילה — לא מוסיפים רווח מוביל
  const pushSpace = () => { if (!space) { norm += " "; line.push(-1); pos.push(-1); space = true; } };
  lines.forEach((raw, li) => {
    pushSpace();
    const { text, breaks } = visible(raw);
    for (let i = 0; i < text.length; i++) {
      if (breaks.has(i)) pushSpace();
      const ch = text[i];
      if (/\s/.test(ch)) { pushSpace(); continue; }
      if (NIKUD.test(ch) || PUNCT.test(ch)) continue;
      norm += ch; line.push(li); pos.push(i); space = false;
    }
  });
  if (norm.endsWith(" ")) { norm = norm.slice(0, -1); line.pop(); pos.pop(); }
  return { norm, line: Int32Array.from(line), pos: Int32Array.from(pos) };
}

/**
 * מספר המופעים שמודגשים בדף דפוס שלם, בדיוק כמו ההדגשה ב-PrintDaf: כל זרם (גמרא, רש"י, תוספות) לאורכו,
 * ומילת הפתיחה שבמסגרת המעוטרת ומילות הקישור בתחתית העמוד — כל אחת לבדה. גושים בלי שורות (text) לא כאן:
 * הם מודגשים ונספרים בדרך הישנה (countHits ב-DafPage).
 * (קודם מילת הפתיחה ומילות הקישור הודגשו ולא נספרו — ברכות ב. "מאימתי": 5 הדגשות, המונה 4; נמצא באתר למען)
 */
export function printHitCount(
  layout: { slabs: { s: string; lines?: { t: string }[] }[]; box?: { text: string } | null; catch?: { text: string }[] },
  query: string,
): number {
  let n = 0;
  for (const s of ["gemara", "rashi", "tosafot"]) {
    n += streamHighlights(layout.slabs.filter((sl) => sl.s === s && sl.lines?.length).flatMap((sl) => sl.lines!.map((l) => l.t)), query).count;
  }
  for (const t of [...(layout.box?.text ? [layout.box.text] : []), ...(layout.catch ?? []).map((c) => c.text)]) {
    n += streamHighlights([t], query).count;
  }
  return n;
}

/** טווחי ההדגשה לכל שורה בזרם, ומספר המופעים. שאילתה קצרה מתו אחד (אחרי נרמול) — בלי הדגשה, כמו בחיפוש */
export function streamHighlights(lines: string[], query: string): { ranges: Ranges[]; count: number } {
  const ranges: Ranges[] = lines.map(() => []);
  const nq = normHe(query);
  if (nq.length < 1) return { ranges, count: 0 };
  const { norm, line, pos } = normalizeStream(lines);
  let count = 0;
  for (let i = norm.indexOf(nq); i >= 0; i = norm.indexOf(nq, i + nq.length)) {
    count++;
    // לכל שורה שהמופע עובר בה: מהתו הראשון עד האחרון שלו בשורה הזו
    const per = new Map<number, [number, number]>();
    for (let j = i; j < i + nq.length; j++) {
      const li = line[j];
      if (li < 0) continue;
      const r = per.get(li);
      if (r) r[1] = pos[j] + 1; else per.set(li, [pos[j], pos[j] + 1]);
    }
    per.forEach((r, li) => ranges[li].push(r));
  }
  return { ranges, count };
}
