import { useEffect, useRef } from "react";

/** Scroll only after a completed selection has committed, never on intermediate steps. */
export function useScrollToSelectedQuestions(confirmed: boolean, selectionKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirmed) return;
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [confirmed, selectionKey]);
  return ref;
}
