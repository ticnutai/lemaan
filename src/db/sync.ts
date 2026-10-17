// סנכרון בין מכשירים — מדורג ומאובטח.
//
// במקום להעלות את כל המסד (כ־30 מגה, כולל 23 אלף שאלות המאגר שזהות אצל כולם) ולדרוס הכל במשיכה,
// נשלחים רק הפריטים האישיים שהשתנו: התקדמות בשאלה, תשובה ביומן, שאלה שהוספת, הגדרה, תוכנית...
// כל פריט נשמר בענן בשורה משלו עם זמן השינוי שלו, ומי שחדש יותר מנצח — כך שני מכשירים מתמזגים
// בלי לאבד מידע. הגישה לענן רק דרך פונקציות שבודקות הרשאה (supabase/migrations/…_lemaan_secure_sync.sql).
//
// מעקב השינויים: "ווים" על טבלאות המסד רושמים כל כתיבה (גם מהפריסה המקורית). כתיבות של תוכן משותף
// (ייבוא המאגר, חבילות, שאלות מאושרות, מיון עמודים) מסומנות כ"לא לסנכרון" — ראו runWithoutSync.
import Dexie from "dexie";
import { db, setSetting } from "./index";
import { supabase } from "./supabase";
import { reloadCards } from "./cardsStore";
import type { Card } from "../features/study/types";

// ───────────── הקוד והפעלה ─────────────
export async function getSyncCode(): Promise<string> {
  // מחובר לחשבון? מזהה המשתמש הוא קוד הסנכרון — אותו חשבון בכל מכשיר מגיע לאותם נתונים
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id) return data.session.user.id;
  const existing = (await db.settings.get("sync-code"))?.value;
  if (existing) return existing;
  const code = crypto.randomUUID();
  await setSetting("sync-code", code);
  return code;
}

/** האם הסנכרון פעיל במכשיר הזה (מחובר לחשבון, או שכבר הופעל עם קוד). */
async function syncEnabled(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id) return true;
  return (await db.settings.get("sync-enabled"))?.value === "1";
}

// ───────────── מה מסונכרן ─────────────
/** הגדרות שהן של המכשיר בלבד (מצב פנימי, סמנים, מיקום חלון) — לא עוברות למכשיר אחר. */
const LOCAL_SETTINGS = new Set([
  "sync-code", "sync-enabled", "sync-cursor", "sync-seeded", "library-import-done", "shas-import-done",
  "amud-sort-pending", "amud-sort-pull-at", "amud-backfill-done", "masechta-alias-fix", "shared-pull-at",
  "storage-persisted", "visible-tabs-cache", "shas-nav-window",
]);
const isLocalSetting = (key: string) => LOCAL_SETTINGS.has(key) || key.startsWith("pack:") || key.startsWith("sync-legacy");

/** שדות תוכן בשאלה (שינוי בהם = השאלה עצמה נשלחת). שדות ההתקדמות נשלחים בנפרד ובקטן. */
const CARD_CONTENT = new Set([
  "question", "answer", "options", "correctIndices", "correct", "type", "categoryId", "deckIds", "tags", "masechta", "daf", "explanation",
]);

type Kind = "card" | "progress" | "category" | "deck" | "goal" | "plan" | "shas" | "shaslog" | "log" | "setting";
const keyOf = (kind: Kind, id: string) => `${kind}:${id}`;
const logId = (l: { cardId: string; at: number }) => `${l.cardId}:${l.at}`;

// ───────────── מעקב שינויים ─────────────
const NO_SYNC = "__noSync";
/** כתיבה של תוכן משותף (לא אישי) — לא תסומן לסנכרון. כל הכתיבות בתוך fn חייבות להיות בעסקה הזו. */
export function runWithoutSync<T>(tables: Dexie.Table<any, any>[], fn: () => Promise<T>): Promise<T> {
  return db.transaction("rw", tables, (tx) => {
    (tx as unknown as Record<string, boolean>)[NO_SYNC] = true;
    return fn();
  });
}
/** סימון עסקה קיימת כתוכן משותף (ייבוא המאגר, חבילות). */
export const markNoSync = (tx: unknown) => { (tx as Record<string, boolean>)[NO_SYNC] = true; };
const skip = (tx: unknown) => !!(tx as Record<string, boolean> | undefined)?.[NO_SYNC];

