import { useEffect, useState } from "react";
import DafPage from "./DafPage";
import type { PrintLayout } from "./PrintDaf";
import { innerSegments, outerSegments } from "./streams";
import { loadMasechet, loadPrintLayouts, PRINT_CREDIT, slugForHebrew, type ShasAmud } from "./shasData";

/**
 * צורת הדף של עמוד אחד — אותה תצוגה כמו במסך הש"ס (גמרא במרכז, רש"י פנימה, תוספות בחוץ,
 * ובדפוס המדויק כשיש למסכת). רכיב משותף: מתחת לשאלות בשתי הפריסות.
 * הקבצים נטענים פעם אחת לכל מסכת (shasData), ולכן מעבר בין שאלות באותה מסכת מיידי.
 */
interface Props {
  /** שם המסכת בעברית, כמו בשאלות ("ברכות") */
  masechta: string;
  daf: number;
  amud: 1 | 2;
}

type Loaded = { slug: string; amud: ShasAmud | null; print: PrintLayout | undefined };

export default function TzuratDafPanel({ masechta, daf, amud }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const key = `${daf}${amud === 2 ? "b" : "a"}`;

  useEffect(() => {
    let cancelled = false;
    setError("");
    (async () => {
      const slug = await slugForHebrew(masechta);
      if (!slug) throw new Error(`המסכת ${masechta} לא נמצאה`);
      const [amudim, print] = await Promise.all([loadMasechet(slug), loadPrintLayouts(slug)]);
      if (!cancelled) setData({ slug, amud: amudim[key] ?? null, print: print?.[key] });
    })().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "שגיאה בטעינת הדף");
    });
    return () => {
      cancelled = true;
    };
  }, [masechta, key]);

  if (error) return <div className="py-6 text-center text-sm text-destructive">{error}</div>;
  // מציגים את הדף הקודם עד שהחדש מוכן (בלי הבהוב); בפעם הראשונה — הודעת טעינה
  if (!data) return <div className="py-8 text-center text-sm text-muted-foreground">טוען את צורת הדף…</div>;
  if (!data.amud) return <div className="py-6 text-center text-sm text-muted-foreground">העמוד הזה לא נמצא במאגר הגמרא.</div>;

  return (
    <div data-testid="tzurat-daf-panel">
      <DafPage
        key={`${data.slug}-${key}`}
        gemara={data.amud.gemara}
        rashi={innerSegments(data.amud.commentaries)}
        tosafot={outerSegments(data.amud.commentaries)}
        amud={key.endsWith("b") ? "b" : "a"}
        title={`${masechta} דף ${data.amud.daf} ${data.amud.amud}`}
        printLayout={data.print}
        printCredit={PRINT_CREDIT[data.slug]}
      />
    </div>
  );
}
