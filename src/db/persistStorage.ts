// בקשה מהדפדפן לאחסון קבוע: בלי זה, כשנגמר מקום במכשיר (בעיקר בטלפון) הדפדפן רשאי למחוק את
// כל המסד — כולל ההתקדמות. הבקשה לא מציגה חלון למשתמש ברוב הדפדפנים; בתוכנת המחשב היא לא מזיקה.
import { db } from "./index";

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator.storage;
    if (!storage?.persist) return false;
    if (await storage.persisted?.()) return true;
    const granted = await storage.persist();
    await db.settings.put({ key: "storage-persisted", value: granted ? "1" : "0" });
    return granted;
  } catch {
    return false;
  }
}
