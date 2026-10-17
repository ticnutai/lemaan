import { useEffect, useState } from "react";
import { BookOpen, FileText } from "lucide-react";
import { cn } from "../lib/utils";
import TzuratDafPanel from "../features/daf/TzuratDafPanel";
import { saveGemaraView, useGemaraView, type GemaraView } from "../features/daf/gemaraView";
import { sanitizeSegment } from "../features/daf/buildHtml";
import { loadMasechet, slugForHebrew } from "../features/daf/shasData";
import { hebrewDaf } from "../features/study/shas";

/**
 * הגמרא של העמוד מתחת לשאלה: מסגרות קטנות לבחירה בין "צורת הדף" (הדפוס המדויק) ל"טקסט" רגיל.
 * הבחירה משותפת לשתי הפריסות (gemaraView). הכל מהקבצים המקומיים — עובד גם בלי רשת.
 */
interface Props {
  masechta: string;
  daf: number;
  amud: 1 | 2;
}

export default function GemaraPanel({ masechta, daf, amud }: Props) {
  const view = useGemaraView();
  const options: { id: GemaraView; label: string; icon: typeof BookOpen }[] = [
    { id: "tzurat", label: "צורת הדף", icon: BookOpen },
    { id: "text", label: "טקסט", icon: FileText },
  ];
  return (
    <section className="rounded-xl border-2 border-gold/30 bg-card overflow-hidden" data-testid="gemara-panel" data-view={view}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gold/30 bg-gold/5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-gold" />
          {masechta} · דף {hebrewDaf(daf)} · {amud === 1 ? 'ע"א' : 'ע"ב'}
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="תצוגת הגמרא">
          {options.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={view === o.id}
              onClick={() => void saveGemaraView(o.id)}
              className={cn(
                "h-7 rounded-md border px-2 text-xs flex items-center gap-1 transition-colors",
                view === o.id ? "border-gold bg-gold text-navy font-semibold" : "border-gold/40 hover:bg-secondary",
              )}
            >
              <o.icon className="h-3 w-3" /> {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-2">
        {view === "tzurat" && <TzuratDafPanel masechta={masechta} daf={daf} amud={amud} />}
        {view === "text" && <PlainText masechta={masechta} daf={daf} amud={amud} />}
      </div>
    </section>
  );
}

/** טקסט הגמרא בלבד, מהקבצים המקומיים. */
function PlainText({ masechta, daf, amud }: Props) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setError("");
    (async () => {
      const slug = await slugForHebrew(masechta);
      if (!slug) throw new Error(`המסכת ${masechta} לא נמצאה`);
      const amudim = await loadMasechet(slug);
      if (!cancelled) setLines(amudim[`${daf}${amud === 2 ? "b" : "a"}`]?.gemara ?? []);
    })().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "שגיאה");
    });
    return () => {
      cancelled = true;
    };
  }, [masechta, daf, amud]);
  if (error) return <p className="py-6 text-center text-sm text-destructive">{error}</p>;
  if (!lines) return <p className="py-6 text-center text-sm text-muted-foreground">טוען…</p>;
  if (!lines.length) return <p className="py-6 text-center text-sm text-muted-foreground">אין טקסט לעמוד הזה.</p>;
  return (
    <article className="px-3 py-2 leading-loose text-lg" style={{ fontFamily: "'Frank Ruhl Libre', 'Heebo', serif" }} data-testid="gemara-text">
      {lines.map((seg, i) => (
        <p key={i} className="mb-3" dangerouslySetInnerHTML={{ __html: sanitizeSegment(seg) }} />
      ))}
    </article>
  );
}
