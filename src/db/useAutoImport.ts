import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from ".";
import { ensureAmudBackfill, importLibrary, type ImportProgress } from "./importLibrary";
import { installPacks } from "./packs";

/**
 * ייבוא המאגר בכניסה הראשונה — ברמת האפליקציה, כך שזה קורה גם כשנכנסים
 * ישירות לתרגול/שאלות ולא רק דרך מסך הבית.
 */
export function useAutoImport() {
  const imported = useLiveQuery(async () => (await db.settings.get("library-import-done"))?.value === "1", []);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (imported === false && !started.current) {
      started.current = true;
      setImporting(true);
      importLibrary(setProgress)
        .catch(() => {})
        .finally(() => {
          setImporting(false);
          setProgress(null);
        });
    }
    if (imported === true) {
      void ensureAmudBackfill();
      void installPacks(); // חבילות שאלות נוספות (למשל שולחן ערוך) — גם למי שכבר ייבא את המאגר
    }
  }, [imported]);

  return { importing, progress };
}
