/**
 * "דקדוק" דף וילנא — נמדד על 125 עמודי ברכות המעוגנים (יחידות: px של עמוד 643.58):
 * מסגרת טקסט 435 רוחב; גמרא ב-3 רוחבים (170/300/430) מתחילה 59px מראש המסגרת;
 * מפרשים: ראש 210 / עמודה 120 / פס מלא 430, מראש המסגרת; מרווח 12.5;
 * גופנים 12.6 (גמרא) / 7.7 (מפרשים); פסיעות 12.03 / 11.16.
 * מכאן: עמוד = מספרים שלמים בלבד — כמה שורות בכל גוש.
 */
export const G = {
  frame: 435,
  gutter: 12.5,
  gemaraTop: 59,
  gemara: { fs: 12.6, lh: 12.033, widths: [170, 300, 430] as const },
  side: { fs: 7.7, lh: 11.16, head: 210, col: 120, band: 430 },
};

export type Side = "right" | "left";
export interface BlockSpec { w: number; n: number }
export interface AmudSpec {
  gemara: BlockSpec[];
  rashi: BlockSpec[];
  tosafot: BlockSpec[];
  rashiSide: Side; // באיזה צד עמודת רש"י (תוספות בצד השני)
  /** מילים בשורה התלויה בסוף הגמרא (0 = אין) — נכללת במניין השורות של הגוש האחרון, מיושרת לשמאל */
  hang?: number;
}

export interface PlacedBlock {
  s: "gemara" | "rashi" | "tosafot";
  x: number; y: number; w: number; n: number; fs: number; lh: number;
}

/** הצבת גושים לפי הדקדוק (קואורדינטות יחסית למסגרת, יחידות עמוד). */
export function placeBlocks(spec: AmudSpec): PlacedBlock[] {
  const out: PlacedBlock[] = [];
  const F = G.frame;
  // מפרשים: ראש ואז עמודה, נערמים מלמעלה
  const sideX = (side: Side, w: number) => (side === "right" ? F - w : 0);
  const stackSide = (s: "rashi" | "tosafot", side: Side, blocks: BlockSpec[]) => {
    let y = 0;
    for (const b of blocks) {
      const w = b.w >= 400 ? G.side.band : b.w >= 180 ? G.side.head : G.side.col;
      out.push({ s, x: w >= 400 ? 0 : sideX(side, w), y, w, n: b.n, fs: G.side.fs, lh: G.side.lh });
      y += b.n * G.side.lh;
    }
    return y;
  };
  const tosSide: Side = spec.rashiSide === "right" ? "left" : "right";
  const rashiEnd = stackSide("rashi", spec.rashiSide, spec.rashi);
  const tosEnd = stackSide("tosafot", tosSide, spec.tosafot);
  // גמרא: צר (בין שניהם) / בינוני (ליד המפרש שנשאר — הארוך יותר) / מלא
  const longer: Side = rashiEnd >= tosEnd ? spec.rashiSide : tosSide;
  let y = G.gemaraTop;
  for (const b of spec.gemara) {
    const w = b.w >= 400 ? 430 : b.w >= 250 ? 300 : 170;
    let x: number;
    if (w === 170) x = G.side.col + G.gutter;           // בין שתי העמודות
    else if (w === 300) x = longer === "right" ? 0 : F - 300; // מול העמודה שנשארה
    else x = 0;
    out.push({ s: "gemara", x, y, w, n: b.n, fs: G.gemara.fs, lh: G.gemara.lh });
    y += b.n * G.gemara.lh;
  }
  return out;
}

/**
 * copyfit: כמה מילים נכנסות ל-n שורות ברוחב w (בגופן/גודל נתונים).
 * מודד ב-DOM נסתר; חיפוש בינארי על מספר המילים.
 */
export function fitWords(
  measure: HTMLElement, words: string[], start: number, n: number,
  widthPx: number, font: string, fsPx: number, lhPx: number, wordSpacingPx = 0, letterSpacingPx = 0
): number {
  measure.style.cssText = `position:absolute;visibility:hidden;direction:rtl;text-align:justify;width:${widthPx}px;font-family:${font};font-size:${fsPx}px;line-height:${lhPx}px;white-space:normal;word-spacing:${wordSpacingPx}px;letter-spacing:${letterSpacingPx}px`;
  const linesOf = (count: number) => {
    measure.textContent = words.slice(start, start + count).join(" ");
    return Math.round(measure.offsetHeight / lhPx);
  };
  let lo = 0, hi = words.length - start;
  if (hi <= 0) return 0;
  if (linesOf(hi) <= n) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (linesOf(mid) <= n) lo = mid; else hi = mid - 1;
  }
  return lo;
}
