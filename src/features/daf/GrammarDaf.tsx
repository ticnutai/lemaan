import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { FONT_FAMILY, type DafStyle } from "./dafStyle";
import { G, placeBlocks, type AmudSpec, type PlacedBlock } from "./grammar";
import { stripNikud } from "./buildHtml";

export interface BlockReport {
  s: string; w: number; n: number; first: string; last: string; words: number; lines: number; ws: number;
}

interface Props {
  gemara: string[];
  rashi: string[];
  tosafot: string[];
  spec: AmudSpec;
  width: number;
  style: DafStyle;
  /**
   * עוגנים: לכל זרם — המילה הראשונה של כל גוש (החל מהגוש השני) והמילה
   * האחרונה של העמוד. קובעים את תחומי הטקסט במדויק; בלעדיהם — copyfit בלבד.
   */
  anchors?: Partial<Record<"gemara" | "rashi" | "tosafot", { firsts: string[]; last?: string }>>;
  onReport?: (r: BlockReport[]) => void;
}

const TAGS = /<[^>]+>/g;
const HEB = /[א-ת]/;
const norm = (t: string) => stripNikud(t).replace(/[^א-ת]/g, "");
/** מילים בלבד — אסימוני עריכה ("—", "…") של ספריא אינם בדפוס */
const toWords = (segs: string[], nikud: boolean) =>
  segs.flatMap((seg) => (nikud ? seg : stripNikud(seg)).replace(TAGS, " ").split(/\s+/).filter((w) => HEB.test(w)));

/** ריווח אותיות בסיס לזרם הנמדד כעת (מפרשים) — נקבע לפני כל מדידה */
let baseLs = 0;
/** סימון מילת דיבור המתחיל (במפרשים) — נקרא ע"י toHtml, נעלם ב-norm */
const DH = "";
/**
 * מפרשים: כל דיבור הוא "דיבור המתחיל – פירוש"; בדפוס הד"ה באותיות מרובעות
 * מודגשות ואחריו נקודה (הקו המפריד של ספריא אינו בדפוס).
 */
const toSideWords = (segs: string[], nikud: boolean) =>
  segs.flatMap((seg) => {
    const plain = (nikud ? seg : stripNikud(seg)).replace(TAGS, " ");
    const m = plain.match(/^(.*?)\s+[–—-]\s+(.*)$/s);
    const split = (t: string) => t.split(/\s+/).filter((w) => HEB.test(w));
    if (!m) return split(plain);
    const dh = split(m[1]);
    if (dh.length) dh[dh.length - 1] = dh[dh.length - 1].replace(/[.:]?$/, ".");
    return [...dh.map((w) => DH + w), ...split(m[2])];
  });
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
/** מילים → HTML: רצפי ד"ה עטופים בגופן המרובע */
function toHtml(words: string[], dhFont: string) {
  let out = "", inDh = false;
  for (const w of words) {
    const isDh = w.startsWith(DH);
    if (isDh !== inDh) {
      out += isDh ? `<span style="font-family:${dhFont};font-weight:700">` : "</span>";
      inDh = isDh;
    }
    out += esc(isDh ? w.slice(1) : w) + " ";
  }
  return out.trimEnd() + (inDh ? "</span>" : "");
}

/** מספר השורות שטקסט תופס ברוחב/ריווח נתונים (מדידה ב-DOM נסתר). */
function measureLines(m: HTMLElement, text: string, widthPx: number, font: string, fsPx: number, lhPx: number, wsPx: number, lsPx = 0) {
  lsPx += baseLs;
  m.style.cssText = `position:absolute;visibility:hidden;direction:rtl;text-align:justify;width:${widthPx}px;font-family:${font};font-size:${fsPx}px;line-height:${lhPx}px;white-space:normal;word-spacing:${wsPx}px;letter-spacing:${lsPx}px`;
  m.innerHTML = text;
  return Math.round(m.offsetHeight / lhPx);
}

/** כמה מילים נכנסות ל-n שורות (חיפוש בינארי). */
function fitCount(m: HTMLElement, words: string[], start: number, n: number, widthPx: number, font: string, fsPx: number, lhPx: number, wsPx: number, dhFont = font) {
  let lo = 0, hi = words.length - start;
  if (hi <= 0) return 0;
  const H = (c: number) => toHtml(words.slice(start, start + c), dhFont);
  if (measureLines(m, H(hi), widthPx, font, fsPx, lhPx, wsPx) <= n) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measureLines(m, H(mid), widthPx, font, fsPx, lhPx, wsPx) <= n) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * copyfit: ריווח מילים (ואם צריך גם ריווח אותיות שלילי — הדפוס משתמש בקיצורים
 * שספריא פורשת, אז הטקסט שלנו ארוך במקצת) כך שהטקסט ייכנס בדיוק ל-n שורות.
 */
