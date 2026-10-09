import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { GripVertical, RotateCcw, Undo2, X } from "lucide-react";
import { db } from "../db";
import { flushAmudSorts, setCardsAmud, type FlushResult } from "../db/amudSort";
import { useSession } from "../db/useSession";
import { useIsAdmin } from "../db/useIsAdmin";
import { AMUD_LABELS, hebrewDaf } from "../features/study/shas";
import { cn } from "../lib/utils";
import type { Card } from "../features/study/types";

type Col = "1" | "2" | "none";
const COLS: { key: Col; title: string; target: string }[] = [
  { key: "1", title: "עמוד א'", target: "לעמוד א'" },
  { key: "none", title: "לא ממוינות", target: "חזרה ללא ממוינות" },
  { key: "2", title: "עמוד ב'", target: "לעמוד ב'" },
];
const colOf = (c: Card): Col => (c.amud === "1" || c.amud === "2" ? c.amud : "none");
const toAmud = (col: Col) => (col === "none" ? null : col);

interface DragState {
  id: string;
  text: string;
  from: Col;
  x: number;
  y: number;
  over: Col | null;
  started: boolean;
  startX: number;
  startY: number;
}

/**
 * מיון שאלות הדף לעמוד א'/ב': גרירה (עכבר ומגע), כפתורים על כל שאלה, ומקשים
 * (1/א — עמוד א', 2/ב — עמוד ב', 0 — ביטול שיוך; Ctrl+Z — ביטול הפעולה האחרונה).
 */
