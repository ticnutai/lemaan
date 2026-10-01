import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
    lay.slabs.filter((s) => s.s === st).sort((a, b) => a.t - b.t).map((s) => ({ w: s.w, n: Math.round(s.h / s.lh) }));
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
    })();
  }, [m, a, src]);

  const report = useCallback((r: unknown) => { window.__dafLab = r; }, []);

  if (!amud || !truth) return <p className="p-6 text-muted-foreground">טוען…</p>;
  const spec = specFromTruth(truth);
  const anchors = anchorsFromTruth(truth);
  // גלישה פנימה: המילה האחרונה של הדפוס שייכת למשפט שספריא שמה בעמוד הבא → מצרפים את ראשו
  const spill = (segs: string[], nextSegs: string[], last?: string) => {
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
  };
  const gemaraText = spill(amud.gemara, nextAmud?.gemara ?? [], anchors.gemara?.last);
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <p className="text-sm text-muted-foreground" dir="ltr">
        spec: gemara {JSON.stringify(spec.gemara)} · rashi {JSON.stringify(spec.rashi)} · tosafot {JSON.stringify(spec.tosafot)} · rashi {spec.rashiSide}
      </p>
      <div className="gold-frame bg-white p-2">
        <GrammarDaf
          gemara={gemaraText}
          rashi={amud.commentaries.find((c) => c.key === "rashi")?.segments ?? []}
          tosafot={amud.commentaries.find((c) => c.key === "tosafot")?.segments ?? []}
          spec={spec}
          width={640}
          style={DEFAULT_DAF_STYLE}
          anchors={useAnchors ? anchors : undefined}
          onReport={report}
        />
      </div>
    </div>
  );
}
