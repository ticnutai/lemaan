import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PrintDaf from "../features/daf/PrintDaf";
import type { BlockReport } from "../features/daf/GrammarDaf";
import GrammarDaf from "../features/daf/GrammarDaf";
import { DEFAULT_DAF_STYLE } from "../features/daf/dafStyle";
import type { AmudSpec } from "../features/daf/grammar";
import type { PrintSlab } from "../features/daf/PrintDaf";
import { anchorSpan, findAnchor } from "../features/daf/GrammarDaf";
import type { PrintLayout } from "../features/daf/PrintDaf";

declare global {
  interface Window { __dafLab?: unknown }
}

interface AmudData {
  gemara: string[];
  commentaries: { key: string; segments: string[] }[];
  daf: string; amud: string;
}

/** ספירת גושים מתוך גיאומטריית התשובון → המספרים השלמים של העמוד. */
function specFromTruth(lay: PrintLayout): AmudSpec {
  const g = lay.slabs.filter((s) => s.s === "gemara").sort((a, b) => a.t - b.t)
    .map((s) => ({ w: s.w, n: (s.lines ?? []).length }));
  const side = (st: "rashi" | "tosafot") =>
    lay.slabs.filter((s) => s.s === st).sort((a, b) => a.t - b.t).map((s) => ({ w: s.w, n: Math.round((s.h - 0.3 * s.lh) / s.lh), fs: s.fs, lh: s.lh }));
  const rashiCol = lay.slabs.find((s) => s.s === "rashi" && s.w < 250);
  const gl = lay.slabs.filter((s) => s.s === "gemara").sort((a, b) => a.t - b.t).at(-1)?.lines ?? [];
  const tail = (gl.at(-1)?.t ?? "").split(/\s+/).filter(Boolean).length;
  return { hang: tail > 0 && tail <= 2 ? tail : 0, gemara: g, rashi: side("rashi"), tosafot: side("tosafot"), rashiSide: rashiCol && rashiCol.l > 340 ? "right" : "left" };
}

/** עוגנים מהדפוס: המילה הראשונה של כל גוש (מהשני) + המילה האחרונה של העמוד. */
function anchorsFromTruth(lay: PrintLayout) {
  const firstWords = (s: PrintSlab) =>
    s.s === "gemara" ? (s.lines?.[0]?.t ?? "").split(/\s+/).slice(0, 2).join(" ") : (s.text ?? "").split(/\s+/).slice(0, 2).join(" ");
  // עוגן סיום: 4 המילים האחרונות (על פני שורות) — ייחודי גם כשהמילה התלויה שכיחה
  const lastWord = (s: PrintSlab) => {
    const t = s.s === "gemara" ? (s.lines ?? []).map((l) => l.t).join(" ") : (s.text ?? "");
    return t.split(/\s+/).slice(-4).join(" ");
  };
  const out: Record<string, { firsts: string[]; last?: string }> = {};
  for (const st of ["gemara", "rashi", "tosafot"] as const) {
    const ss = lay.slabs.filter((x) => x.s === st).sort((a, b) => a.t - b.t);
    if (!ss.length) continue;
    out[st] = { firsts: ss.slice(1).map(firstWords), last: lastWord(ss[ss.length - 1]) };
  }
  return out;
}

