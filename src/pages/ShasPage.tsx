import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, ChevronLeft, ChevronRight, Landmark } from "lucide-react";
import PageBanner from "../components/PageBanner";

/** מאגר הש"ס המקומי (מהדורת וילנא, ספריא) — 37 מסכתות, עובד אופליין מלא. */

interface Commentary {
  key: string;
  he: string;
  en: string;
  segments: string[];
}
interface Amud {
  id: string;
  masechet: string;
  daf: string;
  amud: string;
  gemara: string[];
  commentaries: Commentary[];
}
interface MasechetMeta {
  he: string;
  en: string;
  slug: string;
  seder_he: string;
  daf_count: number;
}
interface ShasIndex {
  masechtot: MasechetMeta[];
}

const fileCache = new Map<string, Record<string, Amud>>();

async function loadMasechet(slug: string): Promise<Record<string, Amud>> {
  const cached = fileCache.get(slug);
  if (cached) return cached;
  const res = await fetch(`${import.meta.env.BASE_URL}shas/${slug}.json.gz`);
  if (!res.ok) throw new Error(`טעינת ${slug} נכשלה`);
  // שרתים מסוימים (vite dev) מפענחים את ה-gzip בעצמם; אחרים מגישים בייטים
  // גולמיים. מזהים לפי חתימת gzip (1f 8b) ומפענחים רק במקרה הצורך.
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let text: string;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(bytes);
  }
  const data = JSON.parse(text);
  fileCache.set(slug, data.amudim);
  return data.amudim;
}

export default function ShasPage() {
  const [params, setParams] = useSearchParams();
  const [index, setIndex] = useState<ShasIndex | null>(null);
  const [amudim, setAmudim] = useState<Record<string, Amud> | null>(null);
  const [openCommentaries, setOpenCommentaries] = useState<Set<string>>(new Set(["rashi", "tosafot"]));
  const [error, setError] = useState("");

  const slug = params.get("m");
  const amudKey = params.get("a") ?? "2a";

  // קישור עמוק ממסך התרגול: ?he=<שם מסכת בעברית>&daf=<מספר דף>
  useEffect(() => {
    const he = params.get("he");
    if (!he || !index) return;
    const m = index.masechtot.find((x) => x.he === he || x.he === he.replace("מסכת ", ""));
    if (m) setParams({ m: m.slug, a: `${params.get("daf") ?? "2"}a` }, { replace: true });
    else setParams({}, { replace: true });
  }, [params, index, setParams]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}shas/index.json`)
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => setError("אינדקס הש\"ס לא נטען"));
  }, []);

  useEffect(() => {
    if (!slug) {
      setAmudim(null);
      return;
    }
    setError("");
    setAmudim(null);
    loadMasechet(slug)
      .then(setAmudim)
      .catch((e) => setError(e instanceof Error ? e.message : "שגיאה"));
  }, [slug]);

  const sedarim = useMemo(() => {
    if (!index) return [];
    const map = new Map<string, MasechetMeta[]>();
    for (const m of index.masechtot) {
      if (!map.has(m.seder_he)) map.set(m.seder_he, []);
      map.get(m.seder_he)!.push(m);
    }
    return [...map.entries()];
  }, [index]);

  const meta = index?.masechtot.find((m) => m.slug === slug);
  const amud = amudim?.[amudKey];
  const amudKeys = useMemo(() => (amudim ? Object.keys(amudim) : []), [amudim]);
  const amudPos = amudKeys.indexOf(amudKey);

  const go = (m: string, a: string) => setParams({ m, a }, { replace: false });

  // ---------- בחירת מסכת ----------
  if (!slug || !meta) {
    return (
      <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
        <PageBanner icon={Landmark} title='הש"ס' subtitle="גמרא מהדורת וילנא עם מפרשים — 37 מסכתות, זמין גם בלי אינטרנט." />
        {error && <p className="text-destructive text-sm">{error}</p>}
        {sedarim.map(([seder, list]) => (
          <div key={seder} className="card-panel">
            <h3 className="font-bold mb-3">{seder}</h3>
            <div className="flex flex-wrap gap-2">
              {list.map((m) => (
                <button key={m.slug} onClick={() => go(m.slug, "2a")} className="btn-outline rounded-full hover:border-gold">
                  {m.he}
                  <span className="text-xs text-muted-foreground">({m.daf_count} דפים)</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---------- עמוד ----------
  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <div className="card-panel py-3 flex items-center justify-between gap-2 flex-wrap">
        <button className="btn-ghost h-9" onClick={() => setParams({})}>
          <BookOpen className="h-4 w-4 text-gold" /> כל המסכתות
        </button>
        <div className="flex items-center gap-1.5">
          <button className="btn-outline h-9 w-9 p-0" disabled={amudPos <= 0} title="עמוד קודם"
            onClick={() => go(slug, amudKeys[amudPos - 1])}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <select className="input h-9 w-32" value={amudKey} onChange={(e) => go(slug, e.target.value)}>
            {amudKeys.map((k) => {
              const a = amudim![k];
              return (
                <option key={k} value={k}>
                  {a.daf} {a.amud}
                </option>
              );
            })}
          </select>
          <button className="btn-outline h-9 w-9 p-0" disabled={amudPos < 0 || amudPos >= amudKeys.length - 1} title="עמוד הבא"
            onClick={() => go(slug, amudKeys[amudPos + 1])}>
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
        <h2 className="font-display text-xl font-bold">
          {meta.he} {amud ? `· דף ${amud.daf} ${amud.amud}` : ""}
        </h2>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {!amudim && !error && <div className="card-panel text-center py-10 text-muted-foreground">טוען את המסכת…</div>}

      {amud && (
        <>
          <article className="gold-frame p-6 leading-loose text-lg" style={{ fontFamily: "'Frank Ruhl Libre', 'Heebo', serif" }}>
            {amud.gemara.map((seg, i) => (
              <p key={i} className="mb-3">{seg}</p>
            ))}
          </article>

          {amud.commentaries.map((c) => (
            <div key={c.key} className="card-panel">
              <button
                className="w-full text-right font-bold flex items-center justify-between"
                onClick={() => {
                  const next = new Set(openCommentaries);
                  if (next.has(c.key)) next.delete(c.key);
                  else next.add(c.key);
                  setOpenCommentaries(next);
                }}
              >
                <span>{c.he}</span>
                <span className="text-xs text-muted-foreground">{c.segments.length} קטעים</span>
              </button>
              {openCommentaries.has(c.key) && (
                <div className="mt-3 space-y-2 text-sm leading-relaxed border-t pt-3">
                  {c.segments.map((seg, i) => (
                    <p key={i}>{seg}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
