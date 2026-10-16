import { useEffect, useRef } from "react";
import type { PointerEvent, MouseEvent } from "react";

/** Touch-only edit gesture; movement, release and scroll cancel it. */
export function useTouchHold() {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const cancel = () => { clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => {
    window.addEventListener("scroll", cancel, true);
    return () => { cancel(); window.removeEventListener("scroll", cancel, true); };
  }, []);
  return (enabled: boolean, open: () => void) => ({
    onPointerDown(event: PointerEvent) {
      cancel();
      if (!enabled || event.pointerType !== "touch") return;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { cancel(); open(); }, 600);
    },
    onPointerMove(event: PointerEvent) {
      if (Math.hypot(event.clientX-start.current.x,event.clientY-start.current.y)>10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu(event: MouseEvent) { if (enabled) event.preventDefault(); },
  });
}
