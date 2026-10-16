import { useRef, useState, type PointerEvent } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ColorFavoritesRowProps {
  favorites: string[];
  currentColor?: string;
  onAddCurrent?: () => void;
  onPick?: (color: string) => void;
  onRemove: (color: string) => void;
  onMove: (from: number, to: number) => void;
  emptyText?: string;
  className?: string;
}

export function ColorFavoritesRow({
  favorites,
  currentColor,
  onAddCurrent,
  onPick,
  onRemove,
  onMove,
  emptyText = "אין צבעים מועדפים עדיין",
  className,
}: ColorFavoritesRowProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const movedRef = useRef(false);

  const startDrag = (index: number, e: PointerEvent<HTMLButtonElement>) => {
    setDragIndex(index);
    movedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleEnter = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    movedRef.current = true;
    onMove(dragIndex, index);
    setDragIndex(index);
  };

  const stopDrag = () => {
    setDragIndex(null);
    window.setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">צבעים מועדפים</span>
        {onAddCurrent && currentColor && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={onAddCurrent}
          >
            <Plus className="h-3 w-3" /> הוסף נוכחי
          </Button>
        )}
      </div>

      {favorites.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {favorites.map((color, index) => (
            <div
              key={color}
              className="group relative h-6 w-9"
            >
              <button
                type="button"
                title={`${color} (גרור כדי לשנות סדר)`}
                className={cn(
                  "flex h-6 w-9 items-center justify-center rounded border border-border/60 shadow-sm touch-none",
                  dragIndex === index && "ring-2 ring-gold/70",
                )}
                style={{ backgroundColor: color }}
                onPointerDown={(e) => startDrag(index, e)}
                onPointerEnter={() => handleEnter(index)}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
                onClick={() => {
                  if (movedRef.current) return;
                  onPick?.(color);
                }}
              >
                <span className="absolute inset-y-0 left-0 flex items-center px-0.5 text-black/65">
                  <GripVertical className="h-3 w-3" />
                </span>
                <span className="sr-only">{color}</span>
              </button>
              <button
                type="button"
                className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove(color);
                }}
                title="הסר מהמועדפים"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
