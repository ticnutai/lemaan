import React, { useEffect, useRef, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FloatingPanelProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** רוחב התחלתי (px) */
  initialWidth?: number;
  /** גובה התחלתי (px) */
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  /** מאפשר סגירה עם Escape (default true) */
  closeOnEsc?: boolean;
  /** dir של הפנל (default rtl) */
  dir?: "rtl" | "ltr";
}

type EdgeKey = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const EDGE_CURSORS: Record<EdgeKey, string> = {
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
  ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize",
};

let zCounter = 1000;

/**
 * חלון צף לא-חוסם (non-modal):
 * - אפשר לגרור עם הכותרת
 * - 8 ידיות הגדלה (פינות + צדדים)
 * - Escape לסגירה
 * - אנימציית פתיחה/סגירה חלקה
 * - לא חוסם את הרקע (ניתן ללחוץ ולגלול ברקע)
 */
export function FloatingPanel({
  open, onOpenChange, title, children,
  initialWidth = 520, initialHeight = 540,
  minWidth = 320, minHeight = 240,
  className, closeOnEsc = true, dir = "rtl",
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: initialWidth, h: initialHeight });
  const [zIndex, setZIndex] = useState<number>(() => ++zCounter);

  // ערך התחלה (מרכז המסך)
  useEffect(() => {
    if (open && !mounted) {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
      const vh = typeof window !== "undefined" ? window.innerHeight : 768;
      const w = Math.min(initialWidth, vw - 32);
      const h = Math.min(initialHeight, vh - 32);
      setSize({ w, h });
      setPos({ x: Math.max(16, (vw - w) / 2), y: Math.max(16, (vh - h) / 2) });
      setMounted(true);
      setZIndex(++zCounter);
      // טריגר אנימציית כניסה ב-frame הבא
      requestAnimationFrame(() => setVisible(true));
    } else if (!open && mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 180);
      return () => clearTimeout(t);
    }
  }, [open, mounted, initialWidth, initialHeight]);

  // Escape לסגירה
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onOpenChange(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEsc, onOpenChange]);

  const bringToFront = useCallback(() => setZIndex(++zCounter), []);

  // === Drag (header) ===
  const startDrag = useCallback((e: React.PointerEvent) => {
    if (!pos) return;
    bringToFront();
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const orig = { ...pos };
    const onMove = (ev: PointerEvent) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const newX = Math.min(vw - 64, Math.max(-Math.max(0, size.w - 80), orig.x + (ev.clientX - startX)));
      const newY = Math.min(vh - 32, Math.max(0, orig.y + (ev.clientY - startY)));
      setPos({ x: newX, y: newY });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [pos, size.w, bringToFront]);

  // === Resize ===
  const startResize = useCallback((edge: EdgeKey) => (e: React.PointerEvent) => {
    if (!pos) return;
    bringToFront();
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const orig = { x: pos.x, y: pos.y, w: size.w, h: size.h };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let { x, y, w, h } = orig;
      if (edge.includes("e")) w = Math.max(minWidth, orig.w + dx);
      if (edge.includes("s")) h = Math.max(minHeight, orig.h + dy);
      if (edge.includes("w")) {
        w = Math.max(minWidth, orig.w - dx);
        x = orig.x + (orig.w - w);
      }
      if (edge.includes("n")) {
        h = Math.max(minHeight, orig.h - dy);
        y = orig.y + (orig.h - h);
      }
      // הגבלה לגבולות החלון
      const vw = window.innerWidth, vh = window.innerHeight;
      w = Math.min(w, vw - 8);
      h = Math.min(h, vh - 8);
      setPos({ x, y });
      setSize({ w, h });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [pos, size, minWidth, minHeight, bringToFront]);

  if (!mounted || !pos) return null;

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      dir={dir}
      onPointerDown={bringToFront}
      style={{
        position: "fixed",
        left: pos.x, top: pos.y, width: size.w, height: size.h,
        zIndex,
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1) translateY(0)" : "scale(0.97) translateY(6px)",
        transition: "opacity 160ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)",
      }}
      className={cn(
        "rounded-xl border-2 border-gold/40 bg-background flex flex-col overflow-hidden",
        "pointer-events-auto",
        className,
      )}
    >
      {/* Header — drag handle */}
      <div
        onPointerDown={startDrag}
        className="select-none flex items-center justify-between gap-2 px-3 py-2 border-b border-gold/30 bg-gradient-navy text-primary-foreground cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 text-sm font-semibold truncate">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold/80" />
          {title}
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onOpenChange(false)}
          className="rounded-md p-1 hover:bg-white/10 transition-colors"
          aria-label="סגור"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {children}
      </div>

      {/* Resize handles */}
      <ResizeHandle edge="n"  onStart={startResize("n")}  />
      <ResizeHandle edge="s"  onStart={startResize("s")}  />
      <ResizeHandle edge="e"  onStart={startResize("e")}  />
      <ResizeHandle edge="w"  onStart={startResize("w")}  />
      <ResizeHandle edge="ne" onStart={startResize("ne")} />
      <ResizeHandle edge="nw" onStart={startResize("nw")} />
      <ResizeHandle edge="se" onStart={startResize("se")} />
      <ResizeHandle edge="sw" onStart={startResize("sw")} />
    </div>,
    document.body,
  );
}

interface RHProps { edge: EdgeKey; onStart: (e: React.PointerEvent) => void; }
function ResizeHandle({ edge, onStart }: RHProps) {
  const styles: React.CSSProperties = { position: "absolute", cursor: EDGE_CURSORS[edge] };
  const T = 6; // thickness
  const C = 14; // corner size
  switch (edge) {
    case "n": Object.assign(styles, { top: 0, left: C, right: C, height: T }); break;
    case "s": Object.assign(styles, { bottom: 0, left: C, right: C, height: T }); break;
    case "e": Object.assign(styles, { top: C, bottom: C, right: 0, width: T }); break;
    case "w": Object.assign(styles, { top: C, bottom: C, left: 0, width: T }); break;
    case "nw": Object.assign(styles, { top: 0, left: 0, width: C, height: C }); break;
    case "ne": Object.assign(styles, { top: 0, right: 0, width: C, height: C }); break;
    case "sw": Object.assign(styles, { bottom: 0, left: 0, width: C, height: C }); break;
    case "se": Object.assign(styles, { bottom: 0, right: 0, width: C, height: C }); break;
  }
  // אינדיקטור פינתי קטן בפינה תחתונה-ימנית
  const isCornerSE = edge === "se";
  return (
    <div
      onPointerDown={onStart}
      style={styles}
      className={cn(
        "z-10",
        isCornerSE && "after:content-[''] after:absolute after:bottom-1 after:right-1 after:w-2 after:h-2 after:border-b-2 after:border-r-2 after:border-gold/60 after:rounded-sm",
      )}
    />
  );
}
