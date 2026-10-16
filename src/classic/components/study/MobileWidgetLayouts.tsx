import { ReactNode, useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Sparkles, Flame, ListChecks, Target } from "lucide-react";
import type { WidgetConfig } from "@/lib/study/types";
import { useStudy } from "@/lib/study/store";
import { isDue } from "@/lib/study/srs";
import { dateKey, todayKey } from "@/lib/study/goals";

interface RenderItem {
  cfg: WidgetConfig;
  label: string;
  node: ReactNode;
}

/* ─────────────────── Premium Stack ───────────────────
   Pure vertical, no extra header strips (widget cards already have
   their own titles). Tight spacing, full-width, zero horizontal scroll. */
export function PremiumStackLayout({ items }: { items: RenderItem[] }) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {items.map((it, i) => (
        <section
          key={it.cfg.id}
          className="w-full min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-300 [&_*]:max-w-full"
          style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
        >
          <div className="rounded-2xl shadow-[0_4px_18px_-10px_hsl(var(--primary)/0.25)] ring-1 ring-gold/15 overflow-hidden">
            {it.node}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ─────────────────── Carousel ─────────────────── */
export function CarouselLayout({ items }: { items: RenderItem[] }) {
  const [idx, setIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const total = items.length;

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      const newIdx = Math.min(total - 1, Math.max(0, Math.abs(i)));
      setIdx(newIdx);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [total]);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const target = i * el.clientWidth;
    el.scrollTo({ left: target * (getComputedStyle(el).direction === "rtl" ? -1 : 1), behavior: "smooth" });
    setIdx(i);
  };

  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-2 w-full" dir="rtl">
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          onClick={() => goTo(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="flex items-center justify-center h-9 w-9 rounded-full border border-gold/50 bg-card text-navy shadow disabled:opacity-30 shrink-0"
          aria-label="הקודם"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
          <span className="font-display text-sm font-bold truncate max-w-full">{items[idx]?.label}</span>
          <div className="flex items-center gap-1 max-w-full overflow-hidden">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`עבור לווידג'ט ${i + 1}`}
                className={cn(
                  "transition-all rounded-full shrink-0",
                  i === idx ? "h-1.5 w-6 bg-gold" : "h-1.5 w-1.5 bg-gold/30",
                )}
              />
            ))}
          </div>
        </div>
        <button
          onClick={() => goTo(Math.min(total - 1, idx + 1))}
          disabled={idx === total - 1}
          className="flex items-center justify-center h-9 w-9 rounded-full border border-gold/50 bg-card text-navy shadow disabled:opacity-30 shrink-0"
          aria-label="הבא"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={trackRef}
        className="flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide gap-2 w-full"
        style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
      >
        {items.map((it) => (
          <div key={it.cfg.id} className="snap-center shrink-0 w-full min-w-0">
            <div className="rounded-2xl shadow-[0_4px_18px_-10px_hsl(var(--primary)/0.3)] ring-1 ring-gold/20 overflow-hidden [&_*]:max-w-full">
              {it.node}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────── Magazine ───────────────────
   Hero גדול ואז שורות של שניים (אך מציג בעמודה אחת אם המסך צר מאוד). */
export function MagazineLayout({ items }: { items: RenderItem[] }) {
  if (items.length === 0) return null;
  const [hero, ...rest] = items;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Hero */}
      <section className="relative w-full min-w-0">
        <div className="flex items-center gap-2 mb-1.5 px-0.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-l from-gold to-gold/70 text-navy px-2.5 py-0.5 text-[10px] font-bold shadow shrink-0">
            <Sparkles className="h-3 w-3" /> מומלץ
          </span>
        </div>
        <div className="rounded-2xl shadow-[0_8px_28px_-12px_hsl(var(--primary)/0.4)] ring-2 ring-gold/30 overflow-hidden [&_*]:max-w-full">
          {hero.node}
        </div>
      </section>

      {/* Rest in 2-col (full-width fallback for size=full) */}
      <div className="grid grid-cols-2 gap-2 w-full">
        {rest.map((it) => (
          <div
            key={it.cfg.id}
            className={cn(
              "rounded-2xl shadow-md ring-1 ring-gold/15 overflow-hidden min-w-0 [&_*]:max-w-full",
              it.cfg.size === "full" && "col-span-2",
            )}
          >
            {it.node}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────── Focused Dashboard ───────────────────
   Mobile-first "פוקוס דשבורד": רצועת מצב יומית (סטריק / חזרות בתור / יעד)
   ולאחריה הווידג'טים בעמודה אחת, כל אחד בכרטיס רחב-מסך עם מסגרת זהב
   מוקפדת. ללא דלילה אופקית בכלל, היררכיה ברורה והגשה מקצועית. */
function FocusedTodayStrip() {
  const { state } = useStudy();
  const today = todayKey();

  const dueCount = useMemo(() => {
    const srs = state.cards.filter(isDue).length;
    const shas = (state.shasReviews ?? []).filter((r) => !r.isInitial && r.dueDate <= today && !r.doneAt).length;
    const plan = (state.planReviews ?? []).filter((r) => r.dueDate <= today && !r.doneAt).length;
    return srs + shas + plan;
  }, [state.cards, state.shasReviews, state.planReviews, today]);

  const doneTodayCount = useMemo(() => {
    const logs = state.logs ?? [];
    const todaysLogs = logs.filter((l) => dateKey(l.at) === today);
    return new Set(todaysLogs.map((l) => l.cardId)).size;
  }, [state.logs, today]);

  const streak = useMemo(() => {
    const logs = state.logs ?? [];
    if (logs.length === 0) return 0;
    const days = new Set(logs.map((l) => dateKey(l.at)));
    let count = 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // If nothing today, allow the streak to start from yesterday
    if (!days.has(dateKey(d.getTime()))) d.setDate(d.getDate() - 1);
    while (days.has(dateKey(d.getTime()))) {
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [state.logs]);

  const tiles = [
    {
      icon: Flame,
      label: "רצף ימים",
      value: streak,
      from: "focus-streak-from",
      to: "focus-streak-to",
      iconToken: "focus-streak-icon",
      iconBorderToken: "focus-streak-icon-border",
    },
    {
      icon: ListChecks,
      label: "חזרות בתור",
      value: dueCount,
      from: "focus-due-from",
      to: "focus-due-to",
      iconToken: "focus-due-icon",
      iconBorderToken: "focus-due-icon-border",
    },
    {
      icon: Target,
      label: "נלמדו היום",
      value: doneTodayCount,
      from: "focus-learned-from",
      to: "focus-learned-to",
      iconToken: "focus-learned-icon",
      iconBorderToken: "focus-learned-icon-border",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 w-full" dir="rtl">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="relative rounded-2xl border-2 border-gold/40 p-3 shadow-[0_4px_18px_-10px_hsl(var(--primary)/0.3)] overflow-hidden"
          style={{
            backgroundImage: `linear-gradient(135deg, hsl(var(--${t.from}) / 0.16), hsl(var(--${t.to}) / 0.12))`,
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-card/80 border"
              style={{
                color: `hsl(var(--${t.iconToken}))`,
                borderColor: `hsl(var(--${t.iconBorderToken}))`,
              }}
            >
              <t.icon className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="font-display text-2xl font-bold leading-none text-foreground">{t.value}</div>
          <div className="text-[10px] font-semibold text-muted-foreground mt-1 leading-tight">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

export function FocusedDashboardLayout({ items }: { items: RenderItem[] }) {
  return (
    <div className="flex flex-col gap-4 w-full" dir="rtl">
      <FocusedTodayStrip />

      <div className="flex flex-col gap-3 w-full">
        {items.map((it, i) => (
          <section
            key={it.cfg.id}
            className="w-full min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-300 [&_*]:max-w-full"
            style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
          >
            <div className="rounded-2xl border-2 border-gold/30 bg-card shadow-[0_6px_22px_-12px_hsl(var(--primary)/0.35)] overflow-hidden">
              {it.node}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

