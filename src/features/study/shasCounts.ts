// מוני שאלות ומצב תרגול לכל מסכת/דף — חישוב אחד מהמאגר, משותף למסך התרגול
// ולחלון הניווט הצף (בלי כפילות).
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import { SEDARIM } from "./shas";
import type { Card } from "./types";

/** לכל דף: כמה שאלות בכל עמוד, וכמה כבר תורגלו / ממתינות לחזרה. */
export interface DafEntry { a: number; b: number; none: number; reviewed: number; due: number }
export type DafCounts = Map<number, DafEntry>;
export type DafStatus = "new" | "partial" | "done" | "due";

export const emptyDafEntry = (): DafEntry => ({ a: 0, b: 0, none: 0, reviewed: 0, due: 0 });
export const dafTotal = (e: DafEntry) => e.a + e.b + e.none;

export function dafStatus(e: DafEntry): DafStatus {
  if (e.due > 0) return "due";
  if (e.reviewed === 0) return "new";
  return e.reviewed >= dafTotal(e) ? "done" : "partial";
}

export const STATUS_DOT: Record<DafStatus, string> = {
  new: "",
  partial: "border-2 border-green-600 bg-transparent",
  done: "bg-green-600",
  due: "bg-gold",
};
export const STATUS_LABEL: Record<DafStatus, string> = {
  new: "עוד לא התחלת",
  partial: "בתהליך",
  done: "נלמד",
  due: "ממתין לחזרה",
};

export const sederOf = (masechta: string) => SEDARIM.find((s) => s.masechtot.includes(masechta))?.name ?? null;

export function computeShasCounts(cards: Card[] | undefined, now = Date.now()): Map<string, DafCounts> {
  const byMasechta = new Map<string, DafCounts>();
  if (!cards) return byMasechta;
  for (const c of cards) {
    if (!c.masechta) continue;
    const dafNum = parseInt(c.daf ?? "", 10);
    if (!Number.isFinite(dafNum)) continue;
    let dafMap = byMasechta.get(c.masechta);
    if (!dafMap) byMasechta.set(c.masechta, (dafMap = new Map()));
    let entry = dafMap.get(dafNum);
    if (!entry) dafMap.set(dafNum, (entry = emptyDafEntry()));
    if (c.amud === "1") entry.a++;
    else if (c.amud === "2") entry.b++;
    else entry.none++;
    if (c.srs.lastReviewedAt != null) {
      entry.reviewed++;
      if (c.srs.dueAt <= now) entry.due++;
    }
  }
  return byMasechta;
}

/** סיכום למסכת: שאלות, דפים, דפים שתורגלו (נלמדו או בתהליך). */
export function masechtaSummary(counts: Map<string, DafCounts>, name: string) {
  let questions = 0, dafs = 0, practiced = 0, due = 0;
  for (const e of counts.get(name)?.values() ?? []) {
    questions += dafTotal(e);
    dafs++;
    if (e.reviewed > 0) practiced++;
    if (e.due > 0) due++;
  }
  return { questions, dafs, practiced, due };
}

/** כל השאלות + המונים, מתעדכנים חי. undefined עד שהמאגר נטען. */
export function useShasCounts(): { cards: Card[] | undefined; counts: Map<string, DafCounts> } {
  const cards = useLiveQuery(() => db.cards.toArray(), []);
  const counts = useMemo(() => computeShasCounts(cards), [cards]);
  return { cards, counts };
}
