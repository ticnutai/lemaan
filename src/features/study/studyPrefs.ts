// העדפות התרגול: שאלות נעוצות, מקומות נעוצים (מסכת/דף), גופן ומצב "מיידי".
// הכל בטבלת ההגדרות הקיימת — נשמר בין כניסות ונכלל בגיבוי לענן.
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting } from "../../db";

const PINNED_CARDS = "study-pinned-cards";
const PINNED_PLACES = "study-pinned-places";
const INSTANT = "study-instant";
const FONT = "study-font";

export interface PinnedPlace {
  masechta: string;
  daf?: number;
}

function parse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const read = async <T,>(key: string, fallback: T): Promise<T> => parse((await db.settings.get(key))?.value, fallback);

// ---------- שאלות נעוצות ----------
export function usePinnedCardIds(): Set<string> | undefined {
  const ids = useLiveQuery(() => read<string[]>(PINNED_CARDS, []), []);
  return ids ? new Set(ids) : undefined;
}

export async function togglePinnedCard(id: string): Promise<boolean> {
  const ids = await read<string[]>(PINNED_CARDS, []);
  const pinned = !ids.includes(id);
  await setSetting(PINNED_CARDS, JSON.stringify(pinned ? [...ids, id] : ids.filter((x) => x !== id)));
  return pinned;
}

// ---------- מקומות נעוצים ----------
const samePlace = (a: PinnedPlace, b: PinnedPlace) => a.masechta === b.masechta && (a.daf ?? null) === (b.daf ?? null);

export function usePinnedPlaces(): PinnedPlace[] | undefined {
  return useLiveQuery(() => read<PinnedPlace[]>(PINNED_PLACES, []), []);
}

export const isPlacePinned = (places: PinnedPlace[] | undefined, p: PinnedPlace) => !!places?.some((x) => samePlace(x, p));

export async function togglePinnedPlace(p: PinnedPlace): Promise<void> {
  const places = await read<PinnedPlace[]>(PINNED_PLACES, []);
  const next = places.some((x) => samePlace(x, p)) ? places.filter((x) => !samePlace(x, p)) : [...places, p];
  await setSetting(PINNED_PLACES, JSON.stringify(next));
}

// ---------- העדפות סרגל הכלים ----------
export function useStudyToolbarPrefs(): { instant: boolean; fontScale: number } | undefined {
  return useLiveQuery(async () => {
    const [i, f] = await Promise.all([db.settings.get(INSTANT), db.settings.get(FONT)]);
    const font = parseFloat(f?.value ?? "1");
    return { instant: i?.value !== "0", fontScale: Number.isFinite(font) ? font : 1 };
  }, []);
}

export const saveInstant = (v: boolean) => setSetting(INSTANT, v ? "1" : "0");
export const saveFontScale = (v: number) => setSetting(FONT, String(v));
