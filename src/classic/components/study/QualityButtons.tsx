import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlanReviewQuality } from "@/lib/study/types";

const GRADES: { q: PlanReviewQuality; label: string; color: string; description: string }[] = [
  { q: 1, label: "שכחתי",  color: "bg-destructive/90 hover:bg-destructive text-destructive-foreground border-destructive",   description: "חזרה מחר" },
  { q: 2, label: "קשה",     color: "bg-amber-500/90 hover:bg-amber-500 text-white border-amber-600",                          description: "מרווח קצר" },
  { q: 3, label: "טוב",     color: "bg-emerald-500/90 hover:bg-emerald-500 text-white border-emerald-600",                    description: "מרווח רגיל" },
  { q: 4, label: "קל",       color: "bg-blue-500/90 hover:bg-blue-500 text-white border-blue-600",                              description: "דלג קדימה" },
];

interface Props {
  onGrade: (q: PlanReviewQuality) => void;
  size?: "sm" | "xs";
  className?: string;
}

export function QualityButtons({ onGrade, size = "sm", className }: Props) {
  return (
    <div className={cn("grid grid-cols-4 gap-1", className)} dir="rtl">
      {GRADES.map((g) => (
        <Button
          key={g.q}
          size="sm"
          onClick={() => onGrade(g.q)}
          title={g.description}
          className={cn(
            "h-auto rounded-lg border-2 flex flex-col items-center justify-center gap-0 px-1 transition-all",
            size === "xs" ? "py-1" : "py-1.5",
            g.color,
          )}
        >
          <span className={cn("font-semibold leading-tight", size === "xs" ? "text-[10px]" : "text-xs")}>
            {g.label}
          </span>
          <span className={cn("opacity-80 leading-tight", size === "xs" ? "text-[8px]" : "text-[9px]")}>
            {g.description}
          </span>
        </Button>
      ))}
    </div>
  );
}
