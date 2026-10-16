// סדר השאלות בכל דף (נקבע בגרירה). נשמר בטבלת ההגדרות של האתר — בין כניסות ובגיבוי לענן.
// מפתח אחד לכל הדפים: { "ברכות:12": [מזהי שאלות לפי הסדר] }.
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../../db";

const KEY = "classic-question-order-v1";
type OrderMap = Record<string, string[]>;

const read = async (): Promise<OrderMap> => {
  try {
    return JSON.parse((await db.settings.get(KEY))?.value ?? "{}") as OrderMap;
  } catch {
    return {};
  }
};

export const orderKey = (masechta: string, daf: number) => `${masechta}:${daf}`;

/** הסדר השמור של דף אחד (מערך ריק — אין סדר שמור). */
export function useQuestionOrder(masechta: string, daf: number): string[] {
  return useLiveQuery(async () => (await read())[orderKey(masechta, daf)] ?? [], [masechta, daf]) ?? [];
}

export async function saveQuestionOrder(masechta: string, daf: number, ids: string[]): Promise<void> {
  const all = await read();
  all[orderKey(masechta, daf)] = ids;
  await db.settings.put({ key: KEY, value: JSON.stringify(all) });
}

/** מסדר רשימה לפי הסדר השמור; שאלות שאין להן מקום שמור — בסוף, בסדר המקורי. */
export function applyOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items;
  const pos = new Map(order.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, i, p: pos.get(item.id) }))
    .sort((a, b) => (a.p ?? Infinity) - (b.p ?? Infinity) || a.i - b.i)
    .map((x) => x.item);
}
