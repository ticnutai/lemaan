import { useState, ReactNode, useCallback, useMemo, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStudy } from "@/lib/study/store";
import { cn } from "@/lib/utils";
import { mergeLayout, applyWidgetBlocklist, WIDGET_DEFS } from "@/lib/study/widgetLayout";
import { useResolvedFeatureBlocklist } from "@/lib/study/featureBlocklist";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { isProfileBMode } from "@/lib/study/profileBMode";
import type { WidgetConfig, WidgetLayout } from "@/lib/study/types";
import { useMobileLayoutMode, resolveMobileMode } from "@/lib/study/mobileLayoutMode";
import { usePrompt } from "@/hooks/usePrompt";
import { toast } from "@/hooks/use-toast";
import { PremiumStackLayout, CarouselLayout, MagazineLayout, FocusedDashboardLayout } from "./MobileWidgetLayouts";
import {
  GripVertical,
  EyeOff,
  Eye,
  LayoutPanelLeft,
  LayoutPanelTop,
  Pencil,
  Check,
  RotateCcw,
  WandSparkles,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2,
  ChevronsLeftRight,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";

const MIN_WIDGET_HEIGHT = 150;

function normalizeWidgetTitle(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

// Drag handle that appears on the right edge — drags left/right to toggle half ↔ full width
function ResizeHandleRight({ size, onSetSize }: { size: "half" | "full"; onSetSize: (s: "half" | "full") => void }) {
  const startX = useRef(0);
  const startSize = useRef<"half" | "full">("half");

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startSize.current = size;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const delta = e.clientX - startX.current;
    if (startSize.current === "half" && delta > 50) {
      onSetSize("full");
      startX.current = e.clientX;
      startSize.current = "full";
    } else if (startSize.current === "full" && delta < -50) {
      onSetSize("half");
      startX.current = e.clientX;
      startSize.current = "half";
    }
  };

  return (
    <div
      title={size === "half" ? "גרור ימינה להרחיב" : "גרור שמאלה להצר"}
      className="absolute inset-y-0 right-0 w-5 z-30 flex items-center justify-end cursor-ew-resize select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => (e.target as HTMLElement).releasePointerCapture(e.pointerId)}
    >
      <div className="flex flex-col items-center gap-0.5 mr-0.5">
        <ChevronsLeftRight className="h-3.5 w-3.5 text-gold/70 hover:text-gold" />
        <div className="w-1 h-8 rounded-full bg-gold/50 hover:bg-gold transition-colors" />
      </div>
    </div>
  );
}

function ResizeHandleLeft({ size, onSetSize }: { size: "half" | "full"; onSetSize: (s: "half" | "full") => void }) {
  const startX = useRef(0);
  const startSize = useRef<"half" | "full">("half");

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startSize.current = size;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const delta = e.clientX - startX.current;
    if (startSize.current === "half" && delta < -50) {
      onSetSize("full");
      startX.current = e.clientX;
      startSize.current = "full";
    } else if (startSize.current === "full" && delta > 50) {
      onSetSize("half");
      startX.current = e.clientX;
      startSize.current = "half";
    }
  };

  return (
    <div
      title={size === "half" ? "גרור שמאלה להרחיב" : "גרור ימינה להצר"}
      className="absolute inset-y-0 left-0 w-5 z-30 flex items-center justify-start cursor-ew-resize select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => (e.target as HTMLElement).releasePointerCapture(e.pointerId)}
    >
      <div className="flex flex-col items-center gap-0.5 ml-0.5">
        <ChevronsLeftRight className="h-3.5 w-3.5 text-gold/70 hover:text-gold" />
        <div className="w-1 h-8 rounded-full bg-gold/50 hover:bg-gold transition-colors" />
      </div>
    </div>
  );
}

// Drag handle that appears on the bottom edge — drags up/down to resize height
function ResizeHandleBottom({ onSetHeight }: { onSetHeight: (h: number | undefined) => void }) {
  const startY = useRef(0);
  const startH = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startY.current = e.clientY;
    startH.current = (e.currentTarget.parentElement as HTMLElement)?.offsetHeight ?? 300;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const delta = e.clientY - startY.current;
    const newH = Math.max(MIN_WIDGET_HEIGHT, startH.current + delta);
    onSetHeight(newH);
  };

  return (
    <div
      title="גרור למעלה/למטה לשנות גובה"
      className="absolute inset-x-0 bottom-0 h-5 z-30 flex justify-center items-end cursor-ns-resize select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => (e.target as HTMLElement).releasePointerCapture(e.pointerId)}
    >
      <div className="flex flex-col items-center gap-0.5 mb-0.5">
        <div className="h-1 w-10 rounded-full bg-gold/50 hover:bg-gold transition-colors" />
        <ChevronsUpDown className="h-3.5 w-3.5 text-gold/70 hover:text-gold" />
      </div>
    </div>
  );
}