// גלישה פנימה: המילה האחרונה של הדפוס שייכת למשפט שספריא שמה בעמוד הבא → מצרפים את ראשו
function spill(segs: string[], nextSegs: string[], last?: string): string[] {
  if (!last) return segs;
  const words = segs.join(" ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
  const nextWords = nextSegs.join(" ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).slice(0, 80);
  // המינימום מראש העמוד הבא שאחריו העוגן סוגר בדיוק את הרצף (העוגן יכול לחצות את הגבול)
  const closesAt = (ws: string[]) => {
    const i = findAnchor(ws, Math.max(0, ws.length - 12), last, true);
    return i >= 0 && i + anchorSpan(ws, i, last) === ws.length;
  };
  for (let j = 0; j <= nextWords.length; j++) {
    if (closesAt([...words, ...nextWords.slice(0, j)])) return j ? [...segs, nextWords.slice(0, j).join(" ")] : segs;
  }
  return segs;
}

/** מעבדת דקדוק: /#/daf-lab?m=Berakhot&a=10a — מציירת לפי המספרים ומדווחת גבולות. */
export default function DafLabPage() {
  const [params] = useSearchParams();
  const m = params.get("m") ?? "Berakhot";
  const a = params.get("a") ?? "10a";
  const useAnchors = params.get("anchors") !== "0";
  // מקור הגמרא: ויקיטקסט (נוסח הדפוס — קיצורים, בלי פיסוק) או ספריא
  const src = params.get("src") === "sefaria" ? "sefaria" : "ws";
  const [amud, setAmud] = useState<AmudData | null>(null);
  const [nextAmud, setNextAmud] = useState<AmudData | null>(null);
  const [truth, setTruth] = useState<PrintLayout | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [rep, setRep] = useState<BlockReport[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const base = import.meta.env.BASE_URL;
      const load = async (url: string) => {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        // vite dev מפענח gzip בעצמו; בפרודקשן מגיעים בייטים גולמיים — מזהים לפי החתימה
        const text = bytes[0] === 0x1f && bytes[1] === 0x8b
          ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
          : new TextDecoder().decode(bytes);
        return JSON.parse(text).amudim;
      };
      const amudim = await load(`${base}shas/${m}.json.gz`);
      const ws: Record<string, string[]> | null = src === "ws" ? await load(`${base}shas-ws/${m}.json.gz`) : null;
      const keys = Object.keys(amudim);
      const pick = (k: string) => amudim[k] && (ws?.[k] ? { ...amudim[k], gemara: ws[k] } : amudim[k]);
      setAmud(pick(a));
      setNextAmud(pick(keys[keys.indexOf(a) + 1]) ?? null);
      const t = await (await fetch(`${base}tzurat/print/${m.toLowerCase()}.json`)).json();
      setTruth(t[a]);
      setKeys(Object.keys(t));
    })();
  }, [m, a, src]);

  const report = useCallback((r: BlockReport[]) => { window.__dafLab = r; setRep(r); }, []);

  // מחושבים פעם אחת לעמוד — אחרת כל דיווח מרנדר מחדש ומפעיל מדידה מחדש בלולאה
  const spec = useMemo(() => (truth ? specFromTruth(truth) : null), [truth]);
  const anchors = useMemo(() => (truth ? anchorsFromTruth(truth) : null), [truth]);
  const gemaraText = useMemo(
    () => (amud && anchors ? spill(amud.gemara, nextAmud?.gemara ?? [], anchors.gemara?.last) : []),
    [amud, nextAmud, anchors]
  );
  const rashi = useMemo(() => amud?.commentaries.find((c) => c.key === "rashi")?.segments ?? [], [amud]);
  const tosafot = useMemo(() => amud?.commentaries.find((c) => c.key === "tosafot")?.segments ?? [], [amud]);
  if (!amud || !truth || !spec || !anchors) return <p className="p-6 text-muted-foreground">טוען…</p>;
  const go = (k: string) => nav(`/daf-lab?m=${m}&a=${k}`);
  const i = keys.indexOf(a);
  const label = (k: string) => `${k.slice(0, -1)}${k.endsWith("a") ? "." : ":"}`;
  const NAME: Record<string, string> = { gemara: "גמרא", rashi: 'רש"י', tosafot: "תוספות" };
  const ok = rep.filter((r) => r.lines === r.n).length;
  return (
    <div className="max-w-6xl mx-auto space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">מעבדת צורת הדף — ברכות {label(a)}</h1>
        <button className="btn-ghost" disabled={i <= 0} onClick={() => go(keys[i - 1])}>→ הקודם</button>
        <select className="input w-auto" value={a} onChange={(e) => go(e.target.value)}>
          {keys.map((k) => <option key={k} value={k}>{label(k)}</option>)}
        </select>
        <button className="btn-ghost" disabled={i < 0 || i >= keys.length - 1} onClick={() => go(keys[i + 1])}>הבא ←</button>
        {rep.length > 0 && (
          <span className={`text-sm font-semibold ${ok === rep.length ? "text-green-700" : "text-amber-700"}`}>
            {ok}/{rep.length} גושים תואמים לדפוס
          </span>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <figure className="space-y-1">
          <figcaption className="text-sm text-muted-foreground">נבנה מטקסט (ויקיטקסט + רש"י ותוספות דפוס וילנא) לפי מספרי השורות</figcaption>
          <div className="gold-frame bg-white p-2">
            <GrammarDaf
              gemara={gemaraText}
              rashi={rashi}
              tosafot={tosafot}
              spec={spec}
              width={520}
              style={DEFAULT_DAF_STYLE}
              anchors={useAnchors ? anchors : undefined}
              onReport={report}
            />
          </div>
        </figure>
        <figure className="space-y-1">
          <figcaption className="text-sm text-muted-foreground">הדפוס (וילנא) — להשוואה</figcaption>
          <div className="gold-frame bg-white p-2">
            <PrintDaf layout={truth} width={560} style={DEFAULT_DAF_STYLE} query="" />
          </div>
        </figure>
      </div>
      {rep.length > 0 && (
        <table className="text-sm w-full max-w-xl">
          <thead><tr className="text-muted-foreground"><th className="text-right">גוש</th><th>רוחב</th><th>שורות בדפוס</th><th>שורות אצלנו</th><th>מילים</th><th>מ־ … עד</th><th /></tr></thead>
          <tbody>
            {[...rep].sort((x, y) => ["gemara", "rashi", "tosafot"].indexOf(x.s) - ["gemara", "rashi", "tosafot"].indexOf(y.s)).map((r, j) => (
              <tr key={j} className="border-t border-border">
                <td>{NAME[r.s]}</td><td className="text-center">{r.w}</td><td className="text-center">{r.n}</td>
                <td className="text-center">{r.lines}</td><td className="text-center">{r.words}</td>
                <td>{r.first} … {r.last}</td><td>{r.lines === r.n ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
