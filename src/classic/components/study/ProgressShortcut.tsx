import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProgressShortcut({ cardIds, label }: { cardIds: string[]; label: string }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="h-9 w-9 border-gold/50"
      disabled={!cardIds.length}
      title={`תוצאות ומגמת שיפור: ${label}`}
      aria-label={`תוצאות: ${label}`}
      onClick={() => {
        try { localStorage.setItem("practice-progress-filter-v1", JSON.stringify({ cardIds, label })); } catch { /* ignore */ }
        window.dispatchEvent(new CustomEvent("deepfocus:open-progress"));
      }}
    >
      <ListChecks className="h-4 w-4 text-gold" />
    </Button>
  );
}
