import type { Card, Category, PracticeResult, PracticeResultAnswer } from "./types";
import { SHAS_BAVLI } from "./shasData";
import { dafLabel, displayCategoryName, PATH_SEP } from "./shasGen";

export interface ShasPracticeLocation {
  masechta: string;
  daf: number;
  amud: 1 | 2;
}

export interface ShasPageAttempt {
  result: PracticeResult;
  correct: number;
  total: number;
  score: number;
}

export interface ShasAmudProgress extends ShasPracticeLocation {
  attempts: ShasPageAttempt[];
}

export interface ShasDafProgress {
  daf: number;
  amudim: ShasAmudProgress[];
}

export interface ShasMasechtaProgress {
  masechta: string;
  dapim: ShasDafProgress[];
}

const masechtaOrder = new Map(SHAS_BAVLI.map((item, index) => [item.name, index]));

function normalizeDaf(value: string): string {
  return value.replace(/^דף\s+/u, "").replace(/[.׳'״"\s]/gu, "");
}

function parseParts(parts: string[]): ShasPracticeLocation[] {
  const leaves = parts.map(displayCategoryName).map((part) => part.trim()).filter(Boolean);
  const masechtaInfo = SHAS_BAVLI.find((item) => leaves.includes(item.name));
  if (!masechtaInfo) return [];

  const daf = Array.from({ length: masechtaInfo.pages }, (_, index) => index + 2)
    .find((value) => leaves.some((leaf) => normalizeDaf(leaf) === normalizeDaf(dafLabel(value))));
  if (!daf) return [];

  const amudLeaf = leaves.find((leaf) => /^(?:עמוד\s*)?ע?[״"]?[אב][׳']?$/u.test(leaf.replace(/\s+/gu, "")));
  const normalizedAmud = amudLeaf?.replace(/[\s׳'״"]/gu, "") ?? "";
  if (normalizedAmud.endsWith("א")) return [{ masechta: masechtaInfo.name, daf, amud: 1 }];
  if (normalizedAmud.endsWith("ב")) return [{ masechta: masechtaInfo.name, daf, amud: 2 }];
  return [
    { masechta: masechtaInfo.name, daf, amud: 1 },
    { masechta: masechtaInfo.name, daf, amud: 2 },
  ];
}

function createCategoryResolver(categories: Category[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const byName = new Map(categories.map((category) => [category.name, category]));

  return (payload: string): ShasPracticeLocation[] => {
    const start = byId.get(payload) ?? byName.get(payload);
    const parts = payload.split(PATH_SEP);
    let current = start;
    let guard = 0;
    while (current && guard < 32) {
      parts.push(...current.name.split(PATH_SEP));
      current = current.parentId ? byId.get(current.parentId) : undefined;
      guard += 1;
    }
    return parseParts(parts);
  };
}

function dedupeLocations(locations: ShasPracticeLocation[]): ShasPracticeLocation[] {
  return [...new Map(locations.map((location) => [
    `${location.masechta}:${location.daf}:${location.amud}`,
    location,
  ])).values()];
}

function resolvePracticeAnswerLocationsWithResolver(
  answer: PracticeResultAnswer,
  card: Card | undefined,
  resolveCategory: (payload: string) => ShasPracticeLocation[],
): ShasPracticeLocation[] {
  const directMasechta = answer.masechta ?? card?.masechta ?? undefined;
  const directDaf = answer.daf ?? card?.daf ?? undefined;
  const directAmud = answer.amud ?? card?.amud ?? undefined;
  if (directMasechta && directDaf) {
    return directAmud === 1 || directAmud === 2
      ? [{ masechta: directMasechta, daf: directDaf, amud: directAmud }]
      : [
          { masechta: directMasechta, daf: directDaf, amud: 1 },
          { masechta: directMasechta, daf: directDaf, amud: 2 },
        ];
  }

  const payloads = [
    ...(answer.categoryPath ?? []),
    ...(card?.tags ?? []).filter((tag) => tag.startsWith("cat:")).map((tag) => tag.slice(4)),
  ];
  return dedupeLocations(payloads.flatMap(resolveCategory));
}

export function resolvePracticeAnswerLocations(
  answer: PracticeResultAnswer,
  card: Card | undefined,
  categories: Category[],
): ShasPracticeLocation[] {
  return resolvePracticeAnswerLocationsWithResolver(answer, card, createCategoryResolver(categories));
}

export function buildShasPracticeProgress(
  results: PracticeResult[],
  cards: Card[],
  categories: Category[],
): ShasMasechtaProgress[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const resolveCategory = createCategoryResolver(categories);
  const buckets = new Map<string, { location: ShasPracticeLocation; attempts: ShasPageAttempt[] }>();

  for (const result of results.filter((item) => item.completed)) {
    const answersByLocation = new Map<string, PracticeResultAnswer[]>();
    for (const answer of result.answers) {
      const locations = resolvePracticeAnswerLocationsWithResolver(answer, answer.cardId ? cardsById.get(answer.cardId) : undefined, resolveCategory);
      for (const location of locations) {
        const key = `${location.masechta}:${location.daf}:${location.amud}`;
        const current = answersByLocation.get(key) ?? [];
        if (!current.some((item) => item.id === answer.id)) current.push(answer);
        answersByLocation.set(key, current);
      }
    }

    for (const [key, answers] of answersByLocation) {
      const [masechta, dafValue, amudValue] = key.split(":");
      const correct = answers.filter((answer) => answer.correct).length;
      const total = answers.length;
      const bucket = buckets.get(key) ?? {
        location: { masechta, daf: Number(dafValue), amud: Number(amudValue) as 1 | 2 },
        attempts: [],
      };
      bucket.attempts.push({ result, correct, total, score: total ? Math.round((correct / total) * 100) : 0 });
      buckets.set(key, bucket);
    }
  }

  const masechtot = new Map<string, Map<number, ShasAmudProgress[]>>();
  for (const { location, attempts } of buckets.values()) {
    attempts.sort((a, b) => b.result.completedAt - a.result.completedAt);
    const dapim = masechtot.get(location.masechta) ?? new Map<number, ShasAmudProgress[]>();
    const amudim = dapim.get(location.daf) ?? [];
    amudim.push({ ...location, attempts });
    dapim.set(location.daf, amudim.sort((a, b) => a.amud - b.amud));
    masechtot.set(location.masechta, dapim);
  }

  return [...masechtot.entries()]
    .sort(([a], [b]) => (masechtaOrder.get(a) ?? 999) - (masechtaOrder.get(b) ?? 999))
    .map(([masechta, dapim]) => ({
      masechta,
      dapim: [...dapim.entries()].sort(([a], [b]) => a - b).map(([daf, amudim]) => ({ daf, amudim })),
    }));
}

export function summarizePageAttempts(attempts: ShasPageAttempt[]) {
  const total = attempts.reduce((sum, attempt) => sum + attempt.total, 0);
  const correct = attempts.reduce((sum, attempt) => sum + attempt.correct, 0);
  const average = total ? Math.round((correct / total) * 100) : 0;
  const ordered = [...attempts].sort((a, b) => b.result.completedAt - a.result.completedAt);
  const delta = ordered.length >= 2 ? ordered[0].score - ordered[1].score : null;
  const trend = delta == null ? "נדרש ניסיון נוסף" : Math.abs(delta) < 5 ? "יציב" : delta > 0 ? "שיפור" : "נסיגה";
  return { attempts: attempts.length, correct, total, average, delta, trend };
}
