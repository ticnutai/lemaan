import { Suspense, type ReactNode } from "react";
import { useLayoutMode } from "../features/layoutMode";

/** מציג את הפריסה שנבחרה בהגדרות. הפריסה המקורית נטענת רק כשבוחרים בה. */
export default function LayoutSwitch({ modern, classic }: { modern: ReactNode; classic: ReactNode }) {
  const mode = useLayoutMode();
  if (mode === undefined) return null;
  if (mode === "modern") return <>{modern}</>;
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground py-10">טוען את הפריסה המקורית…</div>}>
      {classic}
    </Suspense>
  );
}
