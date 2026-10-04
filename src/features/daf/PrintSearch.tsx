import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { fetchGzJson } from "../../lib/gzJson";
import type { PrintLayout } from "./PrintDaf";
import { hebrewDaf } from "../study/shas";

/**
 * חיפוש בכל המסכתות שיש להן דפוס מדויק — בטקסט שמוצג בדף, לפי זרם (גמרא / רש"י / תוספות).
 * ביטוי יכול לעבור בין שורות (בתוך אותו זרם ואותו עמוד). ההשוואה מתעלמת מניקוד, גרשיים ופיסוק,
 * אבל לא פותחת ראשי תיבות. לחיצה על תוצאה פותחת את העמוד עם המילים מודגשות.
 */

type Stream = "gemara" | "rashi" | "tosafot";
const NAME: Record<Stream, string> = { gemara: "גמרא", rashi: 'רש"י', tosafot: "תוספות" };

interface Meta { slug: string; he: string }
interface Seq { file: string; amud: string; s: Stream; norm: string; starts: number[]; lines: string[] }
export interface PrintHit { slug: string; he: string; amud: string; s: Stream; line: string; n: number }

export const normHe = (t: string) =>
  t.replace(/[֑-ׇ]/g, "").replace(/["'״׳.,:;!?()[\]{}־-]/g, "").replace(/\s+/g, " ").trim();
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const amudLabel = (k: string) => {
  const m = /^(\d+)([ab])$/.exec(k);
  return m ? `${hebrewDaf(+m[1])}${m[2] === "a" ? "." : ":"}` : k;
};

let corpus: Promise<Seq[]> | null = null;
function loadCorpus(base: string): Promise<Seq[]> {
  corpus ??= fetch(`${base}tzurat/print/index.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((files: string[]) =>
      Promise.all(files.map((f) =>
        fetchGzJson<Record<string, PrintLayout>>(`${base}tzurat/print/${f}.json.gz`).then((d) => ({ f, d })).catch(() => null))))
    .then((all) => {
      const out: Seq[] = [];
      for (const x of all) {
        if (!x) continue;
        for (const [amud, lay] of Object.entries(x.d)) {
          for (const s of ["gemara", "rashi", "tosafot"] as Stream[]) {
            const lines = lay.slabs.filter((sl) => sl.s === s).flatMap((sl) => (sl.lines ?? []).map((l) => strip(l.t)));
            if (!lines.length) continue;
            const starts: number[] = [];
            let norm = "";
            for (const l of lines) { starts.push(norm.length); norm += normHe(l) + " "; }
            out.push({ file: x.f, amud, s, norm, starts, lines });
          }
        }
      }
      return out;
    })
    .catch(() => { corpus = null; return []; });
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
  const timer = useRef<number | undefined>(undefined);
  const metaOf = useMemo(() => new Map(masechtot.map((m) => [m.slug.toLowerCase(), m])), [masechtot]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const nq = normHe(q);
    if (nq.length < 2) { setHits(null); setTotal(0); return; }
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      const seqs = await loadCorpus(import.meta.env.BASE_URL);
      const t0 = performance.now();
      const found: PrintHit[] = [];
      let n = 0;
      for (const sq of seqs) {
        if (only !== "all" && sq.s !== only) continue;
        let i = sq.norm.indexOf(nq);
        while (i >= 0) {
          n++;
          if (found.length < 200) {
            let li = 0;
            while (li + 1 < sq.starts.length && sq.starts[li + 1] <= i) li++;
            const m = metaOf.get(sq.file);
            found.push({ slug: m?.slug ?? sq.file, he: m?.he ?? sq.file, amud: sq.amud, s: sq.s, line: sq.lines[li], n });
          }
          i = sq.norm.indexOf(nq, i + nq.length);
        }
      }
      setMs(performance.now() - t0);
      setHits(found); setTotal(n); setBusy(false);
    }, 200);
    return () => window.clearTimeout(timer.current);
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
            onChange={(e) => setQ(e.target.value)} aria-label="חיפוש בדפוס המדויק" />
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
