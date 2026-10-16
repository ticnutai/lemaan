import { useEffect, useLayoutEffect, useRef, useState, ReactNode } from "react";

interface Props {
  enabled: boolean;
  minScale?: number;
  /** אם נמסר — משתמש בסקייל ידני קבוע במקום חישוב אוטומטי */
  manualScale?: number;
  children: ReactNode;
  className?: string;
}

/**
 * עוטף תוכן ומחיל transform: scale כך שהתוכן ייכנס לתוך הקונטיינר ההורה
 * ללא גלילה (אנכית/אופקית). אם הסקייל יורד מתחת ל-minScale — נופל לגלילה רגילה.
 */
export function FitToContainer({ enabled, minScale = 0.3, manualScale, children, className }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    if (!enabled) { setScale(1); setOverflow(false); return; }
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    // מצב ידני: החל סקייל קבוע ללא חישוב אוטומטי
    if (typeof manualScale === "number") {
      const s = Math.max(0.3, Math.min(1, manualScale));
      setOverflow(false);
      setScale(s);
      inner.style.transform = `scale(${s})`;
      inner.style.transformOrigin = "top right";
      inner.style.width = `${100 / s}%`;
      inner.style.height = `${100 / s}%`;
      return;
    }

    const compute = () => {
      // אפס סקייל לצורך מדידה אמיתית
      inner.style.transform = "none";
      inner.style.width = "100%";
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      const iw = inner.scrollWidth;
      const ih = inner.scrollHeight;
      if (!ow || !oh || !iw || !ih) return;
      const s = Math.min(1, ow / iw, oh / ih);
      if (s < minScale) {
        setOverflow(true);
        setScale(1);
        inner.style.transform = "none";
        inner.style.width = "100%";
      } else {
        setOverflow(false);
        setScale(s);
        inner.style.transform = `scale(${s})`;
        inner.style.transformOrigin = "top right";
        inner.style.width = `${100 / s}%`;
      }
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(outer);
    ro.observe(inner);
    const mo = new MutationObserver(compute);
    mo.observe(inner, { childList: true, subtree: true, characterData: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [enabled, minScale, manualScale, children]);

  if (!enabled) {
    return <div className={className} style={{ height: "100%", overflow: "auto" }}>{children}</div>;
  }

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ height: "100%", width: "100%", overflow: overflow ? "auto" : "hidden" }}
    >
      <div ref={innerRef} style={{ transformOrigin: "top right" }} data-fit-scale={scale}>
        {children}
      </div>
    </div>
  );
}