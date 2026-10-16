import type { Card } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// ============================================================================
// SRS Algorithm Selection (per-user preference, persisted in localStorage)
// ============================================================================
export type SrsAlgorithm = "sm2" | "fsrs";

const ALGO_KEY = (userId: string) => `srs-algo:${userId}`;
const RETENTION_KEY = (userId: string) => `srs-retention:${userId}`;

export function getSrsAlgorithm(userId: string | null): SrsAlgorithm {
  if (!userId) return "sm2";
  try {
    const v = localStorage.getItem(ALGO_KEY(userId));
    return v === "fsrs" ? "fsrs" : "sm2";
  } catch { return "sm2"; }
}

export function setSrsAlgorithm(userId: string, algo: SrsAlgorithm) {
  try { localStorage.setItem(ALGO_KEY(userId), algo); } catch { /* ignore */ }
}

export function getRetentionTarget(userId: string | null): number {
  if (!userId) return 0.9;
  try {
    const v = parseFloat(localStorage.getItem(RETENTION_KEY(userId)) ?? "");
    return Number.isFinite(v) && v > 0.5 && v < 0.99 ? v : 0.9;
  } catch { return 0.9; }
}

export function setRetentionTarget(userId: string, target: number) {
  try { localStorage.setItem(RETENTION_KEY(userId), String(target)); } catch { /* ignore */ }
}

// ============================================================================
// SM-2
// ============================================================================
// SM-2 algorithm. quality 0..5 (0-2 = fail, 3-5 = pass)
export function applySM2(card: Card, quality: 0 | 1 | 2 | 3 | 4 | 5): Card["srs"] {
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

  const dueAt = Date.now() + interval * DAY;
  return {
    ...card.srs,
    ease,
    interval,
    repetitions,
    dueAt,
    lastReviewedAt: Date.now(),
  };
}

// ============================================================================
// FSRS (simplified FSRS-4.5 inspired implementation)
//
// Models memory with two state variables: difficulty (D) and stability (S).
// quality is mapped from 0..5 → rating 1..4 (Again/Hard/Good/Easy).
// Interval = S * ln(retentionTarget) / ln(0.9). Default retention 0.9.
// ============================================================================
// Default FSRS-style weights (heuristic, calibrated for general use).
const FSRS_W = {
  initS: [1.0, 1.4, 4.5, 12.0],   // initial stability per rating (Again..Easy)
  initD: [7.5, 5.5, 3.5, 2.5],    // initial difficulty per rating
  dDecay: 0.07,                    // difficulty regression toward mean
  sFactor: 1.5,                    // stability bump factor
  hardPenalty: 0.85,               // multiplier when rating=Hard
  easyBonus: 1.2,                  // multiplier when rating=Easy
  lapseMul: 0.4,                   // stability multiplier on lapse
  minStability: 0.1,
};

const qualityToRating = (q: 0 | 1 | 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 => {
  if (q < 3) return 1;        // Again
  if (q === 3) return 2;      // Hard
  if (q === 4) return 3;      // Good
  return 4;                   // Easy
};

export function applyFSRS(
  card: Card,
  quality: 0 | 1 | 2 | 3 | 4 | 5,
  retentionTarget = 0.9,
): Card["srs"] {
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
    // elapsed days since last review
    const elapsedDays = prev.lastReviewedAt
      ? Math.max(0.1, (Date.now() - prev.lastReviewedAt) / DAY)
      : 1;
    // current retrievability (forgetting curve): R = exp(-elapsed/S)
    const retrievability = Math.exp(-elapsedDays / prevS);

    // difficulty update: nudge toward 5 (mean), then adjust by rating
    const dDelta = (rating - 3) * -1.0; // Again→+2, Hard→+1, Good→0, Easy→-1
    difficulty = prevD + dDelta * 0.6;
    difficulty = difficulty + (5 - difficulty) * FSRS_W.dDecay; // regression to mean
    difficulty = Math.min(10, Math.max(1, difficulty));

    if (isLapse) {
      stability = Math.max(FSRS_W.minStability, prevS * FSRS_W.lapseMul);
    } else {
      // stability gain depends on difficulty (harder cards grow slower) and retrievability
      const difficultyFactor = (11 - difficulty) / 10;     // 0.1..1.0
      const retentionFactor = 1 + (1 - retrievability) * 2; // higher when forgotten more
      let mul = 1 + FSRS_W.sFactor * difficultyFactor * retentionFactor;
      if (rating === 2) mul *= FSRS_W.hardPenalty;
      if (rating === 4) mul *= FSRS_W.easyBonus;
      stability = prevS * mul;
    }
  }

  // interval = S * ln(target) / ln(0.9)
  const intervalDays = Math.max(1, Math.round(
    stability * (Math.log(retentionTarget) / Math.log(0.9))
  ));

  // small fuzz factor (+/- 5%) to avoid clustering
  const fuzz = 1 + (Math.random() * 0.1 - 0.05);
  const fuzzedDays = Math.max(1, Math.round(intervalDays * fuzz));

  return {
    ease: prev.ease, // keep for backward compat / SM-2 fallback
    interval: fuzzedDays,
    repetitions: isLapse ? 0 : (prev.repetitions ?? 0) + 1,
    dueAt: Date.now() + fuzzedDays * DAY,
    lastReviewedAt: Date.now(),
    stability,
    difficulty,
    lapses: (prev.lapses ?? 0) + (isLapse ? 1 : 0),
  };
}

