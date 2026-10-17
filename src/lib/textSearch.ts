// חיפוש מהיר בעברית בשאלות: מתעלם מניקוד, טעמים, גרשיים וסימני פיסוק; כל המילים שהוקלדו חייבות
// להופיע (בכל סדר). הטקסט המנורמל של כל שאלה נשמר בזיכרון — חיפוש ב־23 אלף שאלות לוקח מילישניות.
import type { Card } from "../features/study/types";

const MARKS = /[֑-ׇ]/g; // ניקוד וטעמים
const PUNCT = /["'״׳`.,:;!?()[\]{}\-–—/\\|*_+=<>~]/g;

export const normalizeHe = (s: string): string =>
  s.normalize("NFC").replace(MARKS, "").replace(PUNCT, " ").replace(/\s+/g, " ").trim().toLowerCase();

const cache = new WeakMap<Card, { q: string; rest: string }>();
const textOf = (c: Card) => {
  let t = cache.get(c);
  if (!t) {
    t = { q: normalizeHe(c.question), rest: normalizeHe(`${c.answer ?? ""} ${(c.options ?? []).join(" ")} ${c.masechta ?? ""}`) };
    cache.set(c, t);
  }
  return t;
};

/** שאלות שמכילות את כל המילים; קודם אלה שכל המילים בשאלה עצמה. */
export function searchCards(cards: Card[], query: string): Card[] {
  const words = normalizeHe(query).split(" ").filter(Boolean);
  if (!words.length) return cards;
  const inQuestion: Card[] = [];
  const elsewhere: Card[] = [];
  for (const c of cards) {
    const t = textOf(c);
    let all = true;
    let allInQ = true;
    for (const w of words) {
      const inQ = t.q.includes(w);
      if (!inQ) allInQ = false;
      if (!inQ && !t.rest.includes(w)) {
        all = false;
        break;
      }
    }
    if (all) (allInQ ? inQuestion : elsewhere).push(c);
  }
  return inQuestion.concat(elsewhere);
}