const queued = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function mark(kind: Kind, id: string) {
  queued.set(keyOf(kind, id), Date.now());
  // הרישום נעשה מחוץ לעסקה של הכתיבה (הווים רצים בתוכה)
  if (!flushTimer) flushTimer = setTimeout(flushQueued, 0);
}
async function flushQueued() {
  flushTimer = null;
  if (!queued.size) return;
  const rows = [...queued].map(([key, changedAt]) => ({ key, changedAt, pending: 1 as const }));
  queued.clear();
  await db.syncItems.bulkPut(rows).catch(() => rows.forEach((r) => queued.set(r.key, r.changedAt)));
  scheduleSync();
}

function watch<T, K>(table: Dexie.Table<T, K>, onWrite: (obj: T, mods: Record<string, unknown> | null, kind: "c" | "u" | "d") => [Kind, string] | null) {
  // המעקב לעולם לא מפיל כתיבה: פריט חסר או שגיאה — פשוט לא נרשם
  const safe = (obj: T | undefined, mods: Record<string, unknown> | null, kind: "c" | "u" | "d") => {
    if (!obj) return null;
    try { return onWrite(obj, mods, kind); } catch { return null; }
  };
  table.hook("creating", function (_k, obj, tx) {
    if (skip(tx)) return;
    this.onsuccess = () => { const r = safe(obj, null, "c"); if (r) mark(...r); };
  });
  table.hook("updating", function (mods, _k, obj, tx) {
    if (skip(tx)) return;
    const r = safe(obj as T, mods as Record<string, unknown>, "u");
    if (r) this.onsuccess = () => mark(...r);
  });
  table.hook("deleting", function (_k, obj, tx) {
    if (skip(tx)) return;
    const r = safe(obj, null, "d"); // לפני המחיקה, כשהפריט עוד קיים
    if (r) this.onsuccess = () => mark(...r);
  });
}

let watching = false;
function startWatching() {
  if (watching) return;
  watching = true;
  // שאלה: התקדמות לבד (קטן), תוכן — רק כשהתוכן השתנה. שינוי עמוד בלבד — מסונכרן במיון המשותף.
  db.cards.hook("creating", function (_k, obj, tx) {
    if (skip(tx) || obj.id.startsWith("shared-")) return; // שאלה משותפת מאושרת — לא אישית
    this.onsuccess = () => mark("card", obj.id);
  });
  db.cards.hook("updating", function (mods, key, _obj, tx) {
    if (skip(tx)) return;
    const keys = Object.keys(mods);
    const progress = keys.some((k) => k === "srs" || k.startsWith("srs.") || k === "stats" || k.startsWith("stats."));
    const content = keys.some((k) => CARD_CONTENT.has(k.split(".")[0]));
    if (!progress && !content) return;
    this.onsuccess = () => {
      if (progress) mark("progress", String(key));
      if (content) mark("card", String(key));
    };
  });
  db.cards.hook("deleting", function (key, _obj, tx) {
    if (skip(tx)) return;
    this.onsuccess = () => mark("card", String(key));
  });
  watch(db.categories, (c) => ["category", c.id]);
  watch(db.decks, (d) => ["deck", d.id]);
  watch(db.goals, (g) => ["goal", g.id]);
  watch(db.studyPlans, (p) => ["plan", p.id]);
  watch(db.shasProgress, (s) => ["shas", s.key]);
  watch(db.shasLog, (l) => ["shaslog", String(l.at)]);
  watch(db.reviewLogs, (l) => ["log", logId(l)]);
  watch(db.settings, (s) => (isLocalSetting(s.key) ? null : ["setting", s.key]));
}
startWatching();