// Unified entry point used by store.reviewCard
export function applyReview(
  card: Card,
  quality: 0 | 1 | 2 | 3 | 4 | 5,
  algorithm: SrsAlgorithm,
  retentionTarget = 0.9,
): Card["srs"] {
  return algorithm === "fsrs"
    ? applyFSRS(card, quality, retentionTarget)
    : applySM2(card, quality);
}

export function defaultSrs(): Card["srs"] {
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
 * Smart priority score for ordering due cards.
 * Higher score = study sooner. Combines four signals:
 *
 *  1. Overdue urgency  — how late is the card vs its interval (relative lateness).
 *  2. Difficulty       — low ease (struggling cards) gets boosted.
 *  3. Accuracy         — historic % correct; weak cards get boosted.
 *  4. Leech penalty    — many incorrect reviews → boost (needs attention).
 *  5. New-card bonus   — never-reviewed cards interleave near the top.
 *
 * Cards never reviewed get a small bonus so they enter rotation but don't
 * dominate over genuinely overdue cards.
 */
export function priorityScore(card: Card, now: number = Date.now()): number {
  const { srs, stats } = card;

  // 1. Overdue ratio — how many "intervals" past due. Clamped to avoid runaway.
  const intervalMs = Math.max(srs.interval, 1) * DAY;
  const lateness = Math.max(0, now - srs.dueAt);
  const overdueRatio = Math.min(lateness / intervalMs, 5); // cap at 5x
  const overdueScore = overdueRatio * 40;

  // 2. Difficulty (low ease = harder). Ease ranges ~1.3 - 2.8.
  // Map 1.3 → ~30, 2.5 → 0, 2.8 → negative.
  const difficultyScore = (2.5 - srs.ease) * 25;

  // 3. Accuracy boost — fewer-correct cards reviewed more.
  let accuracyScore = 0;
  if (stats.totalReviews > 0) {
    const accuracy = stats.correct / stats.totalReviews;
    accuracyScore = (1 - accuracy) * 30; // 0% correct → +30, 100% → 0
  }

  // 4. Leech penalty — many failures means card needs urgent attention.
  const leechScore = Math.min(stats.incorrect, 10) * 3;

  // 5. New card bonus — never reviewed yet.
  const newBonus = srs.lastReviewedAt === null ? 15 : 0;

  // 6. Tiny recency dampener — avoid showing same card twice in close succession.
  let recencyPenalty = 0;
  if (srs.lastReviewedAt) {
    const sinceReview = now - srs.lastReviewedAt;
    if (sinceReview < HOUR) recencyPenalty = 50 * (1 - sinceReview / HOUR);
  }

  return overdueScore + difficultyScore + accuracyScore + leechScore + newBonus - recencyPenalty;
}

/**
 * Build a study queue ordered by priority. Due cards first, sorted by
 * priorityScore (desc). Optionally interleaves a few "soon-due" cards if
 * the due pool is small, so users still get a useful session.
 */
export function buildStudyQueue(cards: Card[], now: number = Date.now(), minSize = 5): Card[] {
  const due = cards.filter((c) => c.srs.dueAt <= now);
  const sorted = [...due].sort((a, b) => priorityScore(b, now) - priorityScore(a, now));

  if (sorted.length >= minSize) return sorted;

  // Top up with soon-due cards (closest to due) when the queue is small.
  const upcoming = cards
    .filter((c) => c.srs.dueAt > now)
    .sort((a, b) => a.srs.dueAt - b.srs.dueAt)
    .slice(0, minSize - sorted.length);
  return [...sorted, ...upcoming];
}
