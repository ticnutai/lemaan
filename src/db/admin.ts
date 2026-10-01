import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { db } from ".";
import type { Card } from "../features/study/types";

/** חשבונות המייסד — תמיד מנהלים, מוגנים גם בשרת; שאר המנהלים מנוהלים מהממשק. */
export const FOUNDER_EMAILS = ["ticnutai@gmail.com", "jj1212t@gmail.com"];

export const isFounder = (session: Session | null): boolean =>
  !!session?.user.email && FOUNDER_EMAILS.includes(session.user.email);

/** בדיקת מנהל מלאה מול השרת (כולל מנהלים שמונו מהממשק). */
export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("lemaan_am_i_admin");
  return !error && data === true;
}

export async function listAdmins(): Promise<string[]> {
  const { data } = await supabase.from("lemaan_admins").select("email");
  return (data ?? []).map((r: { email: string }) => r.email);
}

/** מינוי/הסרת מנהל לפי אימייל; חשבונות המייסד אינם ניתנים להסרה (נאכף גם ב-RLS). */
export async function setAdminRole(email: string, makeAdmin: boolean, addedBy: string): Promise<void> {
  if (makeAdmin) {
    const { error } = await supabase.from("lemaan_admins").upsert({ email, added_by: addedBy });
    if (error) throw error;
  } else {
    if (FOUNDER_EMAILS.includes(email)) throw new Error("חשבון מייסד אינו ניתן להסרה");
    const { error } = await supabase.from("lemaan_admins").delete().eq("email", email);
    if (error) throw error;
  }
}

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

/** כל שאלה חדשה נשלחת לשולחן המנהל — הוא מחליט לאן היא נכנסת. */
export async function submitToReview(session: Session, card: Card): Promise<void> {
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
  const { data: auth } = await supabase.auth.getSession();
  const myId = auth.session?.user.id;
  const { data, error } = await supabase
    .from("lemaan_shared_questions")
    .select("id, user_id, card, approved_at")
    .eq("status", "approved")
    .gt("approved_at", lastPull)
    .order("approved_at", { ascending: true })
    .limit(500);
  if (error || !data?.length) return 0;
  let added = 0;
  const now = Date.now();
  for (const row of data) {
    if (row.user_id === myId) continue; // ליוצר כבר יש את המקור המקומי
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

/** פעולות ניהול משתמשים דרך פונקציית הענן (יצירה/עדכון/מחיקה + קביעת סיסמה). */
export async function adminUserAction(payload: {
  action: "create" | "update" | "delete";
  userId?: string;
  email?: string;
  password?: string;
  name?: string;
}): Promise<{ ok?: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: payload });
  if (error) {
    // supabase-js עוטף שגיאות HTTP — מנסה לחלץ את ההודעה מהגוף
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) return (await ctx.json()) as { error: string };
    } catch { /* נפילה להודעה כללית */ }
    return { error: error.message };
  }
  return data as { ok?: boolean; id?: string; error?: string };
}

/** הטאבים שאפשר להסתיר מלומדים (בית תמיד מוצג; ניהול ממילא למנהלים). */
export const TOGGLABLE_TABS: { to: string; label: string }[] = [
  { to: "/study", label: "תרגול" },
  { to: "/calendar", label: "חזרות" },
  { to: "/quiz", label: "בניית מבחנים" },
  { to: "/shas", label: 'הש"ס' },
  { to: "/shas-board", label: 'לוח הש"ס' },
  { to: "/goals", label: "יעדים" },
  { to: "/questions", label: "בניית שאלות" },
  { to: "/categories", label: "קטגוריות" },
  { to: "/stats", label: "התקדמות" },
  { to: "/settings", label: "הגדרות" },
];

const TABS_KEY = "visible-tabs";

/** שני פרופילי תצוגה ללומדים (מנהל תמיד רואה הכל) + שיוך פר-לומד ופרופיל לאורחים. */
export interface TabsConfig {
  full: string[];
  basic: string[];
  guest: "full" | "basic";
  assignments: Record<string, "full" | "basic">;
}

export const defaultTabsConfig = (): TabsConfig => ({
  full: TOGGLABLE_TABS.map((t) => t.to),
  basic: TOGGLABLE_TABS.map((t) => t.to),
  guest: "full",
  assignments: {},
});

function normalizeTabsConfig(raw: unknown): TabsConfig {
  if (Array.isArray(raw)) return { ...defaultTabsConfig(), full: raw as string[], basic: raw as string[] };
  const o = (raw ?? {}) as Partial<TabsConfig>;
  return {
    full: o.full ?? TOGGLABLE_TABS.map((t) => t.to),
    basic: o.basic ?? TOGGLABLE_TABS.map((t) => t.to),
    guest: o.guest === "basic" ? "basic" : "full",
    assignments: o.assignments ?? {},
  };
}

export async function fetchTabsConfig(): Promise<TabsConfig> {
  try {
    const { data, error } = await supabase.from("lemaan_config").select("value").eq("key", TABS_KEY).maybeSingle();
    if (!error && data?.value) {
      const cfg = normalizeTabsConfig(data.value);
      await db.settings.put({ key: "visible-tabs-cache", value: JSON.stringify(cfg) });
      return cfg;
    }
  } catch { /* אופליין — נופל למטמון */ }
  const cached = (await db.settings.get("visible-tabs-cache"))?.value;
  return cached ? normalizeTabsConfig(JSON.parse(cached)) : defaultTabsConfig();
}

export async function saveTabsConfig(cfg: TabsConfig): Promise<void> {
  const { error } = await supabase.from("lemaan_config").upsert({ key: TABS_KEY, value: cfg, updated_at: new Date().toISOString() });
  if (error) throw error;
  await db.settings.put({ key: "visible-tabs-cache", value: JSON.stringify(cfg) });
}

/** הטאבים שמשתמש נתון רואה לפי התצורה. */
export function tabsForUser(cfg: TabsConfig, email: string | null | undefined): string[] {
  const profile = email ? (cfg.assignments[email] ?? "full") : cfg.guest;
  return profile === "basic" ? cfg.basic : cfg.full;
}
