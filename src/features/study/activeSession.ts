// מצב התרגול הפעיל ומיקום הבחירה (סדר/מסכת/דף) — מחוץ לעמוד עצמו, כדי שיישמרו
// כשעוברים לגמרא או לכל מסך אחר וחוזרים. (בזיכרון בלבד — רענון מלא מתחיל מחדש.)
import { create } from "zustand";
import type { Card, SrsState, CardStats } from "./types";

/** מאיפה הגיע הסשן — לפירורי הלחם ולתרגול חוזר. */
export type SessionPath =
  | { kind: "shas"; masechta: string; daf?: number; leaf: string }
  | { kind: "deck"; name: string }
  | { kind: "pinned" };

/** תשובה שניתנה — לביטול התשובה האחרונה. */
export interface AnsweredStep {
  cardId: string;
  prevSrs: SrsState;
  prevStats: CardStats;
  logId: number;
  correct: boolean;
}

type Updater<T> = T | ((prev: T) => T);
const apply = <T,>(u: Updater<T>, prev: T): T => (typeof u === "function" ? (u as (p: T) => T)(prev) : u);

interface StudyState {
  // ---- מיקום הבחירה ----
  corpus: string;
  mode: "general" | "tests";
  seder: string | null;
  masechta: string | null;
  daf: number | null;
  // ---- סשן ----
  path: SessionPath | null;
  retry: boolean; // תרגול חוזר על הטעויות
  queue: Card[] | null;
  index: number;
  revealed: boolean;
  selected: number | null;
  stats: { correct: number; incorrect: number };
  wrongIds: string[];
  history: AnsweredStep[];
  // ---- שעון: זמן שנצבר + מתי הופעל לאחרונה (null = עצור) ----
  clockBase: number;
  clockStartedAt: number | null;

  set: <K extends keyof Omit<StudyState, "set" | "begin" | "end" | "elapsed">>(key: K, value: Updater<StudyState[K]>) => void;
  begin: (queue: Card[], path: SessionPath, retry?: boolean) => void;
  end: () => void;
  elapsed: () => number;
}

export const useStudySession = create<StudyState>((setState, get) => ({
  corpus: 'ש"ס',
  mode: "general",
  seder: null,
  masechta: null,
  daf: null,

  path: null,
  retry: false,
  queue: null,
  index: 0,
  revealed: false,
  selected: null,
  stats: { correct: 0, incorrect: 0 },
  wrongIds: [],
  history: [],
  clockBase: 0,
  clockStartedAt: null,

  set: (key, value) => setState((s) => ({ [key]: apply(value, s[key]) }) as Partial<StudyState>),

  begin: (queue, path, retry = false) =>
    setState({
      queue,
      path,
      retry,
      index: 0,
      revealed: false,
      selected: null,
      stats: { correct: 0, incorrect: 0 },
      wrongIds: [],
      history: [],
      clockBase: 0,
      clockStartedAt: Date.now(),
    }),

  end: () => setState({ queue: null, path: null, retry: false, history: [], wrongIds: [], clockStartedAt: null }),

  elapsed: () => {
    const { clockBase, clockStartedAt } = get();
    return clockBase + (clockStartedAt ? Date.now() - clockStartedAt : 0);
  },
}));
