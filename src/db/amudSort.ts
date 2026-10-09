// מיון שאלות לעמוד א'/ב' — משותף לכל המכשירים.
// כל שינוי נשמר מיד במאגר המקומי, נרשם בתור "ממתינים לשליחה", ונשלח לטבלה המרכזית
// lemaan_card_amud (כתיבה למנהלים בלבד, קריאה לכולם). בכל פתיחה כל מכשיר מושך את
// השינויים החדשים — כך מיון שנעשה במחשב מופיע גם בטלפון ואצל כל הלומדים.
import { supabase } from "./supabase";
import { db, getSetting, setSetting } from ".";

type Amud = "1" | "2" | null;

const PENDING_KEY = "amud-sort-pending";
const PULL_KEY = "amud-sort-pull-at";
const TABLE = "lemaan_card_amud";

async function readPending(): Promise<Record<string, Amud>> {
  try {
    return JSON.parse(await getSetting(PENDING_KEY, "{}")) as Record<string, Amud>;
  } catch {
    return {};
  }
}

/** שיוך שאלות לעמוד (null = ביטול השיוך). מקומי מיד, ואז ניסיון שליחה למרכז. */
export async function setCardsAmud(cardIds: string[], amud: Amud): Promise<void> {
  if (!cardIds.length) return;
  const now = Date.now();
  await db.transaction("rw", db.cards, db.settings, async () => {
    await db.cards.bulkUpdate(cardIds.map((key) => ({ key, changes: { amud, updatedAt: now } })));
    const pending = await readPending();
    for (const id of cardIds) pending[id] = amud;
    await setSetting(PENDING_KEY, JSON.stringify(pending));
  });
  void flushAmudSorts();
}

export type FlushResult = "sent" | "nothing" | "not-admin" | "offline" | "no-table";

/** שליחת כל השינויים הממתינים לטבלה המרכזית. מצליח רק למנהל מחובר. */
let flushing: Promise<FlushResult> | null = null;
export function flushAmudSorts(): Promise<FlushResult> {
  flushing ??= (async (): Promise<FlushResult> => {
    try {
      const pending = await readPending();
      const ids = Object.keys(pending);
      if (!ids.length) return "nothing";
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return "not-admin";
      const rows = ids.map((card_id) => ({
        card_id,
        amud: pending[card_id],
        updated_by: auth.session!.user.email ?? null,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "card_id" });
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return "no-table";
        if (error.code === "42501" || /row-level security/i.test(error.message)) return "not-admin";
        return "offline";
      }
      // מסירים מהתור רק את מה שנשלח (ייתכן שנוספו שינויים בזמן השליחה)
      const after = await readPending();
      for (const id of ids) if (after[id] === pending[id]) delete after[id];
      await setSetting(PENDING_KEY, JSON.stringify(after));
      return "sent";
    } catch {
      return "offline";
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** משיכת שיוכים שנעשו במכשירים אחרים — בכל פתיחת האפליקציה, לכל המשתמשים. */
export async function pullAmudSorts(): Promise<number> {
  try {
    // במכשיר חדש — רק אחרי שהמאגר נטען, אחרת השיוכים יחלפו על פני שאלות שעוד לא קיימות
    if ((await getSetting("library-import-done")) !== "1") return 0;
    const since = await getSetting(PULL_KEY, "1970-01-01T00:00:00Z");
    let applied = 0;
    let cursor = since;
    for (;;) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("card_id, amud, updated_at")
        .gt("updated_at", cursor)
        .order("updated_at", { ascending: true })
        .limit(1000);
      if (error || !data?.length) break;
      const pending = await readPending(); // שינוי מקומי שעוד לא נשלח גובר
      const updates = data
        .filter((r) => !(r.card_id in pending) && (r.amud === "1" || r.amud === "2" || r.amud === null))
        .map((r) => ({ key: r.card_id as string, changes: { amud: r.amud as Amud } }));
      if (updates.length) applied += await db.cards.bulkUpdate(updates);
      cursor = data[data.length - 1].updated_at as string;
      await setSetting(PULL_KEY, cursor);
      if (data.length < 1000) break;
    }
    return applied;
  } catch {
    return 0;
  }
}

/** כמה שינויים עוד לא הגיעו לטבלה המרכזית. */
export async function pendingAmudCount(): Promise<number> {
  return Object.keys(await readPending()).length;
}
