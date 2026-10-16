import { startTransition, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Plus, Search, FolderTree, Check, Pin, PinOff, ChevronDown, ChevronLeft, ChevronRight, Folder, FolderOpen, LayoutGrid, Maximize2, Minimize2, ChevronsDown, Clock3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useStudy } from "@/lib/study/store";
import type { Category } from "@/lib/study/types";
import { cn } from "@/lib/utils";
import { displayCategoryName } from "@/lib/study/shasGen";

const RECENT_KEY = "deck-create:recent-cats";
const MAX_RECENT = 6;
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (deckId: string) => void;
}

type ClassificationViewMode = "tree" | "cards";

export function DeckCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const { state, addDeck, updateDeckCategoryIds, setUiPref } = useStudy();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [classificationView, setClassificationView] = useState<ClassificationViewMode>(
    state.uiPrefs?.deckCreateClassificationView === "cards" ? "cards" : "tree",
  );
  const [cardsPath, setCardsPath] = useState<string[]>(state.uiPrefs?.deckCreateCategoryPathIds ?? []);
  const [isExpanded, setIsExpanded] = useState<boolean>(!!state.uiPrefs?.deckCreateDialogExpanded);
  const [mobileClassifyOpen, setMobileClassifyOpen] = useState(false);
  const [treeSearch, setTreeSearch] = useState("");
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({});
  const [classificationReady, setClassificationReady] = useState(false);

  // Recent (localStorage)
  const [recent, setRecent] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(RECENT_KEY); return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : []; }
    catch { return []; }
  });
  const pushRecent = (names: string[]) => {
    if (!names.length) return;
    setRecent((prev) => {
      const next = [...names, ...prev.filter((n) => !names.includes(n))].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Pinned (synced via uiPrefs.pinnedCats)
  const pinnedCats = state.uiPrefs?.pinnedCats ?? [];
  const togglePinCategory = (n: string) => {
    const cur = state.uiPrefs?.pinnedCats ?? [];
    setUiPref("pinnedCats", cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]);
  };

  useEffect(() => {
    if (!open) {
      setClassificationReady(false);
      return;
    }
    // Let the name field paint and accept input before hydrating classification.
    let timeoutId = 0;
    let idleId: number | null = null;
    const markReady = () => startTransition(() => setClassificationReady(true));
    const scheduleReady = () => {
      const hasIdle = typeof (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback === "function";
      if (hasIdle) {
        idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(() => {
          markReady();
        }, { timeout: 1500 });
        return;
      }
      timeoutId = window.setTimeout(markReady, 0);
    };
    timeoutId = window.setTimeout(scheduleReady, 250);
    return () => {
      window.clearTimeout(timeoutId);
      if (idleId !== null) {
        const cancelIdle = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        cancelIdle?.(idleId);
      }
    };
  }, [open]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setName(""); setSelected([]);
      const nextView: ClassificationViewMode = state.uiPrefs?.deckCreateClassificationView === "cards" ? "cards" : "tree";
      const nextExpanded = !!state.uiPrefs?.deckCreateDialogExpanded;
      const expandedIds = state.uiPrefs?.deckCreateExpandedCategoryIds ?? [];
      const nextPath = state.uiPrefs?.deckCreateCategoryPathIds ?? [];
      setClassificationView(nextView);
      setCardsPath(nextPath);
      setIsExpanded(nextExpanded);
      setTreeSearch("");
      setTreeExpanded(Object.fromEntries(expandedIds.map((id) => [id, true])));

      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
      const minW = 360;
      const minH = 280;
      const maxW = Math.min(window.innerWidth * 0.96, 1400);
      const maxH = window.innerHeight * 0.88;
      const saved = state.uiPrefs?.deckCreateDialogGeometry;

      // Restore previously saved geometry (local + cloud). Fallback: centered default.
      const el = dialogRef.current;
      if (el) {
        if (nextExpanded) {
          const width = Math.max(minW, Math.min(maxW, window.innerWidth * 0.96));
          const height = Math.max(minH, Math.min(window.innerHeight * 0.92, window.innerHeight - 16));
          const left = Math.max(8, Math.round((window.innerWidth - width) / 2));
          const top = Math.max(8, Math.round((window.innerHeight - height) / 2));
          el.style.left = `${left}px`;
          el.style.top = `${top}px`;
          el.style.width = `${Math.round(width)}px`;
          el.style.height = `${Math.round(height)}px`;
          el.style.transform = "none";
        } else if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height) && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
          const width = clamp(saved.width, minW, maxW);
          const height = clamp(saved.height, minH, maxH);
          const left = clamp(saved.left, 8, Math.max(8, window.innerWidth - width - 8));
          const top = clamp(saved.top, 8, Math.max(8, window.innerHeight - height - 8));
          el.style.left = `${left}px`;
          el.style.top = `${top}px`;
          el.style.width = `${width}px`;
          el.style.height = `${height}px`;
          el.style.transform = "none";
        } else {
          el.style.left = "50%";
          el.style.top = "50%";
          el.style.width = "";
          el.style.height = "";
          el.style.transform = "translate(-50%, -50%)";
        }
      }
      return;
    }

    if (!open) {
      wasOpenRef.current = false;
      setMobileClassifyOpen(false);
    }
  }, [open, state.uiPrefs?.deckCreateDialogGeometry, state.uiPrefs?.deckCreateClassificationView, state.uiPrefs?.deckCreateExpandedCategoryIds, state.uiPrefs?.deckCreateDialogExpanded]);

  const setViewMode = useCallback((mode: ClassificationViewMode) => {
    setClassificationView(mode);
    setUiPref("deckCreateClassificationView", mode);
    if (mode === "tree") {
      setCardsPath([]);
      setUiPref("deckCreateCategoryPathIds", []);
    }
  }, [setUiPref]);

  const setExpandedState = useCallback((next: Record<string, boolean>) => {
    setTreeExpanded(next);
    const ids = Object.keys(next).filter((id) => next[id]);
    setUiPref("deckCreateExpandedCategoryIds", ids);
  }, [setUiPref]);

  const toggleBranch = useCallback((id: string) => {
    setExpandedState({ ...treeExpanded, [id]: !treeExpanded[id] });
  }, [setExpandedState, treeExpanded]);

  const toggleExpanded = useCallback(() => {
    const el = dialogRef.current;
    if (!el) return;
    const nextExpanded = !isExpanded;
    setIsExpanded(nextExpanded);
    setUiPref("deckCreateDialogExpanded", nextExpanded);

    const minW = 360;
    const minH = 280;
    const maxW = Math.min(window.innerWidth * 0.96, 1400);

    if (nextExpanded) {
      const width = Math.max(minW, Math.min(maxW, window.innerWidth * 0.96));
      const height = Math.max(minH, Math.min(window.innerHeight * 0.92, window.innerHeight - 16));
      const left = Math.max(8, Math.round((window.innerWidth - width) / 2));
      const top = Math.max(8, Math.round((window.innerHeight - height) / 2));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${Math.round(width)}px`;
      el.style.height = `${Math.round(height)}px`;
      el.style.transform = "none";
      return;
    }

    const saved = state.uiPrefs?.deckCreateDialogGeometry;
    if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height) && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      const width = Math.max(minW, Math.min(maxW, saved.width));
      const height = Math.max(minH, Math.min(window.innerHeight * 0.88, saved.height));
      const left = Math.max(8, Math.min(saved.left, window.innerWidth - width - 8));
      const top = Math.max(8, Math.min(saved.top, window.innerHeight - height - 8));
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
      el.style.width = `${Math.round(width)}px`;
      el.style.height = `${Math.round(height)}px`;
      el.style.transform = "none";
      return;
    }

    el.style.left = "50%";
    el.style.top = "50%";
    el.style.width = "";
    el.style.height = "";
    el.style.transform = "translate(-50%, -50%)";
  }, [isExpanded, setUiPref, state.uiPrefs?.deckCreateDialogGeometry]);

  const persistDialogGeometry = useCallback((el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    const next = {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
    };
    const prev = state.uiPrefs?.deckCreateDialogGeometry;
    if (prev && prev.width === next.width && prev.height === next.height && prev.left === next.left && prev.top === next.top) {
      return;
    }
    setUiPref("deckCreateDialogGeometry", next);
  }, [setUiPref, state.uiPrefs?.deckCreateDialogGeometry]);

  const startResize = useCallback((dir: "n" | "s" | "e" | "w", e: React.MouseEvent) => {
    const el = dialogRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = rect.width;
    const startH = rect.height;
    const startL = rect.left;
    const startT = rect.top;
    const minW = 360;
    const minH = 280;
    const maxW = Math.min(window.innerWidth * 0.96, 1400);
    const maxH = window.innerHeight * 0.88;

    el.style.left = `${startL}px`;
    el.style.top = `${startT}px`;
    el.style.width = `${startW}px`;
    el.style.height = `${startH}px`;
    el.style.transform = "none";

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (dir === "e") {
        const nextW = Math.max(minW, Math.min(maxW, startW + dx));
        el.style.width = `${nextW}px`;
      }
      if (dir === "w") {
        const nextW = Math.max(minW, Math.min(maxW, startW - dx));
        const usedDx = startW - nextW;
        el.style.width = `${nextW}px`;
        el.style.left = `${startL + usedDx}px`;
      }
      if (dir === "s") {
        const nextH = Math.max(minH, Math.min(maxH, startH + dy));
        el.style.height = `${nextH}px`;
      }
      if (dir === "n") {
        const nextH = Math.max(minH, Math.min(maxH, startH - dy));
        const usedDy = startH - nextH;
        el.style.height = `${nextH}px`;
        el.style.top = `${startT + usedDy}px`;
      }
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persistDialogGeometry(el);
    };

    document.body.style.cursor = dir === "n" || dir === "s" ? "ns-resize" : "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [persistDialogGeometry]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const categories = useMemo(
    () => (open && classificationReady ? [...(state.categories ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt - b.createdAt) : []),
    [open, classificationReady, state.categories],
  );
  // Hebrew letter → numeric value for gematria sort
  const HVAL: Record<string, number> = {
    'א':1,'ב':2,'ג':3,'ד':4,'ה':5,'ו':6,'ז':7,'ח':8,'ט':9,
    'י':10,'כ':20,'ך':20,'ל':30,'מ':40,'ם':40,'נ':50,'ן':50,'ס':60,'ע':70,'פ':80,'ף':80,'צ':90,'ץ':90,
    'ק':100,'ר':200,'ש':300,'ת':400,
  };
  const hebrewToNum = (s: string) => [...s].reduce((sum, ch) => sum + (HVAL[ch] ?? 0), 0);
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    for (const c of categories) {
      const key = c.parentId ?? null;
      const bucket = map.get(key);
      if (bucket) bucket.push(c);
      else map.set(key, [c]);
    }
    for (const [key, list] of map.entries()) {
      map.set(key, [...list].sort((a, b) => {
        const an = hebrewToNum(displayCategoryName(a.name));
        const bn = hebrewToNum(displayCategoryName(b.name));
        if (an !== 0 || bn !== 0) return an - bn;
        return displayCategoryName(a.name).localeCompare(displayCategoryName(b.name), "he");
      }));
    }
    return map;
  }, [categories]);

  const childrenOf = useCallback((pid: string | null) => childrenByParent.get(pid) ?? [], [childrenByParent]);
  const validNames = useMemo(() => new Set(categories.map((c) => c.name)), [categories]);

  // Recursive card count per category (including descendants)
  const countsMap = useMemo(() => {
    if (!open || !classificationReady) return new Map<string, number>();
    const direct = new Map<string, number>();
    for (const card of state.cards ?? []) {
      for (const tag of card.tags ?? []) {
        if (tag.startsWith("cat:")) {
          const n = tag.slice(4);
          direct.set(n, (direct.get(n) ?? 0) + 1);
        }
      }
    }
    const total = new Map<string, number>();
    const countFor = (cat: Category): number => {
      if (total.has(cat.id)) return total.get(cat.id)!;
      const d = direct.get(cat.name) ?? 0;
      const kids = childrenByParent.get(cat.id) ?? [];
      const sum = d + kids.reduce((acc, k) => acc + countFor(k), 0);
      total.set(cat.id, sum);
      return sum;
    };
    for (const cat of categories) countFor(cat);
    return total;
  }, [open, classificationReady, state.cards, categories, childrenByParent]);
  const recentExisting = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of recent) {
      if (!validNames.has(n) || seen.has(n)) continue;
      seen.add(n); out.push(n);
      if (out.length >= MAX_RECENT) break;
    }
    return out;
  }, [recent, validNames]);

  const toggle = (catName: string) => {
    setSelected((arr) => arr.includes(catName) ? arr.filter((x) => x !== catName) : [...arr, catName]);
  };

  // Does this category or any descendant match the search?
  const matchesSearch = (cat: Category, q: string): boolean => {
    if (!q) return true;
    if (displayCategoryName(cat.name).toLowerCase().includes(q)) return true;
    return childrenOf(cat.id).some((child) => matchesSearch(child, q));
  };

  const renderTreeNode = (cat: Category, depth: number) => {
    const q = treeSearch.trim().toLowerCase();
    if (q && !matchesSearch(cat, q)) return null;
    const allKids = childrenOf(cat.id);
    const hasKids = allKids.length > 0;
    const isExpanded = !!treeExpanded[cat.id];
    const isSelected = selected.includes(cat.name);
    const isPinned = pinnedCats.includes(cat.name);
    const label = displayCategoryName(cat.name);
    const count = countsMap.get(cat.id) ?? 0;
    return (
      <div key={cat.id}>
        <div
          style={{ paddingRight: `${depth * 16 + 4}px` }}
          className={cn(
            "flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-all group select-none",
            isSelected ? "bg-navy/10 ring-1 ring-navy/30" : "hover:bg-secondary",
          )}
          onClick={() => toggle(cat.name)}
        >
          {/* expand toggle */}
          {hasKids ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleBranch(cat.id); }}
              className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>
          ) : <span className="w-4 shrink-0" />}

          {/* folder icon */}
          {isExpanded && hasKids
            ? <FolderOpen className="h-3.5 w-3.5 text-gold shrink-0" />
            : <Folder className="h-3.5 w-3.5 text-gold/70 shrink-0" />}

          {/* name */}
          <span className={cn("flex-1 text-sm text-right truncate", count === 0 && "text-muted-foreground")} title={cat.name}>{label}</span>

          {/* question count badge */}
          {count > 0
            ? <span className="text-[10px] font-semibold text-white bg-navy rounded px-1.5 py-0.5 shrink-0 tabular-nums leading-none">{count}</span>
            : <span className="text-[10px] text-muted-foreground/40 shrink-0">–</span>
          }

          {/* pin button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); togglePinCategory(cat.name); }}
            title={isPinned ? "בטל נעיצה" : "נעץ קטגוריה"}
            className={cn(
              "h-5 w-5 rounded flex items-center justify-center transition-all shrink-0",
              isPinned ? "text-navy opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground",
            )}
          >
            <Pin className={cn("h-3 w-3", isPinned && "fill-navy")} />
          </button>

          {/* checkbox */}
          <div className={cn(
            "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
            isSelected ? "border-navy bg-navy" : "border-muted-foreground/40",
          )}>
            {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
          </div>
        </div>
        {/* recursive children */}
        {isExpanded && allKids.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  const topLevelCategories = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    return childrenOf(null).filter((cat) => !q || matchesSearch(cat, q));
  }, [childrenOf, treeSearch]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const normalizedCardsPath = useMemo(() => {
    const out: string[] = [];
    let expectedParent: string | null = null;
    for (const id of cardsPath) {
      const cat = categoryById.get(id);
      if (!cat || cat.parentId !== expectedParent) break;
      out.push(id);
      expectedParent = id;
    }
    return out;
  }, [cardsPath, categoryById]);

  useEffect(() => {
    if (normalizedCardsPath.length !== cardsPath.length) {
      setCardsPath(normalizedCardsPath);
      setUiPref("deckCreateCategoryPathIds", normalizedCardsPath);
    }
  }, [normalizedCardsPath, cardsPath, setUiPref]);

  const cardsParentId = normalizedCardsPath.length > 0 ? normalizedCardsPath[normalizedCardsPath.length - 1] : null;
  const cardsLevelCategories = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    const level = childrenOf(cardsParentId);
    return q ? level.filter((cat) => matchesSearch(cat, q)) : level;
  }, [cardsParentId, childrenOf, treeSearch]);

  const cardsBreadcrumb = useMemo(
    () => normalizedCardsPath.map((id) => categoryById.get(id)).filter((c): c is Category => !!c),
    [normalizedCardsPath, categoryById],
  );

  const setCardsPathAndPersist = useCallback((nextPath: string[]) => {
    setCardsPath(nextPath);
    setUiPref("deckCreateCategoryPathIds", nextPath);
  }, [setUiPref]);

  const enterCardsCategory = useCallback((cat: Category) => {
    if (childrenOf(cat.id).length === 0) return;
    setCardsPathAndPersist([...normalizedCardsPath, cat.id]);
  }, [childrenOf, normalizedCardsPath, setCardsPathAndPersist]);

  const expandFirstLevel = useCallback(() => {
    const next = Object.fromEntries(topLevelCategories.map((cat) => [cat.id, true]));
    setExpandedState(next);
    setCardsPathAndPersist([]);
  }, [setExpandedState, topLevelCategories]);

  const hasExpandedBranches = useMemo(() => Object.values(treeExpanded).some(Boolean), [treeExpanded]);

  const canSave = name.trim().length > 0 && selected.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const cats = selected;
    const catIds = categories.filter((c) => selected.includes(c.name)).map((c) => c.id);
    const deck = addDeck(name.trim(), undefined, cats);
    if (catIds.length > 0) updateDeckCategoryIds(deck.id, catIds, true);
    if (selected.length > 0) pushRecent(selected);
    onCreated?.(deck.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        ref={dialogRef}
        showOverlay={false}
        trapFocus={false}
        disableOutsidePointerEvents={false}
        onEscapeKeyDown={() => onOpenChange(false)}
        className="max-w-[1400px] w-[min(92vw,680px)] min-w-[360px] min-h-[280px] max-h-[92vh] overflow-hidden gap-5 transition-[width,height] duration-100 ease-out"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-right">מבחן חדש</DialogTitle>
          <DialogDescription className="sr-only">
            יצירת מבחן חדש ובחירת קטגוריות לשיוך.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-8 overflow-y-auto pr-1">
          {/* Deck name */}
          <div className="space-y-4">
            <Label className="block text-right">שם המבחן</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוג: גמרא, מסכת ברכות..."
              className="border-2 border-gold/40 text-right"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
            />
          </div>

          {/* Classification */}
          <div className="space-y-5">
            {/* Header row */}
            <div className="group/classification flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 opacity-0 pointer-events-none translate-y-0.5 transition-all duration-150 group-hover/classification:opacity-100 group-hover/classification:pointer-events-auto group-hover/classification:translate-y-0 focus-within:opacity-100 focus-within:pointer-events-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 gap-1 rounded-full border-2 border-gold/50 px-2"
                      title="תצוגות ופריסות סיווג"
                    >
                      <LayoutGrid className="h-4 w-4" />
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[180px]">
                    <DropdownMenuItem className="gap-2" onClick={() => setViewMode("cards")}>
                      <LayoutGrid className="h-4 w-4" /> כרטיסיות ענפים {classificationView === "cards" ? "✓" : ""}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onClick={() => setViewMode("tree")}>
                      <FolderTree className="h-4 w-4" /> עץ קומפקטי {classificationView === "tree" ? "✓" : ""}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 rounded-full border-2 border-gold/50"
                  onClick={toggleExpanded}
                  title={isExpanded ? "בטל הרחבה" : "הרחב דיאלוג"}
                >
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>

                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-full border-2 border-gold/40"
                  onClick={expandFirstLevel}
                  title="פתח רמה ראשונה בלבד"
                >
                  <ChevronsDown className="h-3.5 w-3.5" />
                </Button>

                <Button
                  type="button" size="icon" variant="outline"
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-all",
                    hasExpandedBranches ? "border-navy bg-navy/10 text-navy" : "border-gold/40",
                  )}
                  onClick={() => {
                    setExpandedState({});
                  }}
                  title="כווץ את כל הענפים"
                >
                  <Plus className={cn("h-3.5 w-3.5 transition-transform duration-200", hasExpandedBranches && "rotate-45")} />
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-2 border-gold/50 px-3 md:hidden"
                  onClick={() => setMobileClassifyOpen(true)}
                  title="פתח מסך סיווג מלא"
                >
                  מסך מלא
                </Button>
              </div>
              <Label className="text-right flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-gold" />
                סיווג {selected.length > 0 && <span className="text-xs text-muted-foreground">({selected.length} נבחרו)</span>}
              </Label>
            </div>

            <div
              className={cn(
                "space-y-3",
                mobileClassifyOpen && "fixed inset-0 z-[95] bg-background p-4 overflow-y-auto",
              )}
            >
              {mobileClassifyOpen && (
                <div className="sticky top-0 z-10 -mx-4 px-4 pb-3 pt-2 bg-background/95 backdrop-blur-sm border-b border-gold/20 flex items-center justify-between">
                  <span className="text-sm font-semibold">סיווג מבחן</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setMobileClassifyOpen(false)}>
                    סגור
                  </Button>
                </div>
              )}

              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute right-3 top-2.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={treeSearch}
                  onChange={(e) => setTreeSearch(e.target.value)}
                  placeholder="חפש בסיווג..."
                  className="h-8 text-xs border-gold/30 pr-7"
                />
              </div>

              <div className="space-y-3">
                <section className="space-y-3">
                  <div className="text-xs text-muted-foreground border border-gold/20 rounded-md px-2 py-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        disabled={normalizedCardsPath.length === 0}
                        className="inline-flex items-center gap-1 rounded-md border border-gold/40 bg-background px-2 py-1 font-medium text-foreground hover:bg-secondary disabled:opacity-35 disabled:cursor-not-allowed"
                        onClick={() => setCardsPathAndPersist(normalizedCardsPath.slice(0, -1))}
                        title="חזור לשלב הקודם"
                        aria-label="חזור לשלב הקודם"
                      >
                        <ChevronRight className="h-3.5 w-3.5" /> חזרה
                      </button>
                      <button type="button" className="hover:underline" onClick={() => setCardsPathAndPersist([])}>סיווג</button>
                      <span>/</span>
                      <button type="button" className="hover:underline" onClick={() => setCardsPathAndPersist([])}>ראשי</button>
                      {cardsBreadcrumb.map((cat, idx) => (
                        <span key={cat.id} className="inline-flex items-center gap-1.5">
                          <span>/</span>
                          <button type="button" className="hover:underline" onClick={() => setCardsPathAndPersist(normalizedCardsPath.slice(0, idx + 1))}>
                            {displayCategoryName(cat.name)}
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {!classificationReady && (
                    <div className="rounded-lg border-2 border-gold/30 bg-card p-4 text-sm text-muted-foreground text-center">
                      טוען סיווג...
                    </div>
                  )}

                  {classificationReady && classificationView === "cards" && (
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3 max-h-[52vh] overflow-y-auto pr-0.5">
                      {cardsLevelCategories.map((root) => {
                        const isSelected = selected.includes(root.name);
                        const count = countsMap.get(root.id) ?? 0;
                        const hasChildren = childrenOf(root.id).length > 0;
                        const isPinned = pinnedCats.includes(root.name);
                        return (
                          <div key={root.id} className="group/card relative rounded-xl border-2 border-gold/30 bg-card overflow-hidden">
                            <div className="absolute top-2 left-2 z-20 flex items-center gap-1 opacity-0 pointer-events-none transition-opacity duration-150 group-hover/card:opacity-100 group-hover/card:pointer-events-auto group-focus-within/card:opacity-100 group-focus-within/card:pointer-events-auto">
                              <button
                                type="button"
                                title={isSelected ? "הסר בחירה" : "בחר קטגוריה"}
                                className={cn(
                                  "h-7 w-7 rounded-full border flex items-center justify-center bg-background/95 backdrop-blur-sm transition-colors",
                                  isSelected ? "border-navy text-navy" : "border-gold/50 text-muted-foreground hover:text-foreground hover:border-gold",
                                )}
                                onClick={(e) => { e.stopPropagation(); toggle(root.name); }}
                              >
                                <Check className={cn("h-3.5 w-3.5", isSelected && "fill-navy text-navy")} />
                              </button>
                              <button
                                type="button"
                                title={isPinned ? "בטל נעיצה" : "נעץ קטגוריה"}
                                className={cn(
                                  "h-7 w-7 rounded-full border flex items-center justify-center bg-background/95 backdrop-blur-sm transition-colors",
                                  isPinned ? "border-navy text-navy" : "border-gold/50 text-muted-foreground hover:text-foreground hover:border-gold",
                                )}
                                onClick={(e) => { e.stopPropagation(); togglePinCategory(root.name); }}
                              >
                                {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                            <button
                              type="button"
                              className={cn(
                                "w-full p-3 text-right transition-colors hover:bg-secondary/30",
                                isSelected && "bg-navy/10",
                              )}
                              onClick={() => enterCardsCategory(root)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="h-7 w-7 rounded-full border border-gold/50 flex items-center justify-center shrink-0">
                                  {hasChildren ? <ChevronLeft className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                </span>
                                <Folder className="h-4 w-4 text-gold shrink-0" />
                                <span className="flex-1 font-semibold truncate">{displayCategoryName(root.name)}</span>
                                {count > 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy text-white">{count}</span> : null}
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {classificationReady && classificationView === "tree" && (
                    <div className="rounded-lg border-2 border-gold/30 bg-card overflow-hidden">
                      <div className="max-h-[52vh] overflow-y-auto p-1.5">
                        {categories.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">אין קטגוריות עדיין</p>
                        ) : (
                          childrenOf(null).map((cat) => renderTreeNode(cat, 0))
                        )}
                      </div>
                    </div>
                  )}

                  <aside className="space-y-3 rounded-xl border-2 border-gold/25 bg-card p-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">מוצמדים</div>
                      <div className="flex flex-wrap gap-1.5">
                        {pinnedCats.length === 0 ? (
                          <span className="text-xs text-muted-foreground">אין נעיצות</span>
                        ) : (
                          pinnedCats.map((catName) => (
                            <button
                              key={catName}
                              type="button"
                              onClick={() => toggle(catName)}
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border",
                                selected.includes(catName) ? "border-navy bg-navy/10 text-navy" : "border-gold/40 hover:border-gold",
                              )}
                            >
                              <Pin className="h-3 w-3" />
                              <span className="truncate max-w-[120px]">{catName}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">נבחרו לאחרונה</div>
                      <div className="flex flex-wrap gap-1.5">
                        {recentExisting.length === 0 ? (
                          <span className="text-xs text-muted-foreground">אין היסטוריה</span>
                        ) : (
                          recentExisting.map((catName) => (
                            <button
                              key={catName}
                              type="button"
                              onClick={() => toggle(catName)}
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border",
                                selected.includes(catName) ? "border-navy bg-navy/10 text-navy" : "border-gold/40 hover:border-gold",
                              )}
                            >
                              <Clock3 className="h-3 w-3" />
                              <span className="truncate max-w-[120px]">{catName}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </aside>
                </section>

              </div>

              {!canSave && name.trim() && (
                <p className="text-xs text-destructive text-right">יש לבחור לפחות קטגוריה אחת</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-auto pt-2 gap-2 sm:gap-2 flex-row-reverse">
          <Button onClick={handleSave} disabled={!canSave} className="bg-gradient-navy text-primary-foreground">
            <Check className="h-4 w-4 ml-1" /> צור מערכת
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
        </DialogFooter>

        <div
          className="absolute inset-y-2 right-0 z-10 w-2 cursor-ew-resize border-r border-gold/20 hover:border-gold/50 transition-colors"
          onMouseDown={(e) => startResize("e", e)}
        />
        <div
          className="absolute inset-y-2 left-0 z-10 w-2 cursor-ew-resize border-l border-gold/20 hover:border-gold/50 transition-colors"
          onMouseDown={(e) => startResize("w", e)}
        />
        <div
          className="absolute inset-x-2 top-0 z-10 h-2 cursor-ns-resize border-t border-gold/20 hover:border-gold/50 transition-colors"
          onMouseDown={(e) => startResize("n", e)}
        />
        <div
          className="absolute inset-x-2 bottom-0 z-10 h-2 cursor-ns-resize border-b border-gold/20 hover:border-gold/50 transition-colors"
          onMouseDown={(e) => startResize("s", e)}
        />

      </DialogContent>
    </Dialog>
  );
}