function ResizeHandleTop({ onSetHeight }: { onSetHeight: (h: number | undefined) => void }) {
  const startY = useRef(0);
  const startH = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startY.current = e.clientY;
    startH.current = (e.currentTarget.parentElement as HTMLElement)?.offsetHeight ?? 300;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const delta = e.clientY - startY.current;
    const newH = Math.max(MIN_WIDGET_HEIGHT, startH.current - delta);
    onSetHeight(newH);
  };

  return (
    <div
      title="גרור למעלה/למטה לשנות גובה"
      className="absolute inset-x-0 top-0 h-5 z-30 flex justify-center items-start cursor-ns-resize select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => (e.target as HTMLElement).releasePointerCapture(e.pointerId)}
    >
      <div className="flex flex-col items-center gap-0.5 mt-0.5">
        <ChevronsUpDown className="h-3.5 w-3.5 text-gold/70 hover:text-gold" />
        <div className="h-1 w-10 rounded-full bg-gold/50 hover:bg-gold transition-colors" />
      </div>
    </div>
  );
}

interface SortableWidgetProps {
  cfg: WidgetConfig;
  editMode: boolean;
  label: string;
  children: ReactNode;
  canMovePrev: boolean;
  canMoveNext: boolean;
  onMovePrev: () => void;
  onMoveNext: () => void;
  onSetSize: (size: "half" | "full") => void;
  onSetHeight: (h: number | undefined) => void;
  onHide: () => void;
  onToggleCollapse: () => void;
  quickLayoutOpen: boolean;
  onToggleQuickLayout: () => void;
}

