import { useState } from "react";
import { ListTree, ListChecks, RotateCcw, SquareStack } from "lucide-react";
import { cn } from "../lib/utils";
import type { Card } from "../features/study/types";
import { saveOpenQuestionView, useOpenQuestionView, type OpenQuestionView } from "../features/study/openQuestionView";

/**
 * רשימת שאלות פתוחות (שאלה ותשובה, לא אמריקאיות) עם בחירת תצוגה:
 *  - רשימה נפתחת: לוחצים על שאלה — התשובה נפתחת מתחתיה;
 *  - כרטיסים מתהפכים: לוחצים על הכרטיס — הוא מסתובב ומראה את התשובה.
 * רכיב משותף לשתי הפריסות.
 */
export default function OpenQuestionList({ cards }: { cards: Card[] }) {
  const view = useOpenQuestionView();
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setFlipped((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const options: { id: OpenQuestionView; label: string; icon: typeof ListTree }[] = [
    { id: "list", label: "רשימה נפתחת", icon: ListTree },
    { id: "flip", label: "כרטיסים מתהפכים", icon: SquareStack },
  ];

  return (
    <div className="space-y-2" data-testid="open-question-list" data-view={view}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-gold" /> השאלות ({cards.length})
        </div>
        <div className="flex items-center gap-1 rounded-full border border-gold/40 p-0.5" role="radiogroup" aria-label="תצוגת השאלות">
          {options.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={view === o.id}
              title={o.label}
              aria-label={o.label}
              onClick={() => {
                setFlipped(new Set());
                void saveOpenQuestionView(o.id);
              }}
              className={cn(
                "h-8 rounded-full px-2.5 text-xs flex items-center gap-1 transition-colors",
                view === o.id ? "bg-gradient-navy text-primary-foreground" : "hover:bg-secondary",
              )}
            >
              <o.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{o.label}</span>
            </button>
          ))}
          {view === "flip" && flipped.size > 0 && (
            <button className="h-8 rounded-full px-2 text-xs flex items-center gap-1 hover:bg-secondary" onClick={() => setFlipped(new Set())} title="להפוך את כל הכרטיסים חזרה לשאלה">
              <RotateCcw className="h-3.5 w-3.5" /> הכל לשאלה
            </button>
          )}
        </div>
      </div>

      {view === "list" ? (
        cards.map((c, i) => (
          <details key={c.id} className="rounded-lg border border-gold/30 bg-card p-3 open:border-gold/60">
            <summary className="cursor-pointer font-medium">
              <span className="text-gold font-bold ml-1">{i + 1}.</span> {c.question}
            </summary>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{c.answer}</p>
          </details>
        ))
      ) : (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          {cards.map((c, i) => {
            const isFlipped = flipped.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={cn("flip-card text-right", isFlipped && "is-flipped")}
                onClick={() => toggle(c.id)}
                aria-pressed={isFlipped}
                aria-label={isFlipped ? `תשובה לשאלה ${i + 1} — לחיצה מחזירה לשאלה` : `שאלה ${i + 1}: ${c.question} — לחיצה מראה את התשובה`}
                data-testid="flip-card"
              >
                <span className="flip-card-inner">
                  <span className="flip-card-face flip-card-front rounded-xl border-2 border-gold/50 bg-card p-4 shadow-elegant">
                    <span className="text-xs font-bold text-gold">שאלה {i + 1}</span>
                    <span className="mt-1 block font-semibold leading-relaxed">{c.question}</span>
                    <span className="mt-3 block text-xs text-muted-foreground">לחצו להפוך ↻</span>
                  </span>
                  <span className="flip-card-face flip-card-back rounded-xl border-2 border-gold bg-secondary p-4 shadow-elegant">
                    <span className="text-xs font-bold text-gold">תשובה {i + 1}</span>
                    <span className="mt-1 block whitespace-pre-line text-sm leading-relaxed">{c.answer || "אין תשובה"}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