function fitSpacing(m: HTMLElement, text: string, n: number, widthPx: number, font: string, fsPx: number, lhPx: number, k: number) {
  const L = (ws: number, ls: number) => measureLines(m, text, widthPx, font, fsPx, lhPx, ws, ls);
  const wsMin = -3 * k, wsMax = 4 * k;
  // אם גם בהידוק המילים המרבי זה גולש — מהדקים אותיות בצעדים
  let ls = 0;
  while (L(wsMin, ls) > n && ls > -0.6 * k) ls -= 0.1 * k;
  if (L(wsMin, ls) > n) return { ws: wsMin, ls, lines: L(wsMin, ls) };
  if (L(wsMax, ls) < n) return { ws: wsMax, ls, lines: L(wsMax, ls) };
  let lo = wsMin, hi = wsMax;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (L(mid, ls) <= n) lo = mid; else hi = mid;
  }
  return { ws: lo, ls, lines: L(lo, ls) };
}

/**
 * התאמת אסימון דפוס למילות ספריא: מילה רגילה — שוויון; קיצור עם גרשיים/גרש
 * (א"ר, ת"ר, ר') — ראשי תיבות: כל אות מול תחילת מילה עוקבת. מחזיר כמה מילים נצרכו (0 = אין).
 */
function matchToken(words: string[], i: number, token: string): number {
  const isAbbr = /["׳״']/.test(token);
  const key = norm(token);
  if (!key) return 0;
  if (norm(words[i] ?? "") === key) return 1; // אותו כתיב (ויקיטקסט שומר על הקיצור)
  if (!isAbbr) return 0;
  for (let j = 0; j < key.length; j++) {
    const w = norm(words[i + j] ?? "");
    if (!w || w[0] !== key[j]) return 0;
  }
  return key.length;
}

/** כמה מילים בזרם מכסה העוגן החל ממיקום (קיצורים נפרשים לכמה מילים). */
export function anchorSpan(words: string[], i: number, anchor: string): number {
  let p = i;
  for (const t of anchor.split(/\s+/).filter((t) => norm(t))) p += matchToken(words, p, t) || 1;
  return p - i;
}

/** כל המופעים של עוגן בזרם (מיקום תחילת המופע). */
export function findAll(words: string[], anchor: string, from = 0): number[] {
  const out: number[] = [];
  for (let i = from; i < words.length; i++) if (findAnchor(words, i, anchor) === i) out.push(i);
  return out;
}

/** מבין כמה מופעים — זה שמביא את גודל הגוש הכי קרוב לקיבולת המחושבת. */
function closestToCapacity(cands: number[], start: number, capacity: number): number {
  let best = cands[0], bestD = Infinity;
  for (const c of cands) {
    const d = Math.abs((c - start) - capacity);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

/** איתור עוגן (מילה-שתיים, כולל קיצורים) בזרם, מהתחלה או מהסוף אחורה. */
export function findAnchor(words: string[], from: number, anchor: string, backwards = false): number {
  const tokens = anchor.split(/\s+/).filter((t) => norm(t));
  if (!tokens.length) return -1;
  const at = (i: number) => {
    let p = i;
    for (const t of tokens) {
      const used = matchToken(words, p, t);
      if (!used) return false;
      p += used;
    }
    return true;
  };
  if (backwards) {
    for (let i = words.length - 1; i >= from; i--) if (at(i)) return i;
    return -1;
  }
  for (let i = from; i < words.length; i++) if (at(i)) return i;
  return -1;
}

/**
 * דף לפי דקדוק: הגושים מוצבים לפי המספרים; הטקסט של כל זרם נכנס לגושים —
 * עם עוגנים: תחום מדויק לכל גוש + ריווח מכויל ל-N שורות (copyfit);
 * בלי עוגנים: כמה שנכנס ב-N שורות.
 */
export default function GrammarDaf({ gemara, rashi, tosafot, spec, width, style, anchors, onReport }: Props) {
  const k = width / G.frame;
  const measureRef = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState<{ b: PlacedBlock; text: string; ws: number; ls: number; hang?: string }[]>([]);

  const placed = useMemo(() => placeBlocks(spec), [spec]);
  const streams = useMemo(
    () => ({ gemara: toWords(gemara, style.nikud), rashi: toSideWords(rashi, style.nikud), tosafot: toSideWords(tosafot, style.nikud) }),
    [gemara, rashi, tosafot, style.nikud]
  );

  useLayoutEffect(() => {
    const m = measureRef.current;
    if (!m) return;
    const run = () => {
      const pos = { gemara: 0, rashi: 0, tosafot: 0 };
      const blockIdx = { gemara: 0, rashi: 0, tosafot: 0 };
      const out: { b: PlacedBlock; text: string; ws: number; ls: number; hang?: string }[] = [];
      const report: BlockReport[] = [];
      // תחום סיום העמוד לכל זרם (עוגן "מילה אחרונה")
      const endOf: Record<string, number> = {};
      for (const s of ["gemara", "rashi", "tosafot"] as const) {
        const a = anchors?.[s];
        const w = streams[s];
        endOf[s] = w.length;
        if (a?.last) {
          // המופע האחרון — רצף הסיום חוזר לפעמים גם קודם בעמוד
          const idx = findAnchor(w, Math.max(0, w.length - 160), a.last, true);
          if (idx >= 0) endOf[s] = idx + anchorSpan(w, idx, a.last);
        }
      }
      for (const b of placed) {
        const words = streams[b.s].slice(0, endOf[b.s]);
        const font = b.s === "gemara" ? FONT_FAMILY[style.mainFont] : FONT_FAMILY[style.sideFont];
        baseLs = b.s !== "gemara" && style.sideFont === "Rashi" ? G.side.ls * k : 0;
        const a = anchors?.[b.s];
        const bi = blockIdx[b.s]++;
        const remainingBlocks = placed.filter((p) => p.s === b.s).length - bi - 1;
        let end: number;
        if (a && bi < a.firsts.length) {
          // גבול הגוש = המילה הראשונה של הגוש הבא; בין מופעים חוזרים — הקרוב לקיבולת
          const cap = fitCount(m, words, pos[b.s], b.n, b.w * k, font, b.fs * k, b.lh * k, -1.5 * k, FONT_FAMILY[style.mainFont]);
          const cands = findAll(words, a.firsts[bi], pos[b.s] + 1);
          end = cands.length ? closestToCapacity(cands, pos[b.s], cap) : pos[b.s] + cap;
        } else if (remainingBlocks === 0) {
          end = words.length; // הגוש האחרון לוקח את שארית הטקסט
        } else {
          end = pos[b.s] + fitCount(m, words, pos[b.s], b.n, b.w * k, font, b.fs * k, b.lh * k, -1.5 * k, FONT_FAMILY[style.mainFont]);
        }
        const slice = words.slice(pos[b.s], end);
        // סוף הגמרא: 1–2 מילים תלויות בשורה משלהן, מיושרות לשמאל
        const hangN = b.s === "gemara" && remainingBlocks === 0 && spec.hang && b.n > 1 ? spec.hang : 0;
        const body = hangN ? slice.slice(0, -hangN) : slice;
        const hang = hangN ? slice.slice(-hangN).join(" ") : undefined;
        const text = toHtml(body, FONT_FAMILY[style.mainFont]);
        const fit = fitSpacing(m, text, b.n - (hangN ? 1 : 0), b.w * k, font, b.fs * k, b.lh * k, k);
        const { ws, ls } = fit;
        const lines = fit.lines + (hangN ? 1 : 0);
        pos[b.s] = end;
        out.push({ b, text, ws, ls: ls + baseLs, hang });
        report.push({ s: b.s, w: b.w, n: b.n, first: (slice[0] ?? "").replace(DH, ""), last: (slice[slice.length - 1] ?? "").replace(DH, ""), words: slice.length, lines, ws: +(ws / k).toFixed(2) });
      }
      setFilled(out);
      onReport?.(report);
    };
    document.fonts.ready.then(run);
  }, [placed, streams, k, style.mainFont, style.sideFont, onReport, anchors, spec.hang]);

  const height = Math.max(...placed.map((b) => b.y + b.n * b.lh), 0) + 10;
  const colorOf = (s: PlacedBlock["s"]) => (s === "gemara" ? style.colors.main : s === "rashi" ? style.colors.inner : style.colors.outer);

  return (
    <div className="lemaan-daf lemaan-grammar relative mx-auto bg-white" dir="rtl" style={{ width, height: height * k, position: "relative" }}>
      <div ref={measureRef} aria-hidden />
      {filled.map(({ b, text, ws, ls, hang }, i) => (
        <div
          key={i}
          className="absolute daf-grammar-block"
          data-stream={b.s}
          style={{
            left: b.x * k, top: b.y * k, width: b.w * k, height: b.n * b.lh * k,
            fontSize: b.fs * k, lineHeight: `${b.lh * k}px`,
            fontFamily: b.s === "gemara" ? FONT_FAMILY[style.mainFont] : FONT_FAMILY[style.sideFont],
            fontWeight: b.s === "gemara" ? 600 : 400,
            color: colorOf(b.s), textAlign: "justify", overflow: "hidden", wordSpacing: `${ws}px`, letterSpacing: `${ls}px`,
          }}
        >
          {hang ? <span style={{ display: "block", textAlignLast: "justify" }} dangerouslySetInnerHTML={{ __html: text }} /> : <span dangerouslySetInnerHTML={{ __html: text }} />}
          {hang && <span style={{ display: "block", textAlign: "left" }}>{hang}</span>}
        </div>
      ))}
    </div>
  );
}
