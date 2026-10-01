import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { db } from ".";
import type { Card } from "../features/study/types";

/** שני תפקידים בלבד, קבועים בקוד: המיילים האלו = מנהל, כל השאר = לומדים. */
export const ADMIN_EMAILS = ["ticnutai@gmail.com", "jj1212t@gmail.com"];

export const isAdmin = (session: Session | null): boolean =>
  !!session?.user.email && ADMIN_EMAILS.includes(session.user.email);

/** זיהוי הפלטפורמה לדוחות. */
export function detectPlatform(): string {
  const ua = navigator.userAgent;
  if ((window as { __TAURI__?: unknown }).__TAURI__ || ua.includes("Tauri")) return "windows";
  if (ua.includes("Android") && (window as { Capacitor?: unknown }).Capacitor) return "android";
  return "web";
}

/** רישום נוכחות: פרופיל + אירוע שימוש, פעם אחת לכל טעינת אפליקציה. */
let usageLogged = false;
export async function logAppOpen(session: Session): Promise<void> {
  if (usageLogged) return;
  usageLogged = true;
  const platform = detectPlatform();
  const base = { user_id: session.user.id, email: session.user.email ?? null, platform };
  try {
    await supabase.from("lemaan_profiles").upsert(
      { ...base, display_name: session.user.user_metadata?.full_name ?? null, last_seen_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    await supabase.from("lemaan_usage").insert({ ...base, kind: "open" });
  } catch {
    // אופליין — לא קריטי
  }
}

/** שליחת הערה על שאלה (דורש חשבון). */
export async function sendQuestionNote(session: Session, card: Card, note: string): Promise<void> {
  const { error } = await supabase.from("lemaan_notes").insert({
    user_id: session.user.id,
    email: session.user.email ?? null,
    card_id: card.id,
    question: card.question.slice(0, 300),
    note,
  });
  if (error) throw error;
}

/** הצעת שאלה לספרייה המרכזית (נשארת פרטית עד אישור מנהל). */
export async function suggestToLibrary(session: Session, card: Card): Promise<void> {
  const { error } = await supabase.from("lemaan_shared_questions").insert({
    user_id: session.user.id,
    email: session.user.email ?? null,
    card: {
      id: card.id, type: card.type, question: card.question, answer: card.answer,
      options: card.options, correctIndices: card.correctIndices,
      masechta: card.masechta, daf: card.daf, amud: card.amud, tags: card.tags,
    },
  });
  if (error) throw error;
}

/** משיכת שאלות מאושרות מהספרייה המשותפת אל המאגר המקומי (לכל המשתמשים). */
export async function pullApprovedQuestions(): Promise<number> {
  const lastPull = (await db.settings.get("shared-pull-at"))?.value ?? "1970-01-01";
  const { data, error } = await supabase
    .from("lemaan_shared_questions")
    .select("id, card, approved_at")
    .eq("status", "approved")
    .gt("approved_at", lastPull)
    .order("approved_at", { ascending: true })
    .limit(500);
  if (error || !data?.length) return 0;
  let added = 0;
  const now = Date.now();
  for (const row of data) {
    const c = row.card as Partial<Card> & { question?: string };
    if (!c?.question) continue;
    const id = `shared-${row.id}`;
    if (await db.cards.get(id)) continue;
    await db.cards.put({
      id,
      type: (c.type as Card["type"]) ?? "flashcard",
      question: c.question,
      answer: c.answer ?? "",
      options: c.options ?? [],
      correctIndices: c.correctIndices ?? [],
      correct: null,
      categoryId: null,
      deckIds: [],
      tags: c.tags ?? [],
      masechta: c.masechta ?? null,
      daf: c.daf ?? null,
      amud: c.amud ?? null,
      createdAt: now,
      updatedAt: now,
      srs: { ease: 2.5, interval: 0, repetitions: 0, dueAt: now, lastReviewedAt: null, stability: 0, difficulty: 5, lapses: 0 },
      stats: { totalReviews: 0, correct: 0, incorrect: 0 },
    });
    added++;
  }
  const latest = data[data.length - 1].approved_at as string;
  await db.settings.put({ key: "shared-pull-at", value: latest });
  return added;
}
