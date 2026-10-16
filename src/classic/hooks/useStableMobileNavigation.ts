import { useLayoutEffect, useRef } from "react";

/** Keep a shrinking drill-down panel from clamping or anchoring its parent scroll. */
export function useStableMobileNavigation(enabled: boolean, contentVisible = false) {
  const ref = useRef<HTMLDivElement>(null);
  const pending = useRef<Array<{ element: Element; top: number; left: number }> | null>(null);
  const capture = () => {
    const panel = ref.current;
    if (!enabled || !panel || !window.matchMedia("(max-width: 767px)").matches) return;
    // Reserve the space already visible before React replaces the current step.
    // Without this, the browser clamps scrollTop when a short tractate list appears.
    if (!contentVisible) panel.style.minHeight = `${Math.max(panel.getBoundingClientRect().height, parseFloat(panel.style.minHeight) || 0)}px`;
    const positions = [];
    for (let element: Element | null = panel; element; element = element.parentElement) {
      positions.push({ element, top: element.scrollTop, left: element.scrollLeft });
    }
    pending.current = positions;
  };
  useLayoutEffect(() => {
    // Once the selected page renders below, that content supplies the scroll
    // extent: release the temporary reservation before paint, not after it.
    if ((!enabled || contentVisible) && ref.current) ref.current.style.minHeight = "";
    for (const { element, top, left } of pending.current ?? []) {
      element.scrollTop = top;
      element.scrollLeft = left;
    }
    pending.current = null;
  });
  return { ref, onClickCapture: capture, style: { overflowAnchor: "none" as const } };
}
