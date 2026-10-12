import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, Scale } from "lucide-react";
import { db, setSetting } from "../db";
import { einMishpatFor, type EinMishpatGroup } from "../features/daf/einMishpat";
import { cn } from "../lib/utils";

const OPEN_KEY = "ein-mishpat-open";

/**
 * "עין משפט" — מה נפסק להלכה מהעמוד: רמב"ם, סמ"ג, טור ושולחן ערוך.
 * נפתח ונסגר בלחיצה; המצב נשמר בין כניסות. עמוד בלי נתונים — לא מוצג בכלל.
 */
export default function EinMishpatPanel({ masechet, amudKey }: { masechet: string; amudKey: string }) {
  const [groups, setGroups] = useState<EinMishpatGroup[] | null>(null);
  const open = useLiveQuery(async () => (await db.settings.get(OPEN_KEY))?.value === "1", []) ?? false;

  useEffect(() => {
    let alive = true;
    setGroups(null);
    einMishpatFor(masechet, amudKey).then((g) => { if (alive) setGroups(g); });
    return () => { alive = false; };
  }, [masechet, amudKey]);

  if (!groups || groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.refs.length, 0);

  return (
    <section className="card-panel" aria-label="עין משפט" data-testid="ein-mishpat">
      <button
        className="w-full flex items-center justify-between gap-2 text-right"
        aria-expanded={open}
        onClick={() => void setSetting(OPEN_KEY, open ? "0" : "1")}
      >
        <span className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-gold" />
          <span className="font-bold">עין משפט</span>
          <span className="text-xs text-muted-foreground">— מה נפסק להלכה מהעמוד</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {total} מקורות
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 animate-slide-in-down">
          {groups.map((g) => (
            <div key={g.book} className="rounded-lg border border-gold/30 bg-secondary/40 p-3">
              <p className="font-bold text-sm text-gold mb-1.5">{g.book}</p>
              <ul className="space-y-1 text-sm leading-snug">
                {g.refs.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