function SortableWidget({ cfg, editMode, label, children, canMovePrev, canMoveNext, onMovePrev, onMoveNext, onSetSize, onSetHeight, onHide, onToggleCollapse, quickLayoutOpen, onToggleQuickLayout }: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cfg.id, disabled: !editMode });
  const collapsed = !!cfg.collapsed;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    gridColumn: cfg.size === "full" ? "1 / -1" : undefined,
    minHeight: collapsed ? undefined : (cfg.height ? `${cfg.height}px` : (editMode ? "auto" : undefined)),
  };
  if (!cfg.visible) return null;

  return (
    <div ref={setNodeRef} style={style} className={cn("relative group", !collapsed && (editMode ? "pt-10" : "pt-8"))}>
      {editMode && !collapsed && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-0 right-0 left-0 z-20 flex items-center justify-between gap-2 px-3 py-1.5 rounded-t-xl bg-gradient-to-l from-gold/80 to-gold/60 text-navy cursor-grab active:cursor-grabbing touch-none shadow-md border-b-2 border-gold animate-pulse-slow"
          title="גרור כדי לסדר מחדש את הווידג'ט"
        >
          <span className="text-[11px] font-bold opacity-80 shrink-0">גרור לסידור</span>
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <span className="font-display text-xs font-semibold truncate min-w-0">{label}</span>
            <GripVertical className="h-4 w-4 shrink-0" />
          </div>
        </div>
      )}
      {editMode && !collapsed && <div className="absolute inset-0 top-10 z-10 rounded-b-xl border-2 border-t-0 border-dashed border-gold/60 pointer-events-none" />}
      {editMode && !collapsed && (
        <>
          <ResizeHandleLeft size={cfg.size} onSetSize={onSetSize} />
          <ResizeHandleRight size={cfg.size} onSetSize={onSetSize} />
          <ResizeHandleTop onSetHeight={onSetHeight} />
          <ResizeHandleBottom onSetHeight={onSetHeight} />
        </>
      )}

      {/* Hover-only collapse / expand toggle — always available, even outside edit mode */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleCollapse}
              aria-label={collapsed ? `הרחב "${label}"` : `מזער "${label}"`}
              className={cn(
                "absolute left-2 z-30 flex items-center justify-center h-7 w-7 rounded-lg border border-gold/40 bg-background/95 backdrop-blur shadow text-muted-foreground hover:text-gold transition-opacity",
                collapsed ? "top-1" : (editMode ? "top-2" : "top-0"),
                collapsed
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 delay-0 group-hover:delay-700",
              )}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{collapsed ? "הרחב" : "מזער"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Quick-layout button — visible on hover in normal (non-edit) mode */}
      {!editMode && !collapsed && (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToggleQuickLayout()}
                  title="גודל ומיקום"
                  className={cn(
                    "absolute left-10 top-0 z-30 flex items-center justify-center h-7 w-7 rounded-lg border border-gold/40 bg-background/95 backdrop-blur shadow text-muted-foreground hover:text-gold transition-opacity",
                    quickLayoutOpen ? "opacity-100 text-gold" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 delay-0 group-hover:delay-700",
                  )}
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">גודל ומיקום</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {quickLayoutOpen && (
            <div className="absolute top-8 left-2 z-40 flex items-center gap-1 bg-background/95 backdrop-blur rounded-xl border border-gold/40 shadow-lg px-1.5 py-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => { onMovePrev(); onToggleQuickLayout(); }} disabled={!canMovePrev} className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  </TooltipTrigger>
                  <TooltipContent>הזז למעלה</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => { onMoveNext(); onToggleQuickLayout(); }} disabled={!canMoveNext} className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  </TooltipTrigger>
                  <TooltipContent>הזז למטה</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => { onSetSize(cfg.size === "full" ? "half" : "full"); onToggleQuickLayout(); }} className="text-muted-foreground hover:text-gold p-1">{cfg.size === "full" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
                  </TooltipTrigger>
                  <TooltipContent>{cfg.size === "full" ? "הפוך לחצי רוחב" : "הפוך לרוחב מלא"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => { onHide(); onToggleQuickLayout(); }} className="text-muted-foreground hover:text-destructive p-1"><EyeOff className="h-4 w-4" /></button>
                  </TooltipTrigger>
                  <TooltipContent>הסתר "{label}"</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </>
      )}

      {editMode && !collapsed && (
        <div className="absolute top-12 right-2 z-20 flex items-center gap-1 bg-background/95 backdrop-blur rounded-xl border border-gold/40 shadow px-1.5 py-1">
          <button
            onClick={onMovePrev}
            disabled={!canMovePrev}
            className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"
            aria-label="העלה למעלה"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            onClick={onMoveNext}
            disabled={!canMoveNext}
            className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"
            aria-label="הורד למטה"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => onSetSize(cfg.size === "full" ? "half" : "full")} className="text-muted-foreground hover:text-gold p-1" aria-label="שנה גודל">
                  {cfg.size === "full" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{cfg.size === "full" ? "הפוך לחצי רוחב" : "הפוך לרוחב מלא"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onHide} className="text-muted-foreground hover:text-destructive p-1" aria-label="הסתר">
                  <EyeOff className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>הסתר "{label}"</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {editMode && (
        <div className="absolute bottom-2 left-2 z-20 flex items-center gap-2">
          <button
            onClick={() => onSetSize("half")}
            className="flex items-center gap-1 rounded-lg border border-gold/40 bg-background/95 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            aria-label="הקטן לחצי"
          >
            <LayoutPanelLeft className="h-3.5 w-3.5" />
            הקטן
          </button>
          <button
            onClick={() => onSetSize("full")}
            className="flex items-center gap-1 rounded-lg border border-gold/40 bg-background/95 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            aria-label="הגדל לרוחב מלא"
          >
            <LayoutPanelTop className="h-3.5 w-3.5" />
            הגדל
          </button>
        </div>
      )}
      {collapsed ? (
        <button
          onClick={onToggleCollapse}
          title={`הרחב "${label}"`}
          className="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-gold/40 bg-card px-3 py-2 text-right hover:bg-secondary/40 transition-colors"
        >
          <ChevronDown className="h-4 w-4 text-gold shrink-0" />
          <span className="font-display text-sm font-semibold truncate min-w-0 flex-1 text-right">{label}</span>
        </button>
      ) : (
        children
      )}
    </div>
  );
}

function DragOverlayItem({ label }: { label: string }) {
  return (
    <div className="rounded-xl border-2 border-gold bg-card shadow-lg px-6 py-4 opacity-90 flex items-center gap-2 font-medium text-foreground">
      <GripVertical className="h-4 w-4 text-gold" />
      {label}
    </div>
  );
}

interface SortableManagerRowProps {
  cfg: WidgetConfig;
  label: string;
  draftTitle: string;
  onDraftChange: (value: string) => void;
  onCommitTitle: () => void;
  onToggleVisible: (next: boolean) => void;
}

