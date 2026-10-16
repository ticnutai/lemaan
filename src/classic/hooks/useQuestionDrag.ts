// גרירת שאלה ברשימת הדף: לסידור בין השאלות, ולסיווג לעמוד א' / עמוד ב' / כל הדף.
// בנוי על אירועי מצביע (עכבר, אצבע ועט) ולא על הגרירה המובנית של הדפדפן — כי בתוכנת המחשב
// ובטלפון הגרירה המובנית לא עובדת. בזמן הגרירה הטקסט של השאלה צף ליד המצביע.
//
// יעדים בדף:
//   [data-drop-amud="1" | "2" | "0"]  — כפתור עמוד א' / עמוד ב' / כל הדף (0 = ביטול הסיווג לעמוד)
//   [data-card-row="<מזהה>"][data-card-amud="1" | "2" | "0"] — שורת שאלה (לסידור; בקבוצה אחרת — גם סיווג)
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type DropAmud = 1 | 2 | null;
export interface RowTarget { id: string; after: boolean; amud: DropAmud }

interface Options {
  onDropAmud: (cardId: string, amud: DropAmud) => void;
  onDropRow: (cardId: string, target: RowTarget) => void;
}

const toAmud = (v: string | undefined): DropAmud => (v === "1" ? 1 : v === "2" ? 2 : null);
const START_DISTANCE = 6;
const EDGE = 48;

export function useQuestionDrag({ onDropAmud, onDropRow }: Options) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overAmud, setOverAmud] = useState<"1" | "2" | "0" | null>(null);
  const [overRow, setOverRow] = useState<RowTarget | null>(null);
  const cb = useRef({ onDropAmud, onDropRow });
  cb.current = { onDropAmud, onDropRow };
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const start = useCallback((event: ReactPointerEvent, cardId: string, text: string) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const x0 = event.clientX;
    const y0 = event.clientY;
    let ghost: HTMLDivElement | null = null;
    let active = false;
    let amudTarget: "1" | "2" | "0" | null = null;
    let rowTarget: RowTarget | null = null;
    let lastY = y0;
    let scrollTimer: number | null = null;

    const placeGhost = (x: number, y: number) => {
      if (ghost) ghost.style.transform = `translate(${x + 14}px, ${y + 12}px)`;
    };

    const findTargets = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const amudEl = el?.closest<HTMLElement>("[data-drop-amud]");
      amudTarget = (amudEl?.dataset.dropAmud as "1" | "2" | "0" | undefined) ?? null;
      rowTarget = null;
      if (!amudTarget) {
        const rowEl = el?.closest<HTMLElement>("[data-card-row]");
        const id = rowEl?.dataset.cardRow;
        if (rowEl && id && id !== cardId) {
          const r = rowEl.getBoundingClientRect();
          rowTarget = { id, after: y > r.top + r.height / 2, amud: toAmud(rowEl.dataset.cardAmud) };
        }
      }
      setOverAmud(amudTarget);
      setOverRow(rowTarget);
    };

    // גלילה אוטומטית כשמתקרבים לקצה הרשימה או החלון
    const autoScroll = () => {
      const list = document.querySelector<HTMLElement>("[data-testid='daf-question-list']");
      if (list) {
        const r = list.getBoundingClientRect();
        if (lastY < r.top + EDGE && lastY > r.top - EDGE) list.scrollTop -= 14;
        else if (lastY > r.bottom - EDGE && lastY < r.bottom + EDGE) list.scrollTop += 14;
      }
      if (amudTarget) return; // מעל כפתור עמוד — לא לגלול (אחרת הכפתור בורח מתחת למצביע)
      if (lastY < EDGE) window.scrollBy(0, -14);
      else if (lastY > window.innerHeight - EDGE) window.scrollBy(0, 14);
    };

    const begin = () => {
      active = true;
      setDraggingId(cardId);
      ghost = document.createElement("div");
      ghost.dir = "rtl";
      ghost.setAttribute("data-question-drag-ghost", "");
      ghost.textContent = text;
      Object.assign(ghost.style, {
        position: "fixed", left: "0", top: "0", zIndex: "9999", pointerEvents: "none",
        maxWidth: "360px", padding: "10px 14px", borderRadius: "12px",
        background: "hsl(var(--card))", color: "hsl(var(--foreground))",
        border: "2px solid hsl(var(--gold))", boxShadow: "0 12px 32px rgb(0 0 0 / 0.25)",
        fontSize: "14px", fontWeight: "600", lineHeight: "1.4", opacity: "0.95",
        display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden",
      } as Partial<CSSStyleDeclaration>);
      document.body.appendChild(ghost);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      scrollTimer = window.setInterval(autoScroll, 30);
    };

    const onMove = (e: PointerEvent) => {
      lastY = e.clientY;
      if (!active) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < START_DISTANCE) return;
        begin();
      }
      e.preventDefault();
      placeGhost(e.clientX, e.clientY);
      findTargets(e.clientX, e.clientY);
    };

    const finish = (drop: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      if (scrollTimer !== null) window.clearInterval(scrollTimer);
      ghost?.remove();
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      cleanupRef.current = null;
      const a = amudTarget;
      const r = rowTarget;
      setDraggingId(null);
      setOverAmud(null);
      setOverRow(null);
      if (!drop || !active) return;
      if (a) cb.current.onDropAmud(cardId, toAmud(a));
      else if (r) cb.current.onDropRow(cardId, r);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(false); };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    cleanupRef.current = () => finish(false);
  }, []);

  /** מאפיינים לידית הגרירה של שאלה. */
  const handleProps = (cardId: string, text: string) => ({
    onPointerDown: (e: ReactPointerEvent) => start(e, cardId, text),
    style: { touchAction: "none" as const, cursor: "grab" },
    role: "button" as const,
    tabIndex: -1,
    "aria-label": "גרירה: לסידור בין השאלות או לסיווג לעמוד",
    title: "גרור לסידור בין השאלות, או אל עמוד א׳ / עמוד ב׳ / כל הדף",
  });

  return { draggingId, overAmud, overRow, handleProps };
}
