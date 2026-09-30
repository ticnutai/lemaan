// Cloud sync via Supabase: the whole local DB is snapshotted, gzipped and
// upserted into public.lemaan_sync, addressed by an unguessable sync code.
// Enter the same code on another device to pull the snapshot there.
import { db, setSetting } from "./index";

const SUPABASE_URL = "https://insvegfuiketekxncsgq.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imluc3ZlZ2Z1aWtldGVreG5jc2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3OTI1NzEsImV4cCI6MjEwNjM2ODU3MX0.wZiIIxrZnVTt0zMEYZhMIkqkNjwDIaEoW-fP2Taw4do";
const ENDPOINT = `${SUPABASE_URL}/rest/v1/lemaan_sync`;

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

export async function getSyncCode(): Promise<string> {
  const existing = (await db.settings.get("sync-code"))?.value as string | undefined;
  if (existing) return existing;
  const code = crypto.randomUUID();
  await setSetting("sync-code", code);
  return code;
}

export async function setSyncCode(code: string): Promise<void> {
  await setSetting("sync-code", code.trim());
}

async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function gunzipBase64(b64: string): Promise<string> {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

export async function pushSnapshot(): Promise<{ sizeKb: number }> {
  const code = await getSyncCode();
  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: await db.cards.toArray(),
    categories: await db.categories.toArray(),
    decks: await db.decks.toArray(),
    reviewLogs: await db.reviewLogs.toArray(),
    goals: await db.goals.toArray(),
    settings: (await db.settings.toArray()).filter((s) => s.key !== "sync-code"),
  };
  const payload = await gzipBase64(JSON.stringify(snapshot));
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ sync_code: code, payload, device: navigator.platform, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`הסנכרון נכשל (${res.status}): ${await res.text()}`);
  return { sizeKb: Math.round(payload.length / 1024) };
}

export async function pullSnapshot(code?: string): Promise<{ updatedAt: string }> {
  const syncCode = code?.trim() || (await getSyncCode());
  const res = await fetch(`${ENDPOINT}?sync_code=eq.${syncCode}&select=payload,updated_at`, { headers: HEADERS });
  if (!res.ok) throw new Error(`המשיכה נכשלה (${res.status})`);
  const rows: { payload: string; updated_at: string }[] = await res.json();
  if (!rows.length) throw new Error("לא נמצא גיבוי בענן עבור קוד הסנכרון הזה");

  const snapshot = JSON.parse(await gunzipBase64(rows[0].payload));
  if (!snapshot.cards || !snapshot.categories) throw new Error("גיבוי ענן לא תקין");
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.cards.bulkPut(snapshot.cards);
    await db.categories.bulkPut(snapshot.categories);
    if (snapshot.decks?.length) await db.decks.bulkPut(snapshot.decks);
    if (snapshot.reviewLogs?.length) {
      await db.reviewLogs.bulkPut(snapshot.reviewLogs.map((l: { id?: number }) => { const { id: _id, ...rest } = l; return rest; }));
    }
    if (snapshot.goals?.length) await db.goals.bulkPut(snapshot.goals);
    if (snapshot.settings?.length) await db.settings.bulkPut(snapshot.settings);
  });
  if (code?.trim()) await setSetting("sync-code", code.trim());
  return { updatedAt: rows[0].updated_at };
}
