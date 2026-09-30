import { Check, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { Card } from "../features/study/types";

export function hasOptions(card: Card): boolean {
  return card.options.length > 1 && card.correctIndices.length > 0;
}

export function isSelectionCorrect(card: Card, selected: number): boolean {
  return card.correctIndices.includes(selected);
}

interface Props {
  card: Card;
  revealed: boolean;
  selected: number | null;
  onSelect: (index: number) => void;
}

/**
 * Renders a question: multiple-choice options when the card has them
 * (combo/multiple), otherwise a plain flashcard body. After reveal the
 * correct option is highlighted gold and a wrong selection red.
 */
export default function QuestionCard({ card, revealed, selected, onSelect }: Props) {
  const withOptions = hasOptions(card);

  return (
    <div className="card-panel gold-frame min-h-[220px] flex flex-col gap-4">
      <p className="text-lg font-medium leading-relaxed">{card.question}</p>

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
                  "w-full text-right rounded-md border px-4 py-3 text-sm transition-colors flex items-center gap-2",
                  !revealed && "hover:bg-secondary hover:border-gold",
                  revealed && isCorrect && "border-gold bg-gold/15 font-medium",
                  revealed && isSelected && !isCorrect && "border-destructive bg-destructive/10",
                  revealed && !isSelected && !isCorrect && "opacity-60"
                )}
              >
                {revealed && isCorrect && <Check className="h-4 w-4 shrink-0 text-gold" />}
                {revealed && isSelected && !isCorrect && <X className="h-4 w-4 shrink-0 text-destructive" />}
                <span className="flex-1">{option}</span>
              </button>
            );
          })}
        </div>
      )}

      {revealed && card.answer && (
        <div className="pt-4 border-t animate-slide-in-down mt-auto">
          <p className="text-sm text-muted-foreground mb-1">{withOptions ? "הסבר:" : "תשובה:"}</p>
          <p className="leading-relaxed">{card.answer}</p>
        </div>
      )}
    </div>
  );
}
