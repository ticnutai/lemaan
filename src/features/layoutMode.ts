// הפריסה של עמוד הבית ושל לשונית התרגול: "הנוכחית" (של האתר הזה) או "המקורית" (אחד לאחד כמו באתר
// הבסיסי — src/classic). נשמר בטבלת ההגדרות, ולכן נשאר בין כניסות ועובר בגיבוי לענן.
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting } from "../db";

export type LayoutMode = "modern" | "classic";
const KEY = "ui-layout";

/** undefined — עוד נטען (כדי לא להבהב פריסה אחת לפני השנייה). */
export function useLayoutMode(): LayoutMode | undefined {
  return useLiveQuery(async () => ((await db.settings.get(KEY))?.value === "classic" ? "classic" : "modern"), []);
}

export const saveLayoutMode = (mode: LayoutMode) => setSetting(KEY, mode);
