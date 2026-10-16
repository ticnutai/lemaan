// תצוגת רשימת שאלות פתוחות (שאינן אמריקאיות): "רשימה נפתחת" או "כרטיסים מתהפכים".
// נשמר בטבלת ההגדרות — משותף לשתי הפריסות, נשאר בין כניסות ועובר בגיבוי לענן.
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting } from "../../db";

export type OpenQuestionView = "list" | "flip";
const KEY = "open-question-view";

export function useOpenQuestionView(): OpenQuestionView {
  return useLiveQuery(async () => ((await db.settings.get(KEY))?.value === "flip" ? "flip" : "list"), []) ?? "list";
}

export const saveOpenQuestionView = (v: OpenQuestionView) => setSetting(KEY, v);