// ───────────── קריאה וכתיבה של פריט לפי מפתח ─────────────
async function readItem(kind: Kind, id: string): Promise<unknown | undefined> {
  switch (kind) {
    case "card": return db.cards.get(id);
    case "progress": {
      const c = await db.cards.get(id);
      return c ? { srs: c.srs, stats: c.stats } : undefined;
    }
    case "category": return db.categories.get(id);
    case "deck": return db.decks.get(id);
    case "goal": return db.goals.get(id);
    case "plan": return db.studyPlans.get(id);
    case "shas": return db.shasProgress.get(id);
    case "shaslog": {
      const l = await db.shasLog.where("at").equals(Number(id)).first();
      if (!l) return undefined;
      const { id: _drop, ...rest } = l;
      return rest;
    }
    case "log": {
      const [cardId, at] = [id.slice(0, id.lastIndexOf(":")), Number(id.slice(id.lastIndexOf(":") + 1))];
      const l = await db.reviewLogs.where("at").equals(at).filter((x) => x.cardId === cardId).first();
      if (!l) return undefined;
      const { id: _drop, ...rest } = l;
      return rest;
    }
    case "setting": return db.settings.get(id);
  }
}

async function writeItem(kind: Kind, id: string, data: unknown, deleted: boolean) {
  const d = data as never;
  switch (kind) {
    case "card": return deleted ? db.cards.delete(id) : db.cards.put(d);
    case "progress": {
      if (deleted) return;
      const p = data as Pick<Card, "srs" | "stats">;
      return db.cards.update(id, { srs: p.srs, stats: p.stats });
    }
    case "category": return deleted ? db.categories.delete(id) : db.categories.put(d);
    case "deck": return deleted ? db.decks.delete(id) : db.decks.put(d);
    case "goal": return deleted ? db.goals.delete(id) : db.goals.put(d);
    case "plan": return deleted ? db.studyPlans.delete(id) : db.studyPlans.put(d);
    case "shas": return deleted ? db.shasProgress.delete(id) : db.shasProgress.put(d);
    case "shaslog": {
      const existing = await db.shasLog.where("at").equals(Number(id)).primaryKeys();
      if (deleted) return db.shasLog.bulkDelete(existing);
      if (!existing.length) await db.shasLog.add(d);
      return;
    }
    case "log": {
      const [cardId, at] = [id.slice(0, id.lastIndexOf(":")), Number(id.slice(id.lastIndexOf(":") + 1))];
      const existing = await db.reviewLogs.where("at").equals(at).filter((x) => x.cardId === cardId).primaryKeys();
      if (deleted) return db.reviewLogs.bulkDelete(existing);
      if (!existing.length) await db.reviewLogs.add(d);
      return;
    }
    case "setting": return deleted ? db.settings.delete(id) : db.settings.put(d);
  }
}

// ───────────── שליחה ומשיכה ─────────────
async function push(code: string): Promise<number> {
  let sent = 0;
  for (;;) {
    const batch = await db.syncItems.where("pending").equals(1).limit(500).toArray();
    if (!batch.length) return sent;
    const items = [];
    for (const it of batch) {
      const i = it.key.indexOf(":");
      const kind = it.key.slice(0, i) as Kind;
      const id = it.key.slice(i + 1);
      const data = await readItem(kind, id);
      items.push({ kind, item_id: id, data: data ?? null, deleted: data === undefined, changed_at: it.changedAt });
    }
    const { error } = await supabase.rpc("lemaan_sync_push", { p_code: code, p_items: items });
    if (error) throw new Error(error.message);
    // רק מה שלא השתנה שוב בזמן השליחה מסומן כנשלח
    await db.transaction("rw", db.syncItems, async () => {
      for (const it of batch) {
        const cur = await db.syncItems.get(it.key);
        if (cur && cur.changedAt === it.changedAt) await db.syncItems.update(it.key, { pending: 0 });
      }
    });
    sent += batch.length;
    if (batch.length < 500) return sent;
  }
}

