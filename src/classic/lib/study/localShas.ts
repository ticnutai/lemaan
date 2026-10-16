// שכבת ש"ס מקומי — ברירת המחדל של האפליקציה.
// הנתונים: public/shas/{Slug}.json.gz — קובץ דחוס אחד לכל מסכת.
// כל עמוד: { gemara: string[], commentaries: [{key,he,en,segments[]}], ... }
//
// סדר נסיונות טעינה:
//   1. fetch יחסי (BASE_URL) — עובד ב-dev, באתר (web), וב-PWA.
//   2. פרוטוקול shas://local/ — עובד באלקטרון (file://), מוגש מה-main process.
//   3. null — הקורא יחליט אם ליפול ל-Sefaria אונליין.

export interface LocalCommentary {
  key: string; // rashi | tosafot | rashbam | ran | ri_migash | rabbeinu_gershom | ramban | rashba | ritva | yad_ramah
  he: string;
  en: string;
  segments: string[];
}

export interface LocalAmud {
  id: string;
  seder: string;
  seder_full: string;
  masechet: string;
  masechet_en: string;
  daf: string;
  daf_number: number;
  amud: string; // א | ב
  amud_en: "a" | "b";
  sefaria_ref: string;
  gemara: string[];
  commentaries: LocalCommentary[];
  available_commentaries: string[];
  segment_counts: Record<string, number>;
  source: string;
}

export interface LocalShasIndex {
  schema_version: number;
  totals: { amudim: number };
  masechtot: Array<{
    key: number;
    he: string;
    en: string;
    slug: string;
    seder_he: string;
    daf_count: number;
    amud_count: number;
    commentaries: Array<{ key: string; he: string; en: string }>;
    dafim: Array<{ n: number; he: string; amudim: string[] }>;
  }>;
}

const isElectron =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");

const amudCache = new Map<string, LocalAmud | null>();
const masechetCache = new Map<string, Promise<Record<string, LocalAmud> | null>>();
let indexCache: LocalShasIndex | null | undefined;

async function tryFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function tryFetchGzipJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isStillGzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;

    // Some web servers transparently decode files ending in .gz while the
    // Electron protocol returns their original bytes. Detect the gzip magic
    // header so the same loader works reliably in both environments.
    if (!isStillGzipped) {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    }
    if (typeof DecompressionStream === "undefined") return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return (await new Response(stream).json()) as T;
  } catch {
    return null;
  }
}

/** נתיב יחסי לקובץ בתוך shas/ לפי סביבת הריצה. */
function candidates(rel: string): string[] {
  const base = (import.meta.env.BASE_URL ?? "/") as string;
  const normalBase = base.endsWith("/") ? base : base + "/";
  const list: string[] = [];
  if (isElectron) list.push(`shas://local/${rel}`);
  list.push(`${normalBase}shas/${rel}`);
  return list;
}

/**
 * טוען עמוד מהמאגר המקומי. מחזיר null אם לא קיים מקומית.
 * slug: כפי שמחזיר masechtaSlug() — למשל "Bava_Kamma".
 */
export async function fetchLocalAmud(
  slug: string,
  daf: number,
  amud: "a" | "b",
): Promise<LocalAmud | null> {
  const rel = `${slug}/${daf}${amud}.json`;
  if (amudCache.has(rel)) return amudCache.get(rel)!;

  let masechetPromise = masechetCache.get(slug);
  if (!masechetPromise) {
    masechetPromise = (async () => {
      for (const url of candidates(`${slug}.json.gz`)) {
        const packed = await tryFetchGzipJson<{
          schema_version: number;
          slug: string;
          amudim: Record<string, LocalAmud>;
        }>(url);
        if (packed?.amudim) return packed.amudim;
      }
      return null;
    })();
    masechetCache.set(slug, masechetPromise);
  }

  const masechet = await masechetPromise;
  let result = masechet?.[`${daf}${amud}`] ?? null;

  // Backward compatibility for development folders or an older deployment.
  if (!result) {
    for (const url of candidates(rel)) {
      result = await tryFetchJson<LocalAmud>(url);
      if (result) break;
    }
  }
  amudCache.set(rel, result);
  return result;
}

/** אינדקס הניווט המקומי (או null אם המאגר לא מותקן). */
export async function fetchLocalShasIndex(): Promise<LocalShasIndex | null> {
  if (indexCache !== undefined) return indexCache;
  let result: LocalShasIndex | null = null;
  for (const url of candidates("index.json")) {
    result = await tryFetchJson<LocalShasIndex>(url);
    if (result) break;
  }
  indexCache = result;
  return result;
}

/** ניקוי תגיות HTML מקטע טקסט. */
export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

/** האם ref של ספריא הוא עמוד גמרא בבלי, למשל "Berakhot.2a" או "Bava Kamma 15b". */
export function parseBavliRef(
  ref: string,
): { slug: string; daf: number; amud: "a" | "b" } | null {
  const m = ref.trim().match(/^([A-Za-z_ ']+?)[ .](\d{1,3})([ab])$/);
  if (!m) return null;
  return { slug: m[1].trim().replace(/\s+/g, "_"), daf: Number(m[2]), amud: m[3] as "a" | "b" };
}
