import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface GridPickerPopoverProps {
  value: string;
  placeholder: string;
  options: Option[];
  onSelect: (value: string) => void;
  columns?: number;
  className?: string;
}

/**
 * A non-blocking grid picker that opens a fixed-position portal dropdown
 * showing all options in a multi-column grid — no scrolling list, no
 * Dialog/Popover pointer-event conflicts.
 */
export function GridPickerPopover({
  value,
  placeholder,
  options,
  onSelect,
  columns = 5,
  className,
}: GridPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, minWidth: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Flip to above if not enough space below
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedHeight = Math.ceil(options.length / columns) * 40 + 16;
      const top = spaceBelow < estimatedHeight ? rect.top - estimatedHeight - 4 : rect.bottom + 4;
      setCoords({ top, left: rect.left, minWidth: rect.width });
    }
    setOpen((v) => !v);
  };

  // Close on outside mousedown (fires before click, avoids Dialog capturing)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            minWidth: Math.max(coords.minWidth, 180),
            zIndex: 9999,
          }}
          className="rounded-md border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            dir="rtl"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                // onMouseDown fires before Dialog's event handlers; preventDefault
                // stops focus leaving the dialog, ensuring no pointer-event conflicts
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "rounded px-2 py-1.5 text-sm text-center transition-colors hover:bg-gold/20 hover:text-foreground",
                  opt.value === value
                    ? "bg-gold/30 font-semibold text-foreground border border-gold/60"
                    : "text-muted-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={(e) => {
          e.preventDefault(); // keep focus in dialog
          toggle();
        }}
        className={cn(
          "flex items-center justify-between gap-1 rounded-lg border-2 border-gold/40 bg-card px-2 py-1 text-sm text-right transition-colors hover:border-gold/70 focus:outline-none focus:border-gold",
          !selected && "text-muted-foreground",
          className,
        )}
        dir="rtl"
      >
        <span>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
      </button>
      {dropdown}
    </>
  );
}