async function pull(code: string): Promise<number> {
  let applied = 0;
  let cursor = (await db.settings.get("sync-cursor"))?.value ?? null;
  for (;;) {
    const { data, error } = await supabase.rpc("lemaan_sync_pull", { p_code: code, p_since: cursor });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { kind: Kind; item_id: string; data: unknown; deleted: boolean; changed_at: number; updated_at: string }[];
    if (!rows.length) break;
    const tables = [db.cards, db.categories, db.decks, db.goals, db.studyPlans, db.shasProgress, db.shasLog, db.reviewLogs, db.settings, db.syncItems];
    await runWithoutSync(tables, async () => {
      for (const r of rows) {
        const key = keyOf(r.kind, r.item_id);
        const local = await db.syncItems.get(key);
        if (local && local.changedAt >= r.changed_at) continue; // השינוי המקומי חדש יותר
        await writeItem(r.kind, r.item_id, r.data, r.deleted);
        await db.syncItems.put({ key, changedAt: r.changed_at, pending: 0 });
        applied++;
      }
    });
    cursor = rows[rows.length - 1].updated_at;
    await db.settings.put({ key: "sync-cursor", value: cursor });
    if (rows.length < 2000) break;
  }
  if (applied) void reloadCards();
  return applied;
}

/**
 * פעם ראשונה בשיטה החדשה במכשיר: מסמנים לשליחה את כל המידע האישי שכבר קיים
 * (התקדמות, יומן תשובות, שאלות שהוספת, תוכניות, הגדרות...). מידע של המאגר המשותף לא נשלח.
 */
async function seedOnce() {
  if ((await db.settings.get("sync-seeded"))?.value === "1") return;
  const now = Date.now();
  const rows: { key: string; changedAt: number; pending: 1 }[] = [];
  const add = (kind: Kind, id: string) => rows.push({ key: keyOf(kind, id), changedAt: now, pending: 1 });
  await db.cards.each((c) => {
    if (c.stats?.totalReviews > 0 || c.srs?.lastReviewedAt != null) add("progress", c.id);
    // שאלה שהמשתמש הוסיף: בלי סימון מקור של המאגר, ולא שאלה משותפת מאושרת
    if (!c.id.startsWith("shared-") && !(c.tags ?? []).some((t) => t.startsWith("source:"))) add("card", c.id);
  });
  (await db.decks.toArray()).forEach((d) => add("deck", d.id));
  (await db.goals.toArray()).forEach((g) => add("goal", g.id));
  (await db.studyPlans.toArray()).forEach((p) => add("plan", p.id));
  (await db.shasProgress.toArray()).forEach((s) => add("shas", s.key));
  (await db.shasLog.toArray()).forEach((l) => add("shaslog", String(l.at)));
  (await db.reviewLogs.toArray()).forEach((l) => add("log", logId(l)));
  (await db.settings.toArray()).forEach((s) => { if (!isLocalSetting(s.key)) add("setting", s.key); });
  for (let i = 0; i < rows.length; i += 2000) await db.syncItems.bulkPut(rows.slice(i, i + 2000));
  await db.settings.put({ key: "sync-seeded", value: "1" });
}

/**
 * גיבוי מהשיטה הישנה (גיבוי מלא אחד) לקוד הזה — ממוזג פעם אחת, בלי למחוק כלום במכשיר:
 * מוסיפים מה שחסר, ומעדכנים התקדמות רק כשבגיבוי היא חדשה יותר.
 */
