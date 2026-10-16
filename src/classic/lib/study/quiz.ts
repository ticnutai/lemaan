import type { Card, Category, QuizPlan, QuizScope, QuizAttempt, QuizQuestionType } from "./types";
import { PATH_SEP } from "./shasGen";

/** האם תגית קטגוריה מתאימה ל-scope? */
export function tagMatchesScope(tag: string, scope: QuizScope): boolean {
  if (!tag.startsWith("cat:")) return false;
  const catName = tag.slice(4);
  if (!scope.path) return true; // "" = כל הקטגוריות
  if (catName === scope.path) return true;
  if (scope.includeDescendants && catName.startsWith(scope.path + PATH_SEP)) return true;
  return false;
}

export function cardMatchesAnyScope(card: Card, scopes: QuizScope[]): boolean {
  if (!scopes.length) return true;
  return card.tags.some((t) => scopes.some((s) => tagMatchesScope(t, s)));
}

/** סינון כרטיסיות לתוכנית בחינה לפי סקופ + סוגי שאלות */
export function filterCardsForPlan(allCards: Card[], plan: QuizPlan): Card[] {
  const allowedTypes = new Set<QuizQuestionType>(plan.questionTypes);
  return allCards.filter((c) => {
    if (!cardMatchesAnyScope(c, plan.scopes)) return false;
    if (c.type === "multiple") return allowedTypes.has("multiple");
    if (c.type === "boolean") return allowedTypes.has("multiple"); // נחשב כסוג אמריקאי
    if (c.type === "combo") {
      // עובר אם יש options או אם המשתמש בחר open
      if (allowedTypes.has("multiple") && Array.isArray(c.options) && c.options.length) return true;
      if (allowedTypes.has("open") && c.answer) return true;
      return false;
    }
    if (c.type === "flashcard") return allowedTypes.has("open");
    return false;
  });
}

/** דירוג כרטיסיה לפי הצלחות קודמות (גבוה = חלשה יותר) */
export function cardWeakness(card: Card): number {
  const total = card.stats.totalReviews || 0;
  if (total === 0) return 1; // לא נסקרה — קצת מעודד
  const correctRate = card.stats.correct / total;
  return 1 - correctRate;
}

/** בחירת קלפים לסשן אחד לפי plan */
export function buildSession(allCards: Card[], plan: QuizPlan, count: number, attempts: QuizAttempt[]): Card[] {
  const pool = filterCardsForPlan(allCards, plan);
  if (!pool.length) return [];

  const wrongIds = new Set<string>();
  for (const a of attempts) if (a.planId === plan.id) for (const id of a.wrongCardIds) wrongIds.add(id);

  const reviewedIds = new Set<string>();
  for (const a of attempts) if (a.planId === plan.id && a.finishedAt) {
    // approximation — we don't store all asked ids; treat correct = those not in wrongCardIds; not perfect
  }

  // ניקוד עדיפות לכל כרטיס לפי בחירות התוכנית
  type Scored = { card: Card; score: number };
  const scored: Scored[] = pool.map((c) => {
    let score = 0;
    if (plan.selection.weakFirst && wrongIds.has(c.id)) score += 5;
    if (plan.selection.weighted) score += cardWeakness(c) * 3;
    if (plan.selection.uncoveredFirst && (c.stats.totalReviews ?? 0) === 0) score += 4;
    if (plan.selection.random) score += Math.random() * 2;
    if (!plan.selection.weakFirst && !plan.selection.weighted && !plan.selection.uncoveredFirst) {
      score += Math.random();
    }
    return { card: c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.card);
}

/** חישוב streak (רצף ימים) של ניסיונות עם לפחות מבחן אחד */
export function calcStreakDays(attempts: QuizAttempt[], planId?: string): number {
  const filtered = planId ? attempts.filter((a) => a.planId === planId) : attempts;
  const days = new Set<string>();
  for (const a of filtered) {
    if (!a.finishedAt) continue;
    const d = new Date(a.finishedAt);
    const key = d.toISOString().slice(0, 10);
    days.add(key);
  }
  if (!days.size) return 0;
  let streak = 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 366; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) streak++;
    else if (i === 0) continue; // היום עוד לא בהכרח עשו
    else break;
  }
  return streak;
}

export function computeAccuracy(attempts: QuizAttempt[], planId?: string): { total: number; correct: number; pct: number } {
  const filtered = (planId ? attempts.filter((a) => a.planId === planId) : attempts).filter((a) => a.finishedAt);
  let total = 0, correct = 0;
  for (const a of filtered) { total += a.total; correct += a.correct; }
  return { total, correct, pct: total ? Math.round((correct / total) * 100) : 0 };
}

/** סך שאלות שעניתי עליהן לא נכון בתוכנית (unique) */
export function collectWrongCardIds(attempts: QuizAttempt[], planId: string): Set<string> {
  const set = new Set<string>();
  for (const a of attempts) if (a.planId === planId) for (const id of a.wrongCardIds) set.add(id);
  return set;
}

export function calcCumulativeScore(attempts: QuizAttempt[], planId: string): number {
  const filtered = attempts.filter((a) => a.planId === planId && a.finishedAt);
  if (!filtered.length) return 0;
  // ממוצע משוקלל לפי גודל מבחן
  let total = 0, weighted = 0;
  for (const a of filtered) { weighted += a.score * a.total; total += a.total; }
  return total ? Math.round(weighted / total) : 0;
}

/** האם תוכנית פעילה היום (לא הסתיימה) */
export function planIsCurrentlyActive(plan: QuizPlan): boolean {
  if (!plan.isActive) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (plan.duration.endDate) {
    const end = new Date(plan.duration.endDate + "T00:00:00");
    if (today > end) return false;
  }
  if (plan.duration.days && plan.duration.days > 0) {
    const created = new Date(plan.createdAt);
    const diff = (today.getTime() - created.getTime()) / 86400000;
    if (diff > plan.duration.days) return false;
  }
  return true;
}

/** רשימת קטגוריות זמינות לבחירה (path-based) */
export function listCategoryPaths(categories: Category[]): { path: string; depth: number }[] {
  // הקטגוריות מאוחסנות עם name = full path עם " · " — אז path = name
  return categories
    .map((c) => ({ path: c.name, depth: c.name.split(PATH_SEP).length }))
    .sort((a, b) => a.path.localeCompare(b.path, "he"));
}