function SortableManagerRow({ cfg, label, draftTitle, onDraftChange, onCommitTitle, onToggleVisible }: SortableManagerRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cfg.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-card p-3 space-y-2",
        cfg.visible ? "border-gold/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="h-8 w-8 shrink-0 rounded-lg border border-gold/40 bg-background text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
            title="גרור לשינוי סדר"
            aria-label="גרור לשינוי סדר"
          >
            <GripVertical className="h-4 w-4 mx-auto" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{label}</p>
            <p className="text-[11px] text-muted-foreground truncate">{cfg.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">הצג</span>
          <Switch checked={cfg.visible} onCheckedChange={onToggleVisible} />
        </div>
      </div>
      <Input
        value={draftTitle}
        onChange={(e) => onDraftChange(e.target.value)}
        onBlur={onCommitTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommitTitle();
          }
        }}
        className="h-9"
        placeholder="שם מותאם לווידג׳ט"
      />
    </div>
  );
}

interface WidgetGridProps {
  tabId: string;
  widgetMap: Record<string, ReactNode>;
  inlineDrag?: boolean;
  lockEditing?: boolean;
  /** Widgets that belong to another workflow and must not appear on this page. */
  excludedWidgetIds?: readonly string[];
}

export function WidgetGrid({ tabId, widgetMap, inlineDrag = true, lockEditing = false, excludedWidgetIds = [] }: WidgetGridProps) {
  const { search } = useLocation();
  const { state, setWidgetLayout } = useStudy();
  const isMobile = useIsMobile();
  const [editMode, setEditMode] = useState(false);
  const [quickLayoutId, setQuickLayoutId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [managerActiveId, setManagerActiveId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [showHiddenTray, setShowHiddenTray] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const editingLocked = lockEditing || isProfileBMode();

  // Same lock used for the sidebar/tabs config and the settings page — entering
  // layout-edit mode, the widget manager, auto-arrange, reset, or restoring a
  // hidden widget all go through it too so a stray click can't rearrange the
  // dashboard.
  const SETTINGS_PW = "543211";
  const { prompt: promptText, dialog: promptDialog } = usePrompt();
  const requireSettingsAuth = async (): Promise<boolean> => {
    try {
      if (sessionStorage.getItem("settings-unlocked") === "1") return true;
    } catch { /* ignore */ }
    const input = await promptText("לעריכת הפריסה יש להזין סיסמה:", {
      title: "אזור הגדרות",
      password: true,
    });
    if (input === null) return false;
    if (input === SETTINGS_PW) {
      try { sessionStorage.setItem("settings-unlocked", "1"); } catch { /* ignore */ }
      return true;
    }
    toast({ title: "סיסמה שגויה", variant: "destructive" });
    return false;
  };

  const defs = WIDGET_DEFS[tabId] ?? [];
  const { presentationIsAdmin, presentationRoles } = usePermissions();
  const previewRoleId = useMemo(() => new URLSearchParams(search).get("previewRole") ?? "", [search]);
  const roleIdsForBlocklist = useMemo(
    () => (previewRoleId ? [previewRoleId] : presentationRoles.map((r) => r.id)),
    [previewRoleId, presentationRoles],
  );
  const blocklist = useResolvedFeatureBlocklist(roleIdsForBlocklist, { scope: isMobile ? "mobile" : "desktop" });
  const bypassBlocklist = tabId === "cards" || tabId === "categories";
  const tabLayout: WidgetConfig[] = useMemo(
    () => {
      const merged = mergeLayout(state.widgetLayout?.[tabId], tabId).sort((a, b) => a.order - b.order);
      return ((presentationIsAdmin && !previewRoleId) || bypassBlocklist) ? merged : applyWidgetBlocklist(merged, tabId, blocklist.widgets);
    },
    [state.widgetLayout, tabId, blocklist, presentationIsAdmin, previewRoleId, bypassBlocklist],
  );

  const save = useCallback((newTabLayout: WidgetConfig[]) => {
    const fullLayout: WidgetLayout = {
      ...(state.widgetLayout ?? {}),
      [tabId]: newTabLayout.map((w, i) => ({ ...w, order: i })),
    };
    setWidgetLayout(fullLayout);
  }, [state.widgetLayout, tabId, setWidgetLayout]);

  const resolveWidgetLabel = useCallback((cfg: WidgetConfig) => {
    const customTitle = normalizeWidgetTitle(cfg.title ?? "");
    if (customTitle) return customTitle;
    return defs.find((d) => d.id === cfg.id)?.label ?? cfg.id;
  }, [defs]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const excludedWidgets = useMemo(() => new Set(excludedWidgetIds), [excludedWidgetIds]);
  const visibleWidgets = tabLayout.filter((w) => w.visible && !excludedWidgets.has(w.id));
  const hiddenWidgets = tabLayout.filter((w) => !w.visible && !excludedWidgets.has(w.id));
  const activeLabel = activeId
    ? (() => {
      const activeWidget = tabLayout.find((w) => w.id === activeId);
      return activeWidget ? resolveWidgetLabel(activeWidget) : (defs.find((d) => d.id === activeId)?.label ?? activeId);
    })()
    : "";
  const managerActiveLabel = managerActiveId
    ? (() => {
      const activeWidget = tabLayout.find((w) => w.id === managerActiveId);
      return activeWidget ? resolveWidgetLabel(activeWidget) : managerActiveId;
    })()
    : "";

  const mobileModePref = useMobileLayoutMode();
  const mobileMode = resolveMobileMode(mobileModePref, isMobile);
  const useMobileLayout = mobileMode !== "default" && !editMode;

  useEffect(() => {
    if (!editingLocked) return;
    setEditMode(false);
    setShowHiddenTray(false);
  }, [editingLocked]);

  const toggleSize = (id: string) => {
    save(tabLayout.map((w) => w.id === id ? { ...w, size: w.size === "full" ? "half" : "full" } : w));
  };

  const setSize = (id: string, size: "half" | "full") => {
    save(tabLayout.map((w) => w.id === id ? { ...w, size } : w));
  };

  const setHeight = (id: string, height: number | undefined) => {
    save(tabLayout.map((w) => w.id === id ? { ...w, height } : w));
  };

  const toggleCollapse = (id: string) => {
    save(tabLayout.map((w) => w.id === id ? { ...w, collapsed: !w.collapsed } : w));
  };

  const setVisibility = (id: string, visible: boolean) => {
    save(tabLayout.map((w) => w.id === id ? { ...w, visible } : w));
  };

  const setWidgetTitle = (id: string, title: string) => {
    const normalized = normalizeWidgetTitle(title);
    save(tabLayout.map((w) => w.id === id ? { ...w, title: normalized } : w));
  };

  const hideWidget = (id: string) => {
    save(tabLayout.map((w) => w.id === id ? { ...w, visible: false } : w));
  };

  const showWidget = (id: string) => {
    save(tabLayout.map((w) => w.id === id ? { ...w, visible: true } : w));
  };

  const moveWidgetBy = (id: string, delta: number) => {
    const oldIndex = tabLayout.findIndex((w) => w.id === id);
    if (oldIndex === -1) return;
    const newIndex = Math.max(0, Math.min(tabLayout.length - 1, oldIndex + delta));
    if (newIndex === oldIndex) return;
    save(arrayMove(tabLayout, oldIndex, newIndex));
  };

  const resetLayout = () => {
    const fullLayout: WidgetLayout = { ...(state.widgetLayout ?? {}) };
    delete fullLayout[tabId];
    setWidgetLayout(fullLayout);
  };

  const autoArrangeLayout = () => {
    const visible = tabLayout.filter((w) => w.visible);
    const hidden = tabLayout.filter((w) => !w.visible);

    const halfQueue = visible.filter((w) => w.size === "half");
    const fullQueue = visible.filter((w) => w.size === "full");

    const arranged: WidgetConfig[] = [];
    while (halfQueue.length >= 2) {
      arranged.push(halfQueue.shift() as WidgetConfig);
      arranged.push(halfQueue.shift() as WidgetConfig);
      if (fullQueue.length > 0) arranged.push(fullQueue.shift() as WidgetConfig);
    }
    if (halfQueue.length === 1) arranged.push(halfQueue.shift() as WidgetConfig);
    arranged.push(...fullQueue);

    save([...arranged, ...hidden]);
  };

  const openManagerDialog = () => {
    setTitleDrafts(
      Object.fromEntries(tabLayout.map((w) => [w.id, w.title ?? ""])),
    );
    setManagerOpen(true);
  };

  const handleManagerDragStart = (e: DragStartEvent) => setManagerActiveId(e.active.id as string);
  const handleManagerDragEnd = (e: DragEndEvent) => {
    setManagerActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = tabLayout.findIndex((w) => w.id === active.id);
    const newIndex = tabLayout.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    save(arrayMove(tabLayout, oldIndex, newIndex));
  };

  const handleInlineDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);
  const handleInlineDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = tabLayout.findIndex((w) => w.id === active.id);
    const newIndex = tabLayout.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    save(arrayMove(tabLayout, oldIndex, newIndex));
  };

  return (
    <div className="space-y-4 relative">
      {promptDialog}
      {!editingLocked && !(useMobileLayout && !editMode) && (
      <div
        className="flex items-center justify-between gap-2"
        onMouseEnter={() => setToolbarVisible(true)}
        onMouseLeave={() => setToolbarVisible(false)}
      >
        <div className={`flex items-center gap-2 transition-opacity duration-200 ${toolbarVisible || editMode ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <Button
            size="sm"
            variant={editMode ? "default" : "outline"}
            onClick={async () => { if (await requireSettingsAuth()) setEditMode((v) => !v); }}
            title={editMode ? "לחץ לסיום עריכת הפריסה" : "ערוך פריסה — גרור, שנה גודל, הסתר ווידג׳טים"}
            className={editMode
              ? "gap-1.5 text-xs bg-gradient-navy text-primary-foreground"
              : "gap-1.5 text-xs border-gold/60 text-muted-foreground hover:text-foreground"}
          >
            {editMode ? <><Check className="h-3.5 w-3.5" /> סיום עריכה</> : <><Pencil className="h-3.5 w-3.5" /> ערוך פריסה</>}
          </Button>
          <button
            onClick={async () => { if (await requireSettingsAuth()) openManagerDialog(); }}
            title="ניהול ווידג׳טים"
            className="flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border-2 border-gold/70 bg-card text-navy hover:bg-secondary transition-all"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            onClick={async () => { if (await requireSettingsAuth()) autoArrangeLayout(); }}
            title="סידור אוטומטי"
            className="flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border-2 border-gold/70 bg-card text-navy hover:bg-secondary transition-all"
          >
            <WandSparkles className="h-4 w-4" />
          </button>
          <button
            onClick={async () => { if (await requireSettingsAuth()) resetLayout(); }}
            title="איפוס פריסה"
            className="flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border-2 border-gold/70 bg-card text-navy hover:bg-secondary transition-all"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {hiddenWidgets.length > 0 && (
            <button
              onClick={async () => { if (await requireSettingsAuth()) setShowHiddenTray((v) => !v); }}
              title="רכיבים מוסתרים"
              className={`flex items-center gap-1.5 rounded-xl border-2 border-gold/70 px-2 py-1.5 text-xs transition-all ${showHiddenTray ? "bg-secondary text-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <Eye className="h-3.5 w-3.5" />
              {hiddenWidgets.length}
            </button>
          )}
        </div>
        {editMode && (
          <p className="text-xs text-muted-foreground text-right">עריכה צמודה לווידג׳טים: גרירה/סדר, הסתרה, והגדלה/הקטנה מההנדלים</p>
        )}
      </div>
      )}

      {hiddenWidgets.length > 0 && showHiddenTray && (
        <div className="rounded-xl border-2 border-dashed border-gold/50 bg-secondary/40 p-3 space-y-2">
          <p className="text-xs text-muted-foreground text-right">רכיבים מוסתרים — לחץ להחזיר:</p>
          <div className="flex flex-wrap gap-2">
            {hiddenWidgets.map((w) => {
              const label = resolveWidgetLabel(w);
              return (
                <button
                  key={w.id}
                  onClick={() => showWidget(w.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-gold/50 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-all"
                >
                  <Eye className="h-3.5 w-3.5 text-gold" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {useMobileLayout ? (
        (() => {
          const items = visibleWidgets.map((cfg) => ({
            cfg,
            label: resolveWidgetLabel(cfg),
            node: widgetMap[cfg.id] ?? null,
          }));
          if (mobileMode === "carousel") return <CarouselLayout items={items} />;
          if (mobileMode === "magazine") return <MagazineLayout items={items} />;
          if (mobileMode === "focused") return <FocusedDashboardLayout items={items} />;
          return <PremiumStackLayout items={items} />;
        })()
      ) : inlineDrag ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleInlineDragStart}
          onDragEnd={handleInlineDragEnd}
        >
          <SortableContext items={visibleWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {visibleWidgets.map((cfg, index) => {
                const label = resolveWidgetLabel(cfg);
                return (
                  <SortableWidget
                    key={cfg.id}
                    cfg={cfg}
                    editMode={editMode && !editingLocked}
                    label={label}
                    canMovePrev={index > 0}
                    canMoveNext={index < visibleWidgets.length - 1}
                    onMovePrev={() => moveWidgetBy(cfg.id, -1)}
                    onMoveNext={() => moveWidgetBy(cfg.id, 1)}
                    onSetSize={(size) => setSize(cfg.id, size)}
                    onSetHeight={(h) => setHeight(cfg.id, h)}
                    onHide={() => hideWidget(cfg.id)}
                    onToggleCollapse={() => toggleCollapse(cfg.id)}
                    quickLayoutOpen={quickLayoutId === cfg.id}
                    onToggleQuickLayout={() => setQuickLayoutId(quickLayoutId === cfg.id ? null : cfg.id)}
                  >
                    {widgetMap[cfg.id] ?? null}
                  </SortableWidget>
                );
              })}
            </div>
          </SortableContext>
          <DragOverlay>{activeId ? <DragOverlayItem label={activeLabel} /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {visibleWidgets.map((cfg, index) => {
            const label = resolveWidgetLabel(cfg);
            const collapsed = !!cfg.collapsed;
            return (
              <div key={cfg.id} style={{ gridColumn: cfg.size === "full" ? "1 / -1" : undefined, minHeight: collapsed ? undefined : (cfg.height ? `${cfg.height}px` : undefined) }} className={cn("relative group", !collapsed && (editMode ? "pt-10" : "pt-8"))}>
                {editMode && !collapsed && <div className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-gold/60 pointer-events-none" />}
                {editMode && !collapsed && (
                  <>
                    <ResizeHandleLeft size={cfg.size} onSetSize={(size) => setSize(cfg.id, size)} />
                    <ResizeHandleRight size={cfg.size} onSetSize={(size) => setSize(cfg.id, size)} />
                    <ResizeHandleTop onSetHeight={(h) => setHeight(cfg.id, h)} />
                    <ResizeHandleBottom onSetHeight={(h) => setHeight(cfg.id, h)} />
                  </>
                )}
                <button
                  onClick={() => toggleCollapse(cfg.id)}
                  aria-label={collapsed ? `הרחב "${label}"` : `מזער "${label}"`}
                  title={collapsed ? "הרחב" : "מזער"}
                  className={cn(
                    "absolute left-2 z-30 flex items-center justify-center h-7 w-7 rounded-lg border border-gold/40 bg-background/95 backdrop-blur shadow text-muted-foreground hover:text-gold transition-opacity",
                    collapsed ? "top-1" : (editMode ? "top-2" : "top-0"),
                    collapsed
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 delay-0 group-hover:delay-700",
                  )}
                >
                  {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
                {/* Quick-layout button — only in non-edit mode, hover visible */}
                {!editMode && !collapsed && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setQuickLayoutId(quickLayoutId === cfg.id ? null : cfg.id); }}
                      title="גודל ומיקום"
                      className={cn(
                        "absolute left-10 top-0 z-30 flex items-center justify-center h-7 w-7 rounded-lg border border-gold/40 bg-background/95 backdrop-blur shadow text-muted-foreground hover:text-gold transition-opacity",
                        quickLayoutId === cfg.id ? "opacity-100 text-gold" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 delay-0 group-hover:delay-700",
                      )}
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>
                    {quickLayoutId === cfg.id && (
                      <div className="absolute top-8 left-2 z-40 flex items-center gap-1 bg-background/95 backdrop-blur rounded-xl border border-gold/40 shadow-lg px-1.5 py-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => { moveWidgetBy(cfg.id, -1); setQuickLayoutId(null); }}
                                disabled={index === 0}
                                className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"
                              ><ArrowUp className="h-4 w-4" /></button>
                            </TooltipTrigger>
                            <TooltipContent>הזז למעלה</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => { moveWidgetBy(cfg.id, 1); setQuickLayoutId(null); }}
                                disabled={index === visibleWidgets.length - 1}
                                className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"
                              ><ArrowDown className="h-4 w-4" /></button>
                            </TooltipTrigger>
                            <TooltipContent>הזז למטה</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => { toggleSize(cfg.id); setQuickLayoutId(null); }}
                                className="text-muted-foreground hover:text-gold p-1"
                              >{cfg.size === "full" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
                            </TooltipTrigger>
                            <TooltipContent>{cfg.size === "full" ? "הפוך לחצי רוחב" : "הפוך לרוחב מלא"}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => { hideWidget(cfg.id); setQuickLayoutId(null); }}
                                className="text-muted-foreground hover:text-destructive p-1"
                              ><EyeOff className="h-4 w-4" /></button>
                            </TooltipTrigger>
                            <TooltipContent>הסתר "{label}"</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </>
                )}
                {editMode && !collapsed && (
                  <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-background/95 backdrop-blur rounded-xl border border-gold/40 shadow px-1.5 py-1">
                    <button
                      onClick={() => moveWidgetBy(cfg.id, -1)}
                      disabled={index === 0}
                      className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"
                      aria-label="העלה למעלה"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveWidgetBy(cfg.id, 1)}
                      disabled={index === visibleWidgets.length - 1}
                      className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"
                      aria-label="הורד למטה"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleSize(cfg.id)}
                      className="text-muted-foreground hover:text-gold p-1"
                      aria-label="שנה גודל"
                    >
                      {cfg.size === "full" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => hideWidget(cfg.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      aria-label="הסתר"
                    >
                      <EyeOff className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {editMode && !collapsed && (
                  <div className="absolute bottom-2 left-2 z-20 flex items-center gap-2">
                    <button
                      onClick={() => setSize(cfg.id, "half")}
                      className="flex items-center gap-1 rounded-lg border border-gold/40 bg-background/95 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label="הקטן לחצי"
                    >
                      <LayoutPanelLeft className="h-3.5 w-3.5" />
                      הקטן
                    </button>
                    <button
                      onClick={() => setSize(cfg.id, "full")}
                      className="flex items-center gap-1 rounded-lg border border-gold/40 bg-background/95 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label="הגדל לרוחב מלא"
                    >
                      <LayoutPanelTop className="h-3.5 w-3.5" />
                      הגדל
                    </button>
                  </div>
                )}
                {collapsed ? (
                  <button
                    onClick={() => toggleCollapse(cfg.id)}
                    title={`הרחב "${label}"`}
                    className="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-gold/40 bg-card px-3 py-2 text-right hover:bg-secondary/40 transition-colors"
                  >
                    <ChevronDown className="h-4 w-4 text-gold" />
                    <span className="font-display text-sm font-semibold truncate">{label}</span>
                  </button>
                ) : (
                  <>
                    {widgetMap[cfg.id] ?? null}
                    {editMode && (
                      <div className="absolute top-2 left-12 z-20 rounded-md bg-background/95 border border-gold/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {label}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hiddenWidgets.length > 0 && showHiddenTray && (
        <div className="rounded-xl border-2 border-dashed border-gold/30 bg-secondary/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground text-right">רכיבים מוסתרים — לחץ להחזיר:</p>
          <div className="flex flex-wrap gap-2">
            {hiddenWidgets.map((w) => {
              const label = resolveWidgetLabel(w);
              return (
                <button
                  key={w.id}
                  onClick={() => showWidget(w.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-gold/50 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-all"
                >
                  <Eye className="h-3.5 w-3.5 text-gold" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Dialog modal={false} open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent
          showOverlay={false}
          trapFocus={false}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="max-w-3xl max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>ניהול ווידג׳טים</DialogTitle>
            <DialogDescription>
              גרירה לשינוי סדר, טוגל להצגה/הסתרה, ושינוי שם שנשמר מקומית ובענן לפי חותמת הזמן האחרונה.
            </DialogDescription>
          </DialogHeader>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleManagerDragStart}
            onDragEnd={handleManagerDragEnd}
          >
            <SortableContext items={tabLayout.map((w) => w.id)} strategy={rectSortingStrategy}>
              <div className="space-y-2">
                {tabLayout.map((cfg) => {
                  const label = resolveWidgetLabel(cfg);
                  const draftTitle = titleDrafts[cfg.id] ?? cfg.title ?? "";
                  return (
                    <SortableManagerRow
                      key={cfg.id}
                      cfg={cfg}
                      label={label}
                      draftTitle={draftTitle}
                      onDraftChange={(value) => {
                        setTitleDrafts((prev) => ({ ...prev, [cfg.id]: value }));
                      }}
                      onCommitTitle={() => {
                        const nextTitle = titleDrafts[cfg.id] ?? cfg.title ?? "";
                        setWidgetTitle(cfg.id, nextTitle);
                        const normalized = normalizeWidgetTitle(nextTitle) ?? "";
                        setTitleDrafts((prev) => ({ ...prev, [cfg.id]: normalized }));
                      }}
                      onToggleVisible={(next) => setVisibility(cfg.id, next)}
                    />
                  );
                })}
              </div>
            </SortableContext>
            <DragOverlay>{managerActiveId ? <DragOverlayItem label={managerActiveLabel} /> : null}</DragOverlay>
          </DndContext>

          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span>מוצגים: {visibleWidgets.length}</span>
            <span>מוסתרים: {hiddenWidgets.length}</span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