export default function AmudSorter({ masechta, daf, onClose }: { masechta: string; daf: number; onClose: () => void }) {
  const cards = useLiveQuery(
    () => db.cards.where("masechta").equals(masechta).filter((c) => c.daf === String(daf)).toArray(),
    [masechta, daf]
  );
  const session = useSession();
  const admin = useIsAdmin(session);
  const [status, setStatus] = useState<FlushResult | null>(null);
  const [undoStack, setUndoStack] = useState<{ id: string; prev: Col }[][]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  // גלילה לכלי כשהוא נפתח — אחרי שהשאלות נטענו, כדי שהגלילה לא תיקטע בשינוי הגובה
  const rootRef = useRef<HTMLDivElement>(null);
  const loaded = cards !== undefined;
  useEffect(() => {
    if (!loaded) return;
    const t = window.setTimeout(() => rootRef.current?.scrollIntoView({ block: "start" }), 60);
    return () => window.clearTimeout(t);
  }, [loaded]);

  const byCol = useMemo(() => {
    const m: Record<Col, Card[]> = { "1": [], "2": [], none: [] };
    for (const c of cards ?? []) m[colOf(c)].push(c);
    return m;
  }, [cards]);

  const move = async (ids: string[], to: Col) => {
    const list = (cards ?? []).filter((c) => ids.includes(c.id) && colOf(c) !== to);
    if (!list.length) return;
    setUndoStack((s) => [...s.slice(-49), list.map((c) => ({ id: c.id, prev: colOf(c) }))]);
    await setCardsAmud(list.map((c) => c.id), toAmud(to));
    flushAmudSorts().then(setStatus);
  };

  const undo = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    for (const col of ["1", "2", "none"] as Col[]) {
      const ids = last.filter((x) => x.prev === col).map((x) => x.id);
      if (ids.length) await setCardsAmud(ids, toAmud(col));
    }
    flushAmudSorts().then(setStatus);
  };

  // מקשים: על שאלה ממוקדת — שיוך; בכל מקום — ביטול
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        void undo();
        return;
      }
      const el = document.activeElement as HTMLElement | null;
      const id = el?.dataset?.sortCard;
      if (!id || e.ctrlKey || e.metaKey || e.altKey) return;
      const to: Col | null =
        e.key === "1" || e.key === "א" ? "1" : e.key === "2" || e.key === "ב" ? "2" : e.key === "0" || e.key === "Delete" ? "none" : null;
      if (!to) return;
      e.preventDefault();
      // אחרי השיוך — הפוקוס עובר לשאלה הלא ממוינת הבאה, כדי למיין ברצף
      const next = byCol.none.find((c) => c.id !== id);
      void move([id], to).then(() => {
        if (next) document.querySelector<HTMLElement>(`[data-sort-card="${next.id}"]`)?.focus();
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // גרירה בעכבר/מגע — תווית צפה שעוקבת אחרי האצבע ומראה לאן השאלה תיפול
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const started = d.started || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6;
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-sort-col]");
      setDrag({ ...d, x: e.clientX, y: e.clientY, started, over: started ? ((hit?.dataset.sortCol as Col) ?? null) : null });
    };
    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d?.started && d.over && d.over !== d.from) void move([d.id], d.over);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const startDrag = (e: React.PointerEvent, c: Card) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("button") && !t.closest("[data-handle]")) return; // כפתורי השיוך — לחיצה רגילה
    // במגע — רק מהידית, כדי שאפשר יהיה לגלול את הרשימה
    if (e.pointerType !== "mouse" && !t.closest("[data-handle]")) return;
    if (e.pointerType !== "mouse") e.preventDefault(); // בעכבר — הלחיצה גם ממקדת את השאלה למקשים
    setDrag({ id: c.id, text: c.question, from: colOf(c), x: e.clientX, y: e.clientY, over: null, started: false, startX: e.clientX, startY: e.clientY });
  };

  const total = cards?.length ?? 0;
  const left = byCol.none.length;
  const dragging = drag?.started ? drag : null;

  const statusText = !session
    ? "המיון נשמר במכשיר הזה. כדי שיגיע לכל המכשירים ולכל הלומדים — יש להתחבר בחשבון מנהל."
    : !admin
      ? "המיון נשמר במכשיר הזה. רק מנהל יכול לשמור מיון לכל המכשירים."
      : status === "sent" || status === "nothing"
        ? "✓ נשמר לכל המכשירים"
        : status === "no-table"
          ? "נשמר במכשיר. הטבלה המרכזית עוד לא הוקמה — המיון יישלח לכל המכשירים אוטומטית מיד אחרי ההקמה."
          : status === "offline"
            ? "נשמר במכשיר. אין חיבור כרגע — יישלח לכל המכשירים בהזדמנות הבאה."
            : status === "not-admin"
              ? "אין הרשאת מנהל בשרת — המיון נשמר במכשיר הזה בלבד."
              : "כל שינוי נשמר מיד ונשלח לכל המכשירים.";

  return (
    <div ref={rootRef} className="space-y-3 animate-slide-in-down scroll-mt-2" dir="rtl">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-bold text-lg">
            מיון לעמודים — {masechta}, דף {hebrewDaf(daf)}
          </h3>
          <p className="text-sm text-muted-foreground">
            {left === 0 && total > 0 ? "✓ כל השאלות ממוינות" : `נותרו ${left} מתוך ${total} לא ממוינות`} · גרור שאלה לעמוד, או לחץ א'/ב'
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline h-9 rounded-full text-sm" disabled={!undoStack.length} onClick={() => void undo()} title="ביטול הפעולה האחרונה (Ctrl+Z)">
            <Undo2 className="h-4 w-4" /> ביטול
          </button>
          <button className="btn-outline h-9 rounded-full text-sm" onClick={onClose}>
            <X className="h-4 w-4" /> סיום מיון
          </button>
        </div>
      </div>

      {left > 1 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground self-center">כל הלא ממוינות:</span>
          <button className="btn-outline h-8 rounded-full" onClick={() => void move(byCol.none.map((c) => c.id), "1")}>לעמוד א'</button>
          <button className="btn-outline h-8 rounded-full" onClick={() => void move(byCol.none.map((c) => c.id), "2")}>לעמוד ב'</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLS.map(({ key, title }) => {
          const list = byCol[key];
          const isOver = dragging?.over === key && dragging.from !== key;
          return (
            <section
              key={key}
              data-sort-col={key}
              aria-label={title}
              className={cn(
                "rounded-xl border-2 p-2 min-h-[140px] transition-colors flex flex-col gap-2",
                key === "none" ? "order-first md:order-none border-dashed bg-secondary/40" : "bg-card",
                isOver ? "border-gold bg-gold/10 shadow-gold" : key === "none" ? "border-border" : "border-gold/40"
              )}
            >
              <div className="flex items-center justify-between px-1">
                <span className="font-bold text-sm">{title}</span>
                <span className="text-xs rounded-full bg-gold/20 text-gold font-bold px-2 py-0.5">{list.length}</span>
              </div>
              {list.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">{key === "none" ? "אין שאלות לא ממוינות" : "גרור לכאן שאלות"}</p>
              )}
              {list.map((c) => (
                <div
                  key={c.id}
                  data-sort-card={c.id}
                  tabIndex={0}
                  onPointerDown={(e) => startDrag(e, c)}
                  className={cn(
                    "rounded-lg border bg-card p-2 text-sm flex items-start gap-2 shadow-sm select-none outline-none",
                    "focus-visible:ring-2 focus-visible:ring-gold md:cursor-grab",
                    drag?.id === c.id && drag.started && "opacity-40"
                  )}
                >
                  <span data-handle className="touch-none cursor-grab text-muted-foreground pt-0.5 shrink-0" aria-hidden>
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <span className="flex-1 leading-snug line-clamp-3">{c.question}</span>
                  <span className="flex flex-col gap-1 shrink-0">
                    {key !== "1" && (
                      <button className="h-7 w-7 rounded-md border border-gold/50 font-bold text-xs hover:bg-gold/15" title="לעמוד א'" onClick={() => void move([c.id], "1")}>א'</button>
                    )}
                    {key !== "2" && (
                      <button className="h-7 w-7 rounded-md border border-gold/50 font-bold text-xs hover:bg-gold/15" title="לעמוד ב'" onClick={() => void move([c.id], "2")}>ב'</button>
                    )}
                    {key !== "none" && (
                      <button className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-secondary" title="ביטול השיוך" onClick={() => void move([c.id], "none")}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <p className={cn("text-xs text-center", status === "sent" || status === "nothing" ? "text-gold font-medium" : "text-muted-foreground")}>{statusText}</p>
      <p className="text-[11px] text-center text-muted-foreground">
        מקשים: לחץ על שאלה ואז 1 או א — {AMUD_LABELS["1"]}, 2 או ב — {AMUD_LABELS["2"]}, 0 — ביטול שיוך
      </p>

      {/* התווית הצפה בזמן גרירה */}
      {dragging && (
        <div
          className="fixed z-[60] pointer-events-none max-w-[260px] rounded-lg border-2 border-gold bg-card shadow-gold px-3 py-2 text-sm"
          style={{ left: Math.max(8, Math.min(dragging.x + 14, window.innerWidth - 272)), top: Math.min(dragging.y + 14, window.innerHeight - 90) }}
          dir="rtl"
        >
          <p className="line-clamp-2 leading-snug">{dragging.text}</p>
          <p className={cn("mt-1 text-xs font-bold", dragging.over && dragging.over !== dragging.from ? "text-gold" : "text-muted-foreground")}>
            {dragging.over && dragging.over !== dragging.from
              ? `שחרר ${COLS.find((x) => x.key === dragging.over)!.target}`
              : "גרור לעמוד א' או לעמוד ב'"}
          </p>
        </div>
      )}
    </div>
  );
}
