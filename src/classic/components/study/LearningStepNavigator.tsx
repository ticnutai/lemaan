import { useState } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStableMobileNavigation } from "@/hooks/useStableMobileNavigation";

export interface LearningStep {
  title: string;
  backLabel: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}

/** Navigation only: corpus data, selection persistence and cards stay in their existing owners. */
export function LearningStepNavigator({ steps, confirmed, onConfirmedChange }: {
  steps: LearningStep[];
  confirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [path, setPath] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // Restore scroll positions without retaining the height of a longer previous step.
  const stable = useStableMobileNavigation(true, true);
  const step = steps[index];
  return <div {...stable} className="col-span-full w-full min-w-0 space-y-3" dir="rtl" aria-label="בחירה שלב אחר שלב">
    <div className="flex min-h-11 flex-col items-center justify-center gap-1 px-14 text-center">
      {index > 0 && <span className="text-sm text-muted-foreground">{path.slice(0, index).join(" · ")}</span>}
      <strong className="text-xl font-bold text-navy">{step.title}</strong>
      {index > 0 && <Button variant="ghost" size="sm" onClick={() => {
        setIndex(index - 1); setSelected(null); onConfirmedChange(false);
      }}><ChevronRight className="ml-1 h-4 w-4" />חזרה ל{steps[index - 1].backLabel}</Button>}
    </div>
    <div className="mx-auto flex w-full max-w-4xl flex-wrap justify-center gap-3">
      {step.options.map(option => <button key={option.value} type="button"
        aria-pressed={confirmed && selected === option.value}
        className={`flex w-[calc(50%-0.375rem)] sm:w-40 min-h-20 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-center shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${confirmed && selected === option.value ? "border-gold bg-gradient-navy text-primary-foreground shadow-sm" : "border-gold/40 bg-card hover:border-gold hover:bg-gold/5"}`}
        onClick={() => {
          step.onSelect(option.value);
          setPath([...path.slice(0, index), option.label]);
          if (index < steps.length - 1) {
            setIndex(index + 1); setSelected(null); onConfirmedChange(false);
          } else { setSelected(option.value); onConfirmedChange(true); }
        }}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10"><BookOpen className="h-5 w-5 text-gold" /></span>
        <span className="block font-semibold break-words">{option.label}</span>
      </button>)}
    </div>
  </div>;
}
