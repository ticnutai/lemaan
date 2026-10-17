// איך מוצגת הגמרא מתחת לשאלות: "צורת הדף" (הדפוס המדויק) או "טקסט" רגיל.
// נשמר בטבלת ההגדרות — משותף לשתי הפריסות ונשאר בין כניסות.
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting } from "../../db";

export type GemaraView = "tzurat" | "text";
const KEY = "gemara-view";

/** undefined — עוד נטען. */
export function useGemaraView(): GemaraView | undefined {
  return useLiveQuery(async () => ((await db.settings.get(KEY))?.value === "text" ? "text" : "tzurat"), []);
}

export const saveGemaraView = (v: GemaraView) => setSetting(KEY, v);
