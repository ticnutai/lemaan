import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from ".";
import { ensureAmudBackfill, importLibrary, type ImportProgress } from "./importLibrary";

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
    if (imported === true) void ensureAmudBackfill();
  }, [imported]);

  return { importing, progress };
}
