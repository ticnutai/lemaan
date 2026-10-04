import { Check, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { Card } from "../features/study/types";

export function hasOptions(card: Card): boolean {
  return card.options.length > 1 && card.correctIndices.length > 0;
}

export function isSelectionCorrect(card: Card, selected: number): boolean {
  return card.correctIndices.includes(selected);
}

const OPTION_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח"];

const TYPE_LABELS: Record<Card["type"], string> = {
  combo: "משולבת",
  multiple: "אמריקאית",
  boolean: "נכון/לא נכון",
  flashcard: "כרטיסיה",
};

interface Props {
  card: Card;
  revealed: boolean;
  selected: number | null;
  onSelect: (index: number) => void;
  /** פירור דרך בראש הכרטיס, כמו במקור: "חגיגה › יב." */
  breadcrumb?: string;
  /** הגדלת גופן השאלה (כפתור T בסרגל) */
  fontScale?: number;
}

/**
 * כרטיס שאלה בסגנון המקור: פירור דרך + תגית סוג בראש, אפשרויות עם
 * אותיות א-ב-ג-ד. אחרי חשיפה — הנכונה מוזהבת, בחירה שגויה באדום.
 */
export default function QuestionCard({ card, revealed, selected, onSelect, breadcrumb, fontScale = 1 }: Props) {
  const withOptions = hasOptions(card);

  return (
    <div className="space-y-3">
      <div className="card-panel gold-frame min-h-[180px] flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="rounded-full bg-secondary border px-2.5 py-0.5 font-medium text-muted-foreground">
            {TYPE_LABELS[card.type] ?? "שאלה"}
          </span>
          {breadcrumb && <span className="text-muted-foreground">{breadcrumb}</span>}
        </div>
        <p className="font-medium leading-relaxed" style={{ fontSize: `${1.125 * fontScale}rem` }}>
          {card.question}
        </p>
        {revealed && card.answer && (
          <div className="pt-3 border-t animate-slide-in-down mt-auto">
            <p className="text-sm text-muted-foreground mb-1">{withOptions ? "הסבר:" : "תשובה:"}</p>
            <p className="leading-relaxed">{card.answer}</p>
          </div>
        )}
      </div>

      {withOptions && (
        <div className="space-y-2">
          {card.options.map((option, i) => {
            const isCorrect = card.correctIndices.includes(i);
            const isSelected = selected === i;
            return (
              <button
                key={i}
                disabled={revealed}
                onClick={() => onSelect(i)}
                className={cn(
                  "w-full text-right rounded-lg border bg-card px-3 py-3 transition-colors flex items-center gap-3 shadow-sm",
                  !revealed && "hover:bg-secondary hover:border-gold",
                  // אחרי בחירה — כמו במקור: הנכונה בירוק עם ✓, הבחירה השגויה באדום עם ✗, השאר מעומעמות
                  revealed && isCorrect && "border-2 border-green-500 bg-green-50 dark:bg-green-500/15 font-medium",
                  revealed && isSelected && !isCorrect && "border-2 border-red-500 bg-red-50 dark:bg-red-500/15",
                  revealed && !isSelected && !isCorrect && "opacity-60"
                )}
                style={{ fontSize: `${0.875 * fontScale}rem` }}
                data-result={revealed ? (isCorrect ? "correct" : isSelected ? "wrong" : undefined) : undefined}
              >
                <span
                  className={cn(
                    "h-7 w-7 shrink-0 rounded-md text-sm font-bold flex items-center justify-center text-white",
                    revealed && isCorrect ? "bg-green-600" : revealed && isSelected ? "bg-red-600" : "bg-gradient-navy text-primary-foreground"
                  )}
                >
                  {OPTION_LETTERS[i] ?? i + 1}
                </span>
                <span className="flex-1 leading-snug">{option}</span>
                {revealed && isCorrect && <Check className="h-5 w-5 shrink-0 text-green-600" aria-label="תשובה נכונה" />}
                {revealed && isSelected && !isCorrect && <X className="h-5 w-5 shrink-0 text-red-600" aria-label="תשובה שגויה" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
