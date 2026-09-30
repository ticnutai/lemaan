import { db } from "./index";
import { defaultSrs } from "../features/study/srs";
import { uid } from "../lib/utils";
import type { Card, Category } from "../features/study/types";

interface ReportPair {
  key: string;
  question: string;
  answer: string;
}

interface ReportResult {
  file: string;
  masechet: string;
  range_label: string;
  pairs: ReportPair[];
}

interface ShasReport {
  summary: { unique_pairs: number };
  results: ReportResult[];
}

/** Strip fill-in underscore runs and normalize whitespace. */
function cleanText(s: string): string {
  return s
    .replace(/_{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface ImportProgress {
  total: number;
  done: number;
}

/**
 * Import the parsed Shas Q&A dataset (public/data/full_shas_qna_report.json)
 * as flashcards, building a category tree: ש"ס → masechet → range.
 * Idempotent: skips if already imported (marker setting).
 */
export async function importShasDataset(onProgress?: (p: ImportProgress) => void): Promise<number> {
  const marker = await db.settings.get("shas-import-done");
  if (marker?.value === "1") return 0;

  const res = await fetch(`${import.meta.env.BASE_URL}data/full_shas_qna_report.json`);
  if (!res.ok) throw new Error(`טעינת מאגר השאלות נכשלה (${res.status})`);
  const report: ShasReport = await res.json();

  const now = Date.now();
  const rootId = uid();
  const categories: Category[] = [{ id: rootId, name: 'ש"ס', parentId: null, color: "#b8912e", sortOrder: 0 }];
  const masechetIds = new Map<string, string>();
  const cards: Card[] = [];
  const seen = new Set<string>();

  const results = report.results.filter((r) => r.pairs?.length);
  let done = 0;

  for (const result of results) {
    const masechet = result.masechet?.trim() || "לא ידוע";
    let masechetId = masechetIds.get(masechet);
    if (!masechetId) {
      masechetId = uid();
      masechetIds.set(masechet, masechetId);
      categories.push({ id: masechetId, name: masechet, parentId: rootId, color: null, sortOrder: masechetIds.size });
    }

    for (const pair of result.pairs) {
      const question = cleanText(pair.question);
      const answer = cleanText(pair.answer);
      if (!question || !answer) continue;
      const dedupeKey = `${masechet}|${question}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      cards.push({
        id: uid(),
        type: "flashcard",
        question,
        answer,
        options: [],
        correctIndices: [],
        correct: null,
        categoryId: masechetId,
        deckIds: [],
        tags: result.range_label ? [result.range_label] : [],
        masechta: masechet,
        daf: result.range_label || null,
        createdAt: now,
        updatedAt: now,
        srs: defaultSrs(),
        stats: { totalReviews: 0, correct: 0, incorrect: 0 },
      });
    }
    done += 1;
    onProgress?.({ total: results.length, done });
  }

  await db.transaction("rw", db.cards, db.categories, db.settings, async () => {
    await db.categories.bulkPut(categories);
    await db.cards.bulkPut(cards);
    await db.settings.put({ key: "shas-import-done", value: "1" });
  });

  return cards.length;
}