async function mergeLegacyOnce(code: string) {
  const flag = `sync-legacy:${code}`;
  if ((await db.settings.get(flag))?.value) return;
  const { data, error } = await supabase.rpc("lemaan_sync_legacy_pull", { p_code: code });
  if (error) return; // ננסה שוב בפעם הבאה
  const row = (data as { payload: string }[] | null)?.[0];
  if (row?.payload) {
    const bytes = Uint8Array.from(atob(row.payload), (c) => c.charCodeAt(0));
    const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    const snap = JSON.parse(text) as Record<string, unknown[]>;
    // המיזוג הוא שינוי אישי — נרשם לסנכרון החדש (לא בתוך runWithoutSync)
    await db.transaction("rw", [db.cards, db.decks, db.goals, db.studyPlans, db.shasProgress, db.shasLog, db.reviewLogs, db.settings], async () => {
      for (const c of (snap.cards ?? []) as Card[]) {
        const local = await db.cards.get(c.id);
        if (!local) await db.cards.put(c);
        else if ((c.srs?.lastReviewedAt ?? 0) > (local.srs?.lastReviewedAt ?? 0)) await db.cards.update(c.id, { srs: c.srs, stats: c.stats });
      }
      const putMissing = async <T, K>(table: Dexie.Table<T, K>, items: unknown[] | undefined, keyName: string) => {
        for (const it of (items ?? []) as T[]) {
          const k = (it as Record<string, unknown>)[keyName];
          if (k != null && !(await table.get(k as never))) await table.put(it);
        }
      };
      await putMissing(db.decks, snap.decks, "id");
      await putMissing(db.goals, snap.goals, "id");
      await putMissing(db.studyPlans, snap.studyPlans, "id");
      await putMissing(db.shasProgress, snap.shasProgress, "key");
      for (const s of (snap.settings ?? []) as { key: string; value: string }[]) {
        if (!isLocalSetting(s.key) && !(await db.settings.get(s.key))) await db.settings.put(s);
      }
      for (const l of (snap.reviewLogs ?? []) as { cardId: string; at: number }[]) {
        const exists = await db.reviewLogs.where("at").equals(l.at).filter((x) => x.cardId === l.cardId).count();
        if (!exists) { const { id: _d, ...rest } = l as { id?: number; cardId: string; at: number }; await db.reviewLogs.add(rest as never); }
      }
      for (const l of (snap.shasLog ?? []) as { at: number }[]) {
        if (!(await db.shasLog.where("at").equals(l.at).count())) { const { id: _d, ...rest } = l as { id?: number; at: number }; await db.shasLog.add(rest as never); }
      }
    });
    void reloadCards();
  }
  await db.settings.put({ key: flag, value: "1" });
}

// ───────────── סנכרון ─────────────
let running: Promise<SyncResult> | null = null;
export interface SyncResult { sent: number; received: number }
type Status = { state: "idle" | "syncing" | "error" | "off"; at?: number; message?: string };
let status: Status = { state: "off" };
const statusListeners = new Set<(s: Status) => void>();
const setStatus = (s: Status) => { status = s; statusListeners.forEach((l) => l(s)); };
export const onSyncStatus = (l: (s: Status) => void) => { statusListeners.add(l); l(status); return () => { statusListeners.delete(l); }; };

/** סנכרון מלא עכשיו: משיכה ואז שליחה. */
export function syncNow(): Promise<SyncResult> {
  running ??= (async () => {
    setStatus({ state: "syncing" });
    try {
      await flushQueued();
      const code = await getSyncCode();
      await db.settings.put({ key: "sync-enabled", value: "1" });
      await seedOnce();
      await mergeLegacyOnce(code);
      const received = await pull(code);
      const sent = await push(code);
      setStatus({ state: "idle", at: Date.now() });
      return { sent, received };
    } catch (e) {
      setStatus({ state: "error", at: Date.now(), message: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** חיבור המכשיר הזה לקוד ממכשיר אחר — ממזג את הנתונים של שניהם (לא מוחק כלום). */
export async function connectToCode(code: string): Promise<SyncResult> {
  const clean = code.trim();
  if (clean.length < 32) throw new Error("קוד הסנכרון לא תקין");
  await setSetting("sync-code", clean);
  await db.settings.delete("sync-cursor"); // משיכה מההתחלה מהקוד החדש
  return syncNow();
}

let autoTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSync(delay = 4000) {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(async () => {
    autoTimer = null;
    if (await syncEnabled()) void syncNow().catch(() => {});
  }, delay);
}

/** סנכרון אוטומטי: בפתיחה, אחרי שינויים (אחרי 4 שניות שקט), כל 2 דקות, ובחזרה לחלון. */
let autoStarted = false;
export function startAutoSync() {
  if (autoStarted) return;
  autoStarted = true;
  void syncEnabled().then((on) => (on ? syncNow().catch(() => {}) : setStatus({ state: "off" })));
  setInterval(() => scheduleSync(0), 120_000);
  document.addEventListener("visibilitychange", () => scheduleSync(document.hidden ? 0 : 500));
}
