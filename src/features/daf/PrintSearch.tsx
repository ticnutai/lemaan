import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { fetchGzJson as loadGzJson } from "../../lib/gzJson"; // בלמען אין מטמון משותף — זו כבר טעינה ישירה
import type { PrintLayout } from "./PrintDaf";
import { normHe, fromSearchFile, fromLayouts, searchSeqs, type Seq, type SearchFile, type Stream, type PrintHit, type Meta } from "./printSearchCore";
import { hebrewDaf } from "../study/shas";

/**
 * חיפוש בכל המסכתות שיש להן דפוס מדויק — בטקסט שמוצג בדף, לפי זרם (גמרא / רש"י / תוספות).
 * ביטוי יכול לעבור בין שורות (בתוך אותו זרם ואותו עמוד). ההשוואה מתעלמת מניקוד, גרשיים ופיסוק,
 * אבל לא פותחת ראשי תיבות. לחיצה על תוצאה פותחת את העמוד עם המילים מודגשות.
 */

const NAME: Record<Stream, string> = { gemara: "גמרא", rashi: 'רש"י', tosafot: "תוספות" };

const amudLabel = (k: string) => {
  const m = /^(\d+)([ab])$/.exec(k);
  return m ? `${hebrewDaf(+m[1])}${m[2] === "a" ? "." : ":"}` : k;
};

interface Corpus { seqs: Seq[]; failed: string[] }
let corpus: Promise<Corpus> | null = null;
/**
 * כל קובצי החיפוש, פעם אחת לביקור. נטענים בלי המטמון המשותף (loadGzJson) — אחרת 36 הקבצים היו דוחקים
 * מהמטמון את קובצי המסכת הפתוחה. מסכת שלא נטענה נרשמת ב-failed; אז המאגר לא נשמר, והחיפוש הבא ינסה שוב
 * (במקום להחזיר עד רענון הדף תוצאות חלקיות כאילו הן מלאות).
 */
function loadCorpus(base: string): Promise<Corpus> {
  corpus ??= fetch(`${base}tzurat/print/index.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`index ${r.status}`))))
    .then((files: string[]) =>
      Promise.all(files.map((f) =>
        loadGzJson<SearchFile>(`${base}tzurat/print/search/${f}.json.gz`)
          .then((d) => { const out: Seq[] = []; fromSearchFile(f, d, out); return out; })
          // בלי קובץ חיפוש (גרסה ישנה במטמון): מקבצי הפריסה
          .catch(() => loadGzJson<Record<string, PrintLayout>>(`${base}tzurat/print/${f}.json.gz`)
            .then((d) => { const out: Seq[] = []; fromLayouts(f, d, out); return out; }))
          .catch(() => f))))
    .then((all) => {
      const failed = all.filter((x): x is string => typeof x === "string");
      if (failed.length) corpus = null;
      return { seqs: all.filter((x): x is Seq[] => typeof x !== "string").flat(), failed };
    })
    .catch(() => { corpus = null; return { seqs: [], failed: ["index"] }; });
  return corpus;
}

export default function PrintSearch({ masechtot, onOpen }: {
  masechtot: Meta[];
  onOpen: (slug: string, amud: string, q: string) => void;
}) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<Stream | "all">("all");
  const [hits, setHits] = useState<PrintHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const metaOf = useMemo(() => new Map(masechtot.map((m) => [m.slug.toLowerCase(), m])), [masechtot]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    // חיפוש שהוחלף או נמחק בזמן שהמאגר נטען לא מעדכן את המסך (אחרת היו מופיעות תוצאות ישנות)
    let stale = false;
    const nq = normHe(q);
    if (nq.length < 2) { setHits(null); setTotal(0); setBusy(false); setFailed([]); return; }
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      const c = await loadCorpus(import.meta.env.BASE_URL);
      if (stale) return;
      const t0 = performance.now();
      const res = searchSeqs(c.seqs, q, only, metaOf);
      setMs(performance.now() - t0);
      setFailed(c.failed);
      setHits(res?.hits ?? []); setTotal(res?.total ?? 0); setBusy(false);
    }, 200);
    return () => { stale = true; window.clearTimeout(timer.current); };
  }, [q, only, metaOf]);

  const mark = (line: string) => {
    const words = normHe(q).split(" ").filter(Boolean);
    return line.split(" ").map((w, i) => {
      const hit = words.some((x) => normHe(w).includes(x));
      return <span key={i}>{i ? " " : ""}{hit ? <mark className="daf-hit">{w}</mark> : w}</span>;
    });
  };

  return (
    <div className="card-panel space-y-3">
      <h3 className="font-bold flex items-center gap-2"><Search className="h-4 w-4 text-gold" /> חיפוש בדפוס המדויק</h3>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-0 basis-48">
          <input className="input h-10 w-full pe-9" placeholder="מילה או ביטוי — גם כשהוא עובר שורה" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="חיפוש בדפוס המדויק"
            onFocus={() => void loadCorpus(import.meta.env.BASE_URL)} /* טעינה כבר בכניסה לתיבה */ />
          {q && <button className="absolute top-2 end-2 text-muted-foreground" onClick={() => setQ("")} title="נקה"><X className="h-5 w-5" /></button>}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="סינון לפי זרם">
          {(["all", "gemara", "rashi", "tosafot"] as const).map((k) => (
            <button key={k} className={`btn-outline h-9 px-3 ${only === k ? "border-gold text-gold bg-gold/10" : ""}`} onClick={() => setOnly(k)}>
              {k === "all" ? "הכל" : NAME[k]}
            </button>
          ))}
        </div>
      </div>
      {busy && <p className="text-sm text-muted-foreground">מחפש…</p>}
      {!busy && failed.length > 0 && (
        <p className="text-sm text-destructive" data-testid="print-search-partial">
          {failed.includes("index") ? "טעינת החיפוש נכשלה — בדוק את החיבור ונסה שוב" : `לא נטענו ${failed.length} מסכתות — התוצאות חלקיות`}
        </p>
      )}
      {hits && !busy && (
        <p className="text-sm text-muted-foreground" data-testid="print-search-count">
          {total} תוצאות{total > hits.length ? ` · מוצגות ${hits.length}` : ""} · {ms.toFixed(0)}ms
        </p>
      )}
      {hits && hits.length > 0 && (
        <ul className="divide-y max-h-[28rem] overflow-y-auto">
          {hits.map((h) => (
            <li key={`${h.slug}-${h.amud}-${h.s}-${h.n}`}>
              <button className="w-full text-right py-2 hover:bg-gold/5 rounded" onClick={() => onOpen(h.slug, h.amud, q)}>
                <div className="text-xs text-muted-foreground">{h.he} {amudLabel(h.amud)} · {NAME[h.s]}</div>
                <div className="lemaan-daf leading-relaxed" style={{ fontFamily: "Vilna, 'Frank Ruhl Libre', serif" }}>{mark(h.line)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
