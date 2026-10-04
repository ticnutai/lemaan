export type CardType = "flashcard" | "multiple" | "boolean" | "combo";

export interface SrsState {
  ease: number;
  interval: number; // days
  repetitions: number;
  dueAt: number;
  lastReviewedAt: number | null;
  stability: number;
  difficulty: number;
  lapses: number;
}

export interface CardStats {
  totalReviews: number;
  correct: number;
  incorrect: number;
}

export interface Card {
  id: string;
  type: CardType;
  question: string;
  answer: string; // flashcard answer / boolean explanation
  options: string[]; // multiple choice
  correctIndices: number[]; // multiple choice
  correct: boolean | null; // boolean type
  categoryId: string | null;
  deckIds: string[];
  tags: string[];
  masechta: string | null;
  daf: string | null;
  amud: string | null; // "1" = עמוד א', "2" = עמוד ב'
  createdAt: number;
  updatedAt: number;
  srs: SrsState;
  stats: CardStats;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  sortOrder: number;
}

export interface Deck {
  id: string;
  name: string;
  color: string | null;
  categoryIds: string[];
  includeSubCategories: boolean;
  /** בחירות תוכן למבחן: מסכת שלמה, דף שלם או עמוד ("1"/"2"). */
  filters?: { masechta: string; daf?: string; amud?: string }[];
  createdAt: number;
}

export interface ReviewLog {
  id?: number;
  cardId: string;
  at: number;
  quality: 0 | 1 | 2 | 3 | 4 | 5;
  correct: boolean;
  durationMs: number;
}

export type GoalType = "daily_reviews" | "daily_cards" | "success_rate" | "streak";

export interface Goal {
  id: string;
  type: GoalType;
  target: number;
  title: string;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: string;
}

/** תוכנית לימוד יומית: חומש, רמב"ם, דף יומי או כל ספר בקצב קבוע. */
export interface StudyPlan {
  id: string;
  name: string;
  unitLabel: string; // פרק / דף / משנה...
  totalUnits: number;
  unitsPerDay: number;
  startDate: number; // חצות היום הראשון
  completedUnits: number;
  createdAt: number;
  updatedAt: number;
  /** תוכנית ש"ס: היחידות הן עמודים/דפים אמיתיים של המסכת (planUnits.ts) */
  shas?: { masechta: string; slug: string; unit: "amud" | "daf"; startIndex: number };
}
