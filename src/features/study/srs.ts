import type { Card, SrsState } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export type SrsAlgorithm = "sm2" | "fsrs";

// ============================================================================
// SM-2 — quality 0..5 (0-2 = fail, 3-5 = pass)
// ============================================================================
export function applySM2(card: Card, quality: 0 | 1 | 2 | 3 | 4 | 5): SrsState {
  let { ease, interval, repetitions } = card.srs;

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 3;
    else interval = Math.round(interval * ease);
    repetitions += 1;
  }

  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ease < 1.3) ease = 1.3;

  return {
    ...card.srs,
    ease,
    interval,
    repetitions,
    dueAt: Date.now() + interval * DAY,
    lastReviewedAt: Date.now(),
  };
}

// ============================================================================
// FSRS (simplified FSRS-4.5 inspired): difficulty (D) + stability (S).
// Interval = S * ln(retentionTarget) / ln(0.9).
// ============================================================================
const FSRS_W = {
  initS: [1.0, 1.4, 4.5, 12.0],
  initD: [7.5, 5.5, 3.5, 2.5],
  dDecay: 0.07,
  sFactor: 1.5,
  hardPenalty: 0.85,
  easyBonus: 1.2,
  lapseMul: 0.4,
  minStability: 0.1,
};

const qualityToRating = (q: 0 | 1 | 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 => {
  if (q < 3) return 1;
  if (q === 3) return 2;
  if (q === 4) return 3;
  return 4;
};

export function applyFSRS(card: Card, quality: 0 | 1 | 2 | 3 | 4 | 5, retentionTarget = 0.9): SrsState {
  const rating = qualityToRating(quality);
  const isLapse = rating === 1;
  const prev = card.srs;
  const isNew = !prev.lastReviewedAt || (prev.stability ?? 0) === 0;

  let stability: number;
  let difficulty: number;

  if (isNew) {
    stability = FSRS_W.initS[rating - 1];
    difficulty = Math.min(10, Math.max(1, FSRS_W.initD[rating - 1]));
  } else {
    const prevS = Math.max(prev.stability ?? 1, FSRS_W.minStability);
    const prevD = Math.min(10, Math.max(1, prev.difficulty ?? 5));
    const elapsedDays = prev.lastReviewedAt ? Math.max(0.1, (Date.now() - prev.lastReviewedAt) / DAY) : 1;
    const retrievability = Math.exp(-elapsedDays / prevS);

    const dDelta = (rating - 3) * -1.0;
    difficulty = prevD + dDelta * 0.6;
    difficulty = difficulty + (5 - difficulty) * FSRS_W.dDecay;
    difficulty = Math.min(10, Math.max(1, difficulty));

    if (isLapse) {
      stability = Math.max(FSRS_W.minStability, prevS * FSRS_W.lapseMul);
    } else {
      const difficultyFactor = (11 - difficulty) / 10;
      const retentionFactor = 1 + (1 - retrievability) * 2;
      let mul = 1 + FSRS_W.sFactor * difficultyFactor * retentionFactor;
      if (rating === 2) mul *= FSRS_W.hardPenalty;
      if (rating === 4) mul *= FSRS_W.easyBonus;
      stability = prevS * mul;
    }
  }

  const intervalDays = Math.max(1, Math.round(stability * (Math.log(retentionTarget) / Math.log(0.9))));
  const fuzz = 1 + (Math.random() * 0.1 - 0.05);
  const fuzzedDays = Math.max(1, Math.round(intervalDays * fuzz));

  return {
    ease: prev.ease,
    interval: fuzzedDays,
    repetitions: isLapse ? 0 : (prev.repetitions ?? 0) + 1,
    dueAt: Date.now() + fuzzedDays * DAY,
    lastReviewedAt: Date.now(),
    stability,
    difficulty,
    lapses: (prev.lapses ?? 0) + (isLapse ? 1 : 0),
  };
}

export function applyReview(card: Card, quality: 0 | 1 | 2 | 3 | 4 | 5, algorithm: SrsAlgorithm, retentionTarget = 0.9): SrsState {
  return algorithm === "fsrs" ? applyFSRS(card, quality, retentionTarget) : applySM2(card, quality);
}

export function defaultSrs(): SrsState {
  return {
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    dueAt: Date.now(),
    lastReviewedAt: null,
    stability: 0,
    difficulty: 5,
    lapses: 0,
  };
}

export function isDue(card: Card): boolean {
  return card.srs.dueAt <= Date.now();
}

/**
 * Smart priority score for ordering due cards. Higher = study sooner.
 * Combines overdue urgency, difficulty, accuracy, leech penalty,
 * new-card bonus and a recency dampener.
 */
export function priorityScore(card: Card, now: number = Date.now()): number {
  const { srs, stats } = card;

  const intervalMs = Math.max(srs.interval, 1) * DAY;
  const lateness = Math.max(0, now - srs.dueAt);
  const overdueScore = Math.min(lateness / intervalMs, 5) * 40;

  const difficultyScore = (2.5 - srs.ease) * 25;

  let accuracyScore = 0;
  if (stats.totalReviews > 0) {
    accuracyScore = (1 - stats.correct / stats.totalReviews) * 30;
  }

  const leechScore = Math.min(stats.incorrect, 10) * 3;
  const newBonus = srs.lastReviewedAt === null ? 15 : 0;

  let recencyPenalty = 0;
  if (srs.lastReviewedAt) {
    const sinceReview = now - srs.lastReviewedAt;
    if (sinceReview < HOUR) recencyPenalty = 50 * (1 - sinceReview / HOUR);
  }

  return overdueScore + difficultyScore + accuracyScore + leechScore + newBonus - recencyPenalty;
}

/** Due cards first by priority; tops up with soon-due cards when small. */
export function buildStudyQueue(cards: Card[], now: number = Date.now(), minSize = 5): Card[] {
  const due = cards.filter((c) => c.srs.dueAt <= now);
  const sorted = [...due].sort((a, b) => priorityScore(b, now) - priorityScore(a, now));
  if (sorted.length >= minSize) return sorted;

  const upcoming = cards
    .filter((c) => c.srs.dueAt > now)
    .sort((a, b) => a.srs.dueAt - b.srs.dueAt)
    .slice(0, minSize - sorted.length);
  return [...sorted, ...upcoming];
}
