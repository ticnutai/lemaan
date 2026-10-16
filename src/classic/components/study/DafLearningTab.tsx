import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { useScrollToSelectedQuestions } from "@/hooks/useScrollToSelectedQuestions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTouchHold } from "@/hooks/useTouchHold";
import { ChevronRight, ChevronLeft, BookOpen, ListChecks, Play, PanelRightOpen, Maximize2, Minimize2, X, ZoomIn, BookText, Scroll, Layers, ArrowLeftRight, ChevronDown, Plus, ListTree, Check, GripVertical, Pin, PinOff, LineChart, Pencil } from "lucide-react";
import { MishnaLearningTab } from "./MishnaLearningTab";
import { ChumashLearningTab } from "./ChumashLearningTab";
import { NeviimKetuvimLearningTab } from "./NeviimKetuvimLearningTab";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStudy } from "@/lib/study/store";
import { SHAS_BAVLI, SEDARIM } from "@/lib/study/shasData";
import { dafLabel, toGematria } from "@/lib/study/shasGen";
import { filterCardsByDafAmud, countCardsPerDaf } from "@/lib/study/dafCards";
import { GemaraViewer } from "./GemaraViewer";
import { StudySession } from "./StudySession";
import { CardDecksDialog } from "./CardDecksDialog";
import { BulkCardDecksDialog } from "./BulkCardDecksDialog";
import { CardEditor } from "./CardEditor";
import { CardQuickEditor } from "./CardQuickEditor";
import { FitToContainer } from "./FitToContainer";
import { QuestionTypographyControl, useQuestionTypographyPreferences } from "./QuestionTypographyControl";
import { PageProgressDialog } from "./ShasProgressViews";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useLocation, useNavigate } from "react-router-dom";
import type { Card as StudyCardType } from "@/lib/study/types";
import { usePermissions } from "@/hooks/usePermissions";
import { STUDY_UI_DEFAULTS } from "@/config/studyUiDefaults";
import { useStableMobileNavigation } from "@/hooks/useStableMobileNavigation";
import { isCompleteShasLocation, formatShasLocation } from "@/lib/study/shasClassification";

type Layout = "stacked" | "split" | "text-only" | "cards-only";
type PracticeMode = "inline" | "fullscreen";
type SplitSide = "gemara-right" | "gemara-left";
type NavStep = "seder" | "masechta" | "daf" | "amud";
type ShasNavigationView = "expanded" | "drilldown";

const STORAGE_KEY = "daf-learning-state";
const NAV_VIEW_STORAGE_KEY = "daf-learning-navigation-view";

interface SavedState {
  seder?: string;
  masechta?: string;
  daf?: number;
  amud?: 1 | 2;
  layout?: Layout;
  splitSide?: SplitSide;
  splitRatio?: number;
  practiceMode?: PracticeMode;
  practiceScale?: number;
}

function loadSaved(): SavedState {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveState(s: SavedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function normalizeLayout(layout: SavedState["layout"] | string | undefined): Layout {
  if (layout === "split-v" || layout === "split-h") return "split";
  if (layout === "gemara" || layout === "text-only") return "cards-only";
  if (layout === "cards") return "cards-only";
  if (layout === "stacked" || layout === "split" || layout === "text-only" || layout === "cards-only") return layout;
  return "stacked";
}

export function DafLearningTabInner({ isVisible }: { isVisible: boolean }) {
  const isMobile = useIsMobile();
  const touchHold = useTouchHold();
  const { state, setUiPref, updateCard } = useStudy();
  const { isAdmin, can } = usePermissions();
  const questionTypography = useQuestionTypographyPreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const saved = useMemo(() => loadSaved(), []);

  const [seder, setSeder] = useState<string>(saved.seder ?? "מועד");
  const [masechta, setMasechta] = useState<string>(saved.masechta ?? "שבת");
  const [daf, setDaf] = useState<number>(saved.daf ?? 2);
  const [amud, setAmud] = useState<1 | 2>(saved.amud ?? 1);
  const [savedLayout, setLayoutState] = useState<Layout>(() => {
    return normalizeLayout(state.uiPrefs?.dafLearningLayout ?? saved.layout ?? STUDY_UI_DEFAULTS.dafLearningLayout);
  });
  const setLayout = useCallback((value: Layout) => {
    setLayoutState(value);
    setUiPref("dafLearningLayout", value);
  }, [setUiPref]);
  const [splitSide, setSplitSide] = useState<SplitSide>(saved.splitSide ?? "gemara-right");
  const [splitRatio, setSplitRatioState] = useState<number>(Math.max(20, Math.min(80, saved.splitRatio ?? 60)));
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [savedPracticeMode, setPracticeMode] = useState<PracticeMode>(saved.practiceMode ?? "inline");
  const layout = isMobile ? "stacked" : savedLayout;
  const practiceMode = isMobile ? "inline" : savedPracticeMode;
  const [practiceScale, setPracticeScale] = useState<number>(saved.practiceScale ?? 1);
  const [countsReady, setCountsReady] = useState(false);
  const [deckDialogCard, setDeckDialogCard] = useState<StudyCardType | null>(null);
  const [editingPracticeCard, setEditingPracticeCard] = useState<StudyCardType | null>(null);
  const [bulkDeckDialogOpen, setBulkDeckDialogOpen] = useState(false);
  const [navDialogOpen, setNavDialogOpen] = useState(false);
  const [navStep, setNavStep] = useState<NavStep>("seder");
  const [navSeder, setNavSeder] = useState<string>(saved.seder ?? "מועד");
  const [navMasechta, setNavMasechta] = useState<string>(saved.masechta ?? "שבת");
  const [navDaf, setNavDaf] = useState<number>(saved.daf ?? 2);
  const [navAmud, setNavAmud] = useState<1 | 2>(saved.amud ?? 1);
  const [navDafPage, setNavDafPage] = useState(0);
  // The last learned page is kept for continuity, but the picker itself always
  // starts unselected so opening Practice never implies a new choice.
  const [expandedSeder, setExpandedSeder] = useState<string>("");
  const [expandedMasechta, setExpandedMasechta] = useState<string>("");
  const [expandedDaf, setExpandedDaf] = useState<number | null>(null);
  const [navigationView, setNavigationViewState] = useState<ShasNavigationView>(() => {
    const synced = state.uiPrefs?.dafLearningNavigationView;
    if (synced === "expanded" || synced === "drilldown") return synced;
    try {
      const stored = localStorage.getItem(NAV_VIEW_STORAGE_KEY);
      if (stored === "expanded" || stored === "drilldown") return stored;
    } catch { /* use product default */ }
    return STUDY_UI_DEFAULTS.dafLearningNavigationView;
  });
  const setNavigationView = useCallback((value: ShasNavigationView) => {
    setNavigationViewState(value);
    setUiPref("dafLearningNavigationView", value);
  }, [setUiPref]);
  const [inlineStep, setInlineStep] = useState<NavStep>("seder");
  const showLegacyNavigator = false;
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [selectionConfirmed, setSelectionConfirmed] = useState(false);
  const selectedQuestionsRef = useScrollToSelectedQuestions(selectionConfirmed, `${seder}:${masechta}:${daf}:${amud}`);
  const stableNavigator = useStableMobileNavigation(navigationView === "drilldown", selectionConfirmed);
  const [dragOverAmud, setDragOverAmud] = useState<1 | 2 | null>(null);
  const [pinsDialogOpen, setPinsDialogOpen] = useState(false);
  const [pageProgressOpen, setPageProgressOpen] = useState(false);
  const isStandaloneSplitPage = location.pathname === "/split-view";

  const handleSplitPageToggle = () => {
    // אצלנו התרגול בנתיב /study (במקור — בעמוד הראשי "/")
    if (isStandaloneSplitPage) {
      navigate("/study");
      return;
    }
    navigate("/split-view");
  };

  // שמור בחירה
  useEffect(() => {
    saveState({
      seder,
      masechta,
      daf,
      amud,
      layout: savedLayout,
      splitSide,
      splitRatio,
      practiceMode: savedPracticeMode,
      practiceScale,
    });
  }, [seder, masechta, daf, amud, savedLayout, splitSide, splitRatio, savedPracticeMode, practiceScale]);

  useEffect(() => {
    try { localStorage.setItem(NAV_VIEW_STORAGE_KEY, navigationView); } catch { /* ignore */ }
  }, [navigationView]);

  useEffect(() => {
    const syncedLayout = state.uiPrefs?.dafLearningLayout;
    if (syncedLayout) setLayoutState(normalizeLayout(syncedLayout));
  }, [state.uiPrefs?.dafLearningLayout]);

  useEffect(() => {
    const syncedView = state.uiPrefs?.dafLearningNavigationView;
    if (syncedView === "expanded" || syncedView === "drilldown") setNavigationViewState(syncedView);
  }, [state.uiPrefs?.dafLearningNavigationView]);

  const setSplitRatio = (value: number) => {
    const next = Math.max(20, Math.min(80, Math.round(value)));
    setSplitRatioState(next);
  };

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (ev: MouseEvent) => {
      const rect = splitContainerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const ratioFromLeft = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(ratioFromLeft);
    };

    const onUp = () => setIsResizing(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  // איפוס מסכת אם הסדר השתנה ולא תואם
  const masechtos = useMemo(() => SHAS_BAVLI.filter((m) => m.seder === seder), [seder]);
  useEffect(() => {
    if (!masechtos.find((m) => m.name === masechta)) {
      setMasechta(masechtos[0]?.name ?? "");
      setDaf(2);
      setAmud(1);
    }
  }, [seder, masechtos, masechta]);

  const currentMasechet = SHAS_BAVLI.find((m) => m.name === masechta);
  const totalPages = currentMasechet?.pages ?? 0;

  // כדי שהטאב יופיע מיידית: דוחים את חישובי הספירות לזמן idle אחרי הציור הראשון.
  useEffect(() => {
    setCountsReady(false);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    const schedule = w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 0));
    const cancel = (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback ?? window.clearTimeout;
    const id = schedule(() => setCountsReady(true), { timeout: 250 });
    return () => cancel(id as number);
  }, [state.cards, state.categories, masechta, totalPages]);

  // ספירת כרטיסים פר-דף (לבחירה מהירה) — חישוב כבד, רץ רק כשהדפדפן פנוי
  const dafCounts = useMemo(
    () => (countsReady ? countCardsPerDaf(state.cards, state.categories, masechta, totalPages) : new Map()),
    [state.cards, state.categories, masechta, totalPages, countsReady],
  );

  const expandedMasechtaPages = useMemo(
    () => SHAS_BAVLI.find((entry) => entry.name === expandedMasechta)?.pages ?? 0,
    [expandedMasechta],
  );
  const navigationDafCounts = useMemo(
    () => (countsReady && expandedMasechta
      ? countCardsPerDaf(state.cards, state.categories, expandedMasechta, expandedMasechtaPages)
      : new Map<number, { a: number; b: number; total: number }>()),
    [countsReady, state.cards, state.categories, expandedMasechta, expandedMasechtaPages],
  );

  // Match the number displayed on each amud button to the questions actually
  // visible there, including legacy questions attached to the whole daf.
  const expandedAmudCounts = useMemo(() => {
    if (!expandedMasechta || expandedDaf === null) return { a: 0, b: 0 };
    return {
      a: filterCardsByDafAmud(state.cards, state.categories, expandedMasechta, expandedDaf, 1).length,
      b: filterCardsByDafAmud(state.cards, state.categories, expandedMasechta, expandedDaf, 2).length,
    };
  }, [state.cards, state.categories, expandedMasechta, expandedDaf]);

  // כרטיסים לעמוד הנוכחי
  const amudCards = useMemo(
    () => filterCardsByDafAmud(state.cards, state.categories, masechta, daf, amud, { includeDafOnly: false }),
    [state.cards, state.categories, masechta, daf, amud],
  );
  const cardsWithDafOnly = useMemo(
    () => filterCardsByDafAmud(state.cards, state.categories, masechta, daf, amud),
    [state.cards, state.categories, masechta, daf, amud],
  );
  const amudCardIds = useMemo(() => new Set(amudCards.map((card) => card.id)), [amudCards]);
  const dafOnlyCards = useMemo(
    () => cardsWithDafOnly.filter((card) => !amudCardIds.has(card.id)),
    [cardsWithDafOnly, amudCardIds],
  );
  const cards = cardsWithDafOnly;
  const cardIds = useMemo(() => cards.map((c) => c.id), [cards]);

  // ניווט דף קודם/הבא
  const goPrev = () => {
    if (amud === 2) { setAmud(1); return; }
    if (daf > 2) { setDaf(daf - 1); setAmud(2); }
  };
  const goNext = () => {
    if (amud === 1) { setAmud(2); return; }
    if (daf < totalPages + 1) { setDaf(daf + 1); setAmud(1); }
  };
  const isFirst = daf === 2 && amud === 1;
  const isLast = daf === totalPages + 1 && amud === 2;
  const closePractice = () => {
    setStudyOpen(false);
    setLayout("split");
  };

  // === הצמדות לגישה מהירה ===
  type DafPin = NonNullable<typeof state.uiPrefs>["dafLearningPins"] extends Array<infer P> | undefined ? P : never;
  const pins: DafPin[] = useMemo(
    () => state.uiPrefs?.dafLearningPins ?? [],
    [state.uiPrefs?.dafLearningPins],
  );
  const pinId = (m: string, d: number, a: 1 | 2) => `${m}::${d}::${a}`;
  const currentPinId = pinId(masechta, daf, amud);
  const isCurrentPinned = pins.some((p) => p.id === currentPinId);

  const togglePinCurrent = useCallback(() => {
    const exists = pins.some((p) => p.id === currentPinId);
    const next = exists
      ? pins.filter((p) => p.id !== currentPinId)
      : [...pins, { id: currentPinId, seder, masechta, daf, amud, createdAt: Date.now() }];
    setUiPref("dafLearningPins", next);
  }, [pins, currentPinId, seder, masechta, daf, amud, setUiPref]);

  const jumpToPin = useCallback((p: DafPin) => {
    setSeder(p.seder);
    setMasechta(p.masechta);
    setDaf(p.daf);
    setAmud(p.amud);
    setExpandedSeder(p.seder);
    setExpandedMasechta(p.masechta);
    setExpandedDaf(p.daf);
    setSelectionConfirmed(true);
    setPinsDialogOpen(false);
  }, []);


  const openNavDialog = (startStep: NavStep) => {
    setNavSeder(seder);
    setNavMasechta(masechta);
    setNavDaf(daf);
    setNavAmud(amud);
    setNavStep(startStep);
    setNavDialogOpen(true);
  };

  const navMasechtos = useMemo(
    () => SHAS_BAVLI.filter((m) => m.seder === navSeder),
    [navSeder],
  );
  const navCurrentMasechet = useMemo(
    () => SHAS_BAVLI.find((m) => m.name === navMasechta),
    [navMasechta],
  );
  const navTotalPages = navCurrentMasechet?.pages ?? 0;
  const navDafOptions = useMemo(
    () => Array.from({ length: navTotalPages }, (_, i) => i + 2),
    [navTotalPages],
  );
  const navDafCounts = useMemo(
    () =>
      countsReady && navMasechta
        ? countCardsPerDaf(state.cards, state.categories, navMasechta, navTotalPages)
        : new Map<number, { total: number; a: number; b: number }>(),
    [state.cards, state.categories, navMasechta, navTotalPages, countsReady],
  );
  const navDafChunkSize = useMemo(() => {
    if (typeof window === "undefined") return 40;
    if (window.innerWidth < 640) return 24;
    if (window.innerWidth < 1024) return 40;
    return 60;
  }, [navDialogOpen]);
  const navDafPageCount = Math.max(
    1,
    Math.ceil(navDafOptions.length / navDafChunkSize),
  );
  const canGoPrevNavPage = navDafPage > 0;
  const canGoNextNavPage = navDafPage < navDafPageCount - 1;
  const visibleNavDafs = useMemo(() => {
    const from = navDafPage * navDafChunkSize;
    return navDafOptions.slice(from, from + navDafChunkSize);
  }, [navDafOptions, navDafPage, navDafChunkSize]);

  useEffect(() => {
    if (!navDialogOpen || navStep !== "daf") return;
    const idx = Math.max(0, navDafOptions.indexOf(navDaf));
    setNavDafPage(Math.floor(idx / navDafChunkSize));
  }, [navDialogOpen, navStep, navDafOptions, navDaf, navDafChunkSize]);

  const applyNavSelection = (pickedAmud: 1 | 2) => {
    setSeder(navSeder);
    setMasechta(navMasechta);
    setDaf(navDaf);
    setAmud(pickedAmud);
    setNavAmud(pickedAmud);
    setNavDialogOpen(false);
    setSelectionConfirmed(true);
  };

  const applyInlineAmudSelection = (pickedAmud: 1 | 2) => {
    if (!expandedMasechta || expandedDaf === null) return;

    // Keep the visible hierarchy and the active learning page in sync. Updating
    // the complete selection together prevents the validation effect from
    // restoring the previous amud while changing between sedarim/masechtot.
    setSeder(expandedSeder);
    setMasechta(expandedMasechta);
    setDaf(expandedDaf);
    setAmud(pickedAmud);
    setNavSeder(expandedSeder);
    setNavMasechta(expandedMasechta);
    setNavDaf(expandedDaf);
    setNavAmud(pickedAmud);
    setLayout("stacked");
    setSelectionConfirmed(true);
  };

  const classifyDraggedQuestion = (cardId: string, targetAmud: 1 | 2) => {
    if (!expandedMasechta || expandedDaf === null) return;
    updateCard(cardId, {
      masechta: expandedMasechta,
      daf: expandedDaf,
      amud: targetAmud,
    });
    setDragOverAmud(null);
    toast({
      title: `השאלה סווגה לעמוד ${targetAmud === 1 ? "א׳" : "ב׳"}`,
      description: `${expandedMasechta}, דף ${dafLabel(expandedDaf).replace(".", "")}`,
    });
  };

  const classifyPracticeQuestion = (cardId: string, targetAmud: 1 | 2) => {
    if (!isAdmin) return;
    updateCard(cardId, { masechta, daf, amud: targetAmud });
    setDragOverAmud(null);
    toast({
      title: `השאלה סווגה לעמוד ${targetAmud === 1 ? "א׳" : "ב׳"}`,
      description: `${masechta}, דף ${dafLabel(daf).replace(".", "")}`,
    });
  };

  const adminPracticeAmudTargets = isAdmin ? (
    <div data-testid="admin-practice-amud-targets" className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/5 px-3 py-2" dir="rtl">
      <span className="text-xs font-semibold text-muted-foreground">סיווג השאלה הנוכחית · דף {dafLabel(daf).replace(".", "")}</span>
      {([1, 2] as const).map((pageSide) => (
        <Button
          key={pageSide}
          type="button"
          size="sm"
          variant="outline"
          data-testid={`practice-amud-drop-${pageSide}`}
          className={cn("h-8 min-w-24 border-gold/50 text-xs font-bold transition-all", dragOverAmud === pageSide && "scale-[1.03] border-gold bg-gold/20 ring-4 ring-gold/25")}
          onDragEnter={(event) => { event.preventDefault(); setDragOverAmud(pageSide); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverAmud(null); }}
          onDrop={(event) => {
            event.preventDefault();
            const cardId = event.dataTransfer.getData("application/x-study-card-id") || event.dataTransfer.getData("text/plain");
            if (cardId) classifyPracticeQuestion(cardId, pageSide);
            else setDragOverAmud(null);
          }}
        >
          עמוד {pageSide === 1 ? "א׳" : "ב׳"}
        </Button>
      ))}
    </div>
  ) : null;

  const handleChooseSeder = (nextSeder: string) => {
    const nextMasechtos = SHAS_BAVLI.filter((m) => m.seder === nextSeder);
    const nextMasechta =
      nextMasechtos.find((m) => m.name === navMasechta)?.name ??
      nextMasechtos[0]?.name ??
      "";
    setNavSeder(nextSeder);
    setNavMasechta(nextMasechta);
    setNavDaf(2);
    setNavStep("masechta");
  };

  const handleChooseMasechta = (nextMasechta: string) => {
    setNavMasechta(nextMasechta);
    setNavDaf(2);
    setNavStep("daf");
  };

  const handleChooseDaf = (nextDaf: number) => {
    setNavDaf(nextDaf);
    setNavStep("amud");
  };

  const handleNavDialogKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setNavDialogOpen(false);
        return;
      }
      if (navStep !== "daf") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setNavDafPage((p) => Math.max(0, p - 1));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setNavDafPage((p) => Math.min(navDafPageCount - 1, p + 1));
      }
    },
    [navStep, navDafPageCount],
  );

  // לימוד פעיל במצב מסך מלא בלבד — מציג רק את ה-StudySession
  if (studyOpen && practiceMode === "fullscreen" && cardIds.length > 0) {
    return (
      <div className="space-y-2" dir="rtl">
        {adminPracticeAmudTargets}
        <StudySession
          deckId={null}
          mode="practice"
          cardIds={cardIds}
          sourceContext={{ masechta, daf, amud }}
          classificationDragEnabled={isAdmin}
          onExit={closePractice}
        />
      </div>
    );
  }

  // ====== Render ======
  const navigator = (
    <Card {...stableNavigator} data-testid="daf-inline-navigator" className="gold-frame p-3 space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/30 bg-muted/20 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="h-9 w-9 border-gold/50" title="בחר תצוגת ניווט" aria-label="בחר תצוגת ניווט"><ListTree className="h-4 w-4 text-gold" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52" dir="rtl"><DropdownMenuLabel>תצוגת ניווט</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setNavigationView("expanded")} className={cn(navigationView === "expanded" && "bg-gold/10")}><Check className={cn("ml-2 h-4 w-4", navigationView !== "expanded" && "opacity-0")} />עץ פתוח</DropdownMenuItem><DropdownMenuItem onClick={() => { setNavigationView("drilldown"); setInlineStep("seder"); }} className={cn(navigationView === "drilldown" && "bg-gold/10")}><Check className={cn("ml-2 h-4 w-4", navigationView !== "drilldown" && "opacity-0")} />שלב אחר שלב</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Button
            type="button"
            size="icon"
            variant={isCurrentPinned ? "default" : "outline"}
            className={cn("h-9 w-9 shrink-0 border-gold/50", isCurrentPinned && "bg-gradient-navy text-primary-foreground")}
            onClick={togglePinCurrent}
            disabled={!selectionConfirmed}
            title={isCurrentPinned ? "הסר את העמוד הנוכחי מההצמדות" : "הצמד את המסכת, הדף והעמוד הנוכחיים"}
            aria-label={isCurrentPinned ? "הסר הצמדה" : "הוסף הצמדה"}
          >
            {isCurrentPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4 text-gold" />}
          </Button>
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            {[...pins].slice(-3).reverse().map((p) => {
              const activePin = p.id === currentPinId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => jumpToPin(p)}
                  className={cn("h-8 shrink-0 rounded-lg border px-2.5 text-xs font-semibold transition", activePin ? "border-navy bg-gradient-navy text-white" : "border-gold/40 bg-card hover:bg-gold/10")}
                  title={`${p.masechta} · דף ${dafLabel(p.daf).replace(".", "")} · עמוד ${p.amud === 1 ? "א׳" : "ב׳"}`}
                >
                  {p.masechta} · {dafLabel(p.daf).replace(".", "")} · {p.amud === 1 ? "ע״א" : "ע״ב"}
                </button>
              );
            })}
          </div>
          <Button type="button" variant="outline" className="h-9 shrink-0 gap-1.5 border-gold/50" onClick={() => setPinsDialogOpen(true)} title="הצג את כל ההצמדות">
            <ListTree className="h-4 w-4 text-gold" />
            <span className="hidden sm:inline">כל ההצמדות</span>
            {pins.length > 0 && <span className="rounded-full bg-gold/15 px-1.5 text-xs">{pins.length}</span>}
          </Button>
        </div>
      </div>

      {navigationView === "drilldown" && inlineStep !== "seder" && (
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border-2 border-gold/40 bg-gold/5 px-4 py-2 text-right hover:bg-gold/10"
          onClick={() => {
            setExpandedMasechta("");
            setExpandedDaf(null);
            setSelectionConfirmed(false);
            setInlineStep("masechta");
          }}
        >
          <strong>סדר {expandedSeder}</strong>
          <span className="text-xs text-muted-foreground">לחץ לפתיחת הסדר מחדש</span>
        </button>
      )}

      {(navigationView === "expanded" || inlineStep === "seder") && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="סדרי הש״ס">
        {SEDARIM.map((item) => {
          const tractateCount = SHAS_BAVLI.filter((entry) => entry.seder === item).length;
          const selected = item === expandedSeder;
          return (
            <button
              key={item}
              type="button"
              aria-expanded={selected}
              className={cn(
                "rounded-xl border-2 px-3 py-3 text-center transition-colors",
                selected
                  ? "border-gold bg-gradient-navy text-primary-foreground shadow-sm"
                  : "border-gold/30 bg-card hover:border-gold/70 hover:bg-gold/5",
              )}
              onClick={() => {
                setExpandedSeder(item);
                setExpandedMasechta("");
                setExpandedDaf(null);
                setSelectionConfirmed(false);
                if (navigationView === "drilldown") setInlineStep("masechta");
              }}
            >
              <BookOpen className="mx-auto mb-1 h-4 w-4" />
              <span className="block font-semibold">{item}</span>
              <span className={cn("text-[11px]", selected ? "text-primary-foreground/75" : "text-muted-foreground")}>
                {tractateCount} מסכתות
              </span>
            </button>
          );
        })}
      </div>}

      {expandedSeder && (navigationView === "expanded" || inlineStep === "masechta") && <div className="rounded-xl border border-gold/35 bg-gold/5 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <strong>סדר {expandedSeder}</strong>
          {navigationView === "drilldown"
            ? <Button size="sm" variant="ghost" onClick={() => setInlineStep("seder")}><ChevronRight className="ml-1 h-4 w-4" />חזרה לסדרים</Button>
            : <span className="text-xs text-muted-foreground">בחר מסכת לפתיחה</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {SHAS_BAVLI.filter((entry) => entry.seder === expandedSeder).map((entry) => (
            <Button
              key={entry.name}
              type="button"
              size="sm"
              variant={entry.name === expandedMasechta ? "default" : "outline"}
              className={cn("justify-between", entry.name === expandedMasechta && "bg-gradient-navy text-primary-foreground")}
              onClick={() => {
                setExpandedMasechta(entry.name);
                setExpandedDaf(null);
                setSelectionConfirmed(false);
                if (navigationView === "drilldown") setInlineStep("daf");
              }}
            >
              <span>{entry.name}</span>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
      </div>}

      {expandedMasechta && (navigationView === "expanded" || inlineStep === "daf") && (() => {
        const selectedMasechta = SHAS_BAVLI.find((entry) => entry.name === expandedMasechta);
        const pages = Array.from({ length: selectedMasechta?.pages ?? 0 }, (_, index) => index + 2);
        return (
          <div className="rounded-xl border border-gold/35 bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <strong>{expandedMasechta} — בחירת דף</strong>
              {navigationView === "drilldown"
                ? <Button size="sm" variant="ghost" onClick={() => setInlineStep("masechta")}><ChevronRight className="ml-1 h-4 w-4" />חזרה למסכתות</Button>
                : <span className="text-xs text-muted-foreground">כל דפי המסכת</span>}
            </div>
            <div className="grid max-h-52 grid-cols-5 gap-1.5 overflow-y-auto p-1 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-14">
              {pages.map((page) => (
                <Button
                  key={page}
                  type="button"
                  size="sm"
                  variant={expandedDaf === page ? "default" : "outline"}
                  className={cn("h-9 px-1", expandedDaf === page && "bg-gradient-navy text-primary-foreground")}
                  onClick={() => {
                    setExpandedDaf(page);
                    setSelectionConfirmed(false);
                    if (navigationView === "drilldown") setInlineStep("amud");
                  }}
                >
                  <span>{dafLabel(page).replace(".", "")}</span>
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-gold/70 bg-white px-1 text-[10px] font-bold tabular-nums text-gold shadow-sm"
                    data-testid={`inline-daf-${page}-count`}
                    title="סך כל השאלות בדף"
                  >
                    {navigationDafCounts.get(page)?.total ?? 0}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        );
      })()}

      {expandedMasechta && expandedDaf !== null && (navigationView === "expanded" || inlineStep === "amud") && (
        <div className="rounded-xl border-2 border-gold/45 bg-gold/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 font-semibold">
            <span>{expandedMasechta}, דף {dafLabel(expandedDaf).replace(".", "")} — בחר עמוד</span>
            {navigationView === "drilldown" && <Button size="sm" variant="ghost" onClick={() => setInlineStep("daf")}><ChevronRight className="ml-1 h-4 w-4" />חזרה לדפים</Button>}
          </div>
          <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
            {([1, 2] as const).map((pageSide) => (
              <Button
                key={pageSide}
                type="button"
                variant={selectionConfirmed && masechta === expandedMasechta && daf === expandedDaf && amud === pageSide ? "default" : "outline"}
                className={cn(
                  "h-11 text-base transition-all",
                  selectionConfirmed && masechta === expandedMasechta && daf === expandedDaf && amud === pageSide && "bg-gradient-navy text-primary-foreground",
                  dragOverAmud === pageSide && "scale-[1.02] border-gold bg-gold/20 ring-4 ring-gold/25",
                )}
                aria-pressed={selectionConfirmed && masechta === expandedMasechta && daf === expandedDaf && amud === pageSide}
                data-testid={`inline-amud-${pageSide}`}
                onClick={() => applyInlineAmudSelection(pageSide)}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragOverAmud(pageSide);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverAmud(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const cardId = event.dataTransfer.getData("application/x-study-card-id") || event.dataTransfer.getData("text/plain");
                  if (cardId) classifyDraggedQuestion(cardId, pageSide);
                  else setDragOverAmud(null);
                }}
              >
                <span>עמוד {pageSide === 1 ? "א׳" : "ב׳"}</span>
                <span
                  className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-gold/70 bg-white px-1.5 text-xs font-bold tabular-nums text-gold shadow-sm"
                  data-testid={`inline-amud-${pageSide}-count`}
                  title={`מספר השאלות המשויכות לעמוד ${pageSide === 1 ? "א׳" : "ב׳"}`}
                >
                  {pageSide === 1 ? expandedAmudCounts.a : expandedAmudCounts.b}
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {showLegacyNavigator && <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" aria-hidden="true">

        {/* דף */}
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-between px-3"
          onClick={() => openNavDialog("daf")}
          title="פתח בחירה מהירה של דף"
        >
          <span>
            דף {dafLabel(daf).replace(".", "")}
            {dafCounts.get(daf)?.total ? (
              <span className="text-gold mr-2 text-xs">
                ({dafCounts.get(daf)?.total})
              </span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>

        {/* עמוד */}
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-between px-3"
          onClick={() => openNavDialog("amud")}
          title="בחר עמוד"
        >
          <span>
            {amud === 1 ? 'ע"א' : 'ע"ב'}
            {amud === 1 && dafCounts.get(daf)?.a ? (
              <span className="text-gold mr-2 text-xs">({dafCounts.get(daf)?.a})</span>
            ) : null}
            {amud === 2 && dafCounts.get(daf)?.b ? (
              <span className="text-gold mr-2 text-xs">({dafCounts.get(daf)?.b})</span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>

        <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
          <SelectTrigger><SelectValue placeholder="פריסה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="stacked">שאלות ומטה גמרא</SelectItem>
            <SelectItem value="split">טקסט + שאלות</SelectItem>
            <SelectItem value="text-only">טקסט בלבד</SelectItem>
            <SelectItem value="cards-only">שאלות בלבד</SelectItem>
          </SelectContent>
        </Select>

        <div className="col-span-2 lg:col-span-1 rounded-md border border-gold/20 px-2 py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
              {pins.length === 0 ? (
                <button
                  type="button"
                  onClick={togglePinCurrent}
                  className="text-xs text-muted-foreground hover:text-gold transition-colors whitespace-nowrap"
                  title="הצמד את העמוד הנוכחי לגישה מהירה"
                >
                  📌 הצמד עמוד לגישה מהירה
                </button>
              ) : (
                <div className="flex items-center gap-1.5 whitespace-nowrap" dir="rtl">
                  {pins.map((p) => {
                    const isActive = p.masechta === masechta && p.daf === daf && p.amud === amud;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => jumpToPin(p)}
                        className={cn(
                          "h-7 px-2 rounded-md border text-[11px] transition-colors shrink-0",
                          isActive
                            ? "bg-navy text-cream border-navy"
                            : "border-gold/40 text-navy hover:bg-gold/10",
                        )}
                        title={`${p.masechta} · דף ${dafLabel(p.daf).replace(".", "")} · ${p.amud === 1 ? 'ע"א' : 'ע"ב'}`}
                      >
                        {p.masechta} {dafLabel(p.daf).replace(".", "")}{p.amud === 1 ? "." : ":"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {layout === "split" && (
              <button
                type="button"
                className="h-6 w-6 shrink-0 rounded-sm border border-gold/40 text-navy hover:bg-gold/10 transition-colors"
                title={isStandaloneSplitPage ? "חזור למסך הראשי" : "פתח בעמוד נפרד"}
                onClick={handleSplitPageToggle}
              >
                {isStandaloneSplitPage ? <Minimize2 className="h-3.5 w-3.5 mx-auto" /> : <Maximize2 className="h-3.5 w-3.5 mx-auto" />}
              </button>
            )}
          </div>
        </div>
      </div>}
    </Card>
  );

  const gemara = (
    <GemaraViewer
      key={`${masechta}-${daf}-${amud}`}
      masechta={masechta}
      daf={daf}
      amud={amud}
      className="h-full"
      isActive={isVisible}
      onPrev={goPrev}
      onNext={goNext}
      canPrev={!isFirst}
      canNext={!isLast}
      onTogglePin={togglePinCurrent}
      isPinned={isCurrentPinned}
    />
  );

  const startPractice = () => setStudyOpen(true);
  const practiceModeMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" className="h-8 w-8 border-gold/50" title="הגדרות תרגול">
          {practiceMode === "inline" ? <PanelRightOpen className="h-4 w-4 text-gold" /> : <Maximize2 className="h-4 w-4 text-gold" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>פתיחת תרגול</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setPracticeMode("inline")} className={cn(practiceMode === "inline" && "bg-gold/10")}>
          <PanelRightOpen className="h-4 w-4 ml-2" /> ליד הגמרא (פאנל)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setPracticeMode("fullscreen")} className={cn(practiceMode === "fullscreen" && "bg-gold/10")}>
          <Maximize2 className="h-4 w-4 ml-2" /> מסך מלא
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const practicePanel = (
    <Card className="gold-frame p-3 flex flex-col h-full" dir="rtl">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-1">
          <Play className="h-4 w-4 fill-current text-gold" /> תרגול · {cards.length} שאלות
        </h3>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="outline"
              className="hidden md:inline-flex h-7 w-7 border-gold/50"
                title="קנה מידה של התרגול"
              >
                <ZoomIn className="h-4 w-4 text-gold" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end" dir="rtl">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">קנה מידה</span>
                  <span className="font-bold text-gold">{Math.round(practiceScale * 100)}%</span>
                </div>
                <Slider
                  min={40}
                  max={100}
                  step={5}
                  value={[Math.round(practiceScale * 100)]}
                  onValueChange={(v) => setPracticeScale((v[0] ?? 100) / 100)}
                />
                <div className="flex items-center justify-between gap-1 pt-1">
                  <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={() => setPracticeScale(1)}>100%</Button>
                  <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={() => setPracticeScale(0.75)}>75%</Button>
                  <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={() => setPracticeScale(0.5)}>50%</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="ghost" onClick={closePractice} className="h-7 gap-1">
            <X className="h-4 w-4" /> סגור תרגול
          </Button>
        </div>
      </div>
      {adminPracticeAmudTargets}
      <div className="flex-1 min-h-0">
        <FitToContainer enabled={!isMobile && practiceScale !== 1} manualScale={isMobile ? 1 : practiceScale}>
          <StudySession
            key={cardIds.join(",")}
            deckId={null}
            mode="practice"
            cardIds={cardIds}
            sourceContext={{ masechta, daf, amud }}
            classificationDragEnabled={isAdmin}
            onExit={closePractice}
            fillHeight={!isMobile && practiceScale !== 1}
          />
        </FitToContainer>
      </div>
    </Card>
  );

  const canEditPracticeQuestions = can("cards", "edit");
  const activeEditingPracticeCard = editingPracticeCard
    ? state.cards.find((card) => card.id === editingPracticeCard.id) ?? editingPracticeCard
    : null;

  const questionEditButton = (card: StudyCardType) => canEditPracticeQuestions && !isMobile ? (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="pointer-events-none h-8 w-8 shrink-0 border-gold/50 bg-background/95 opacity-0 shadow-sm transition-[opacity,background-color,border-color] hover:border-gold hover:bg-gold/10 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100"
      title="ערוך שאלה ותשובות"
      aria-label={`ערוך שאלה: ${card.question}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setEditingPracticeCard(card);
      }}
    >
      <Pencil className="h-4 w-4 text-gold" />
    </Button>
  ) : null;

  const mobileActionClass = "max-md:h-14 max-md:min-w-0 max-md:gap-3 max-md:rounded-full max-md:border-2 max-md:border-gold/70 max-md:px-5 max-md:text-base max-md:font-bold max-md:shadow-elegant max-md:ring-2 max-md:ring-gold/20";
  const cardsPanel = (
    <Card className="gold-frame p-4 flex flex-col h-full" dir="rtl">
    <div data-testid="daf-question-tools" className="mb-3 flex flex-wrap items-center justify-between gap-3 max-md:grid max-md:w-full max-md:grid-cols-[minmax(0,1fr)_auto_auto_auto] max-md:gap-2">
        <div data-testid="daf-primary-actions" className="flex flex-nowrap md:flex-wrap items-center gap-3 max-md:contents">
          <Button
            size="lg"
            className="h-12 min-w-0 gap-2 rounded-xl bg-gradient-navy px-6 text-base font-bold text-primary-foreground shadow-elegant ring-2 ring-gold/40 transition hover:brightness-110 max-md:h-10 max-md:gap-1 max-md:px-2 max-md:text-xs"
            aria-label="הוספת שאלות לעמוד זה"
            onClick={() => setAddQuestionOpen(true)}
          >
            <Plus className="h-4 w-4 shrink-0" /><span className="md:hidden">הוסף שאלה</span><span className="hidden md:inline">הוספת שאלות לעמוד זה</span>
          </Button>
          {cards.length > 0 && <>
            <Button
              size="icon"
              variant="outline"
              className="hidden md:inline-flex h-8 w-8 border-gold/50"
              title="בחירה מהירה וסיווג"
              onClick={() => setBulkDeckDialogOpen(true)}
            >
              <Layers className="h-4 w-4 text-gold" />
            </Button>
            {!isMobile && practiceModeMenu}
            <Button
              onClick={startPractice}
              size="sm"
              data-testid="daf-start-practice"
              className={cn("bg-gradient-navy text-primary-foreground transition hover:brightness-110 max-md:order-first max-md:col-span-4 max-md:w-full", mobileActionClass)}
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-gold/70 bg-white/10 text-gold shadow-sm">
                <Play className="h-5 w-5 translate-x-[-1px] fill-current" />
              </span>
              <span>תרגול</span>
            </Button>
          </>}
        </div>
        <div className="flex items-center gap-3 max-md:contents">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-gold/50 font-semibold max-md:h-10 max-md:gap-1 max-md:px-2 max-md:text-xs"
            disabled={!selectionConfirmed}
            title="הצג את כל המבחנים, החזרות והמגמה של עמוד זה"
            aria-label="התקדמות לעמוד זה"
            onClick={() => setPageProgressOpen(true)}
          >
            <LineChart className="h-4 w-4 text-gold" /> התקדמות
          </Button>
          <QuestionTypographyControl preferences={questionTypography} />
          <h3 aria-label={`${cards.length} שאלות זמינות לעמוד זה`} className="text-sm font-semibold flex items-center gap-1 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1"><ListChecks className="h-4 w-4 text-gold" /> שאלות זמינות לעמוד זה</span><span data-testid="daf-question-count" dir="ltr">({cards.length})</span>
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" className="hidden md:inline-flex h-8 w-8 border-gold/50" title="בחר תצוגת שאלות וטקסט" aria-label="בחר תצוגת שאלות וטקסט">
                <PanelRightOpen className="h-4 w-4 text-gold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64" dir="rtl">
              <DropdownMenuLabel>תצוגת שאלות וטקסט</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLayout("cards-only")} className={cn(layout === "cards-only" && "bg-gold/10")}>
                <Check className={cn("ml-2 h-4 w-4", layout !== "cards-only" && "opacity-0")} /> שאלות בלבד
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLayout("stacked")} className={cn(layout === "stacked" && "bg-gold/10")}>
                <Check className={cn("ml-2 h-4 w-4", layout !== "stacked" && "opacity-0")} /> שאלות וגמרא למטה
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLayout("split")} className={cn(layout === "split" && "bg-gold/10")}>
                <Check className={cn("ml-2 h-4 w-4", layout !== "split" && "opacity-0")} /> שאלות וגמרא בחלוקה
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1" data-testid="daf-question-list">
        {cards.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-12">
            אין שאלות משויכות לעמוד זה.<br />
            <span className="text-xs">תוכל להוסיף שאלות בלשונית &quot;שאלות חזרה&quot; ולשייך אותן לקטגוריית &quot;{masechta} › דף {toGematria(daf)} › {amud === 1 ? 'ע"א' : 'ע"ב'}&quot;.</span>
          </div>
        ) : (<>
          {amudCards.map((c, i) => (
            <div
              key={c.id}
              {...touchHold(isMobile && canEditPracticeQuestions, () => setEditingPracticeCard(c))}
              draggable={!isMobile}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-study-card-id", c.id);
                event.dataTransfer.setData("text/plain", c.id);
              }}
              onDragEnd={() => setDragOverAmud(null)}
              className="group rounded-lg border border-gold/30 bg-card p-3 transition-colors hover:border-gold/60"
              style={questionTypography.questionCardStyle}
            >
              <div className="flex items-start gap-2">
                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-gold/70 opacity-60 group-hover:opacity-100 active:cursor-grabbing" aria-label="גרור לסיווג בעמוד א׳ או ב׳" />
                <span className="text-xs text-gold font-bold shrink-0 mt-0.5">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground" style={questionTypography.questionTextStyle}>{c.question}</div>
                  <div className="text-xs text-muted-foreground mt-1 capitalize">
                    {c.type === "flashcard" && "פתוחה"}
                    {c.type === "multiple" && "אמריקאית"}
                    {c.type === "boolean" && "נכון/לא נכון"}
                    {c.type === "combo" && "משולבת"}
                  </div>
                </div>
                {questionEditButton(c)}
              </div>
            </div>
          ))}
          {dafOnlyCards.length > 0 && (
            <div className="sticky top-0 z-10 mt-3 rounded-lg border border-gold/40 bg-muted px-3 py-2 text-xs font-semibold text-foreground">
              שאלות ברמת הדף — זמינות לתרגול בעמוד א׳ ובעמוד ב׳ עד לסיווג ({dafOnlyCards.length})
            </div>
          )}
          {dafOnlyCards.map((c, i) => (
            <div
              key={c.id}
              {...touchHold(isMobile && canEditPracticeQuestions, () => setEditingPracticeCard(c))}
              draggable={!isMobile}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-study-card-id", c.id);
                event.dataTransfer.setData("text/plain", c.id);
              }}
              onDragEnd={() => setDragOverAmud(null)}
              className="group rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:border-gold/50"
              style={questionTypography.questionCardStyle}
            >
              <div className="flex items-start gap-2">
                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-gold/70 opacity-60 group-hover:opacity-100 active:cursor-grabbing" aria-label="גרור לסיווג בעמוד א׳ או ב׳" />
                <span className="text-xs text-muted-foreground font-bold shrink-0 mt-0.5">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground" style={questionTypography.questionTextStyle}>{c.question}</div>
                  <div className="text-xs text-muted-foreground mt-1 capitalize">
                    {c.type === "flashcard" && "פתוחה"}
                    {c.type === "multiple" && "אמריקאית"}
                    {c.type === "boolean" && "נכון/לא נכון"}
                    {c.type === "combo" && "משולבת"}
                  </div>
                </div>
                {questionEditButton(c)}
              </div>
            </div>
          ))}
        </>)}
      </div>
    </Card>
  );

  const cardsContent = studyOpen && practiceMode === "inline" ? practicePanel : cardsPanel;
  const firstPanel = splitSide === "gemara-right" ? gemara : cardsContent;
  const secondPanel = splitSide === "gemara-right" ? cardsContent : gemara;

  return (
    <div className="space-y-4" dir="rtl">
      {navigator}
      {selectionConfirmed && <div ref={selectedQuestionsRef} style={{ height: "calc(100vh - 180px)", minHeight: 940 }}>
        {layout === "stacked" && (
          <div className="grid h-full min-h-0 grid-rows-[minmax(540px,3fr)_minmax(360px,2fr)] gap-4">
            <div className="min-h-0">{cardsContent}</div>
            <div className="min-h-0">{gemara}</div>
          </div>
        )}

        {layout === "split" && (
          <>
            <div className="grid grid-cols-1 gap-4 lg:hidden h-full">
              <div className="min-h-0">{firstPanel}</div>
              <div className="min-h-0">{secondPanel}</div>
            </div>

            <div
              ref={splitContainerRef}
              className="hidden lg:flex h-full min-h-0 relative flex-row-reverse"
            >
              <div className="h-full min-h-0" style={{ width: `${splitRatio}%` }}>
                {firstPanel}
              </div>

              <div className="relative mx-1 w-2 shrink-0 group/divider">
                <button
                  type="button"
                  className="absolute top-2 left-1/2 z-10 -translate-x-1/2 h-7 w-7 rounded-full border border-gold/40 bg-card/90 text-navy shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover/divider:opacity-100 hover:opacity-100 hover:bg-gold/10"
                  title={
                    splitSide === "gemara-right"
                      ? "החלף צדדים: גמרא לשמאל, שאלות לימין"
                      : "החלף צדדים: גמרא לימין, שאלות לשמאל"
                  }
                  onClick={() =>
                    setSplitSide((prev) =>
                      prev === "gemara-right" ? "gemara-left" : "gemara-right",
                    )
                  }
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 mx-auto" />
                </button>

                <div
                  className={cn(
                    "w-2 h-full rounded-full bg-gold/20 hover:bg-gold/40 cursor-col-resize opacity-0 group-hover/divider:opacity-100 transition-[opacity,background-color]",
                    isResizing && "bg-gold/50 opacity-100",
                  )}
                  title="גרור לשינוי יחס"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                  }}
                />
              </div>

              <div className="h-full min-h-0" style={{ width: `${100 - splitRatio}%` }}>
                {secondPanel}
              </div>
            </div>
          </>
        )}

        {layout === "text-only" && (
          <div className="grid grid-cols-1 h-full">
            <div className="min-h-0">{gemara}</div>
          </div>
        )}

        {layout === "cards-only" && (
          <div className="grid grid-cols-1 h-full">
            <div className="min-h-0">{cardsContent}</div>
          </div>
        )}
      </div>}

      <CardDecksDialog
        card={deckDialogCard}
        open={!!deckDialogCard}
        onOpenChange={(open) => {
          if (!open) setDeckDialogCard(null);
        }}
      />

      <BulkCardDecksDialog
        cards={cards}
        open={bulkDeckDialogOpen}
        onOpenChange={setBulkDeckDialogOpen}
      />

      <PageProgressDialog
        open={pageProgressOpen}
        onOpenChange={setPageProgressOpen}
        masechta={masechta}
        daf={daf}
        amud={amud}
      />

      <Dialog open={addQuestionOpen} onOpenChange={setAddQuestionOpen}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">הוספת שאלות לעמוד זה</DialogTitle>
          </DialogHeader>
          <CardEditor
            deckId={null}
            prefillDaf={{ masechta, daf, amud }}
            onClose={() => setAddQuestionOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!activeEditingPracticeCard}
        onOpenChange={(open) => {
          if (!open) setEditingPracticeCard(null);
        }}
        modal={false}
      >
        <DialogContent
          className="max-h-[92vh] max-w-4xl overflow-y-auto border-2 border-gold/45 shadow-2xl"
          dir="rtl"
          showOverlay={false}
          data-testid="practice-question-editor"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-end gap-2 text-right">
              <Pencil className="h-5 w-5 text-gold" /> עריכת שאלה ותשובות
            </DialogTitle>
          </DialogHeader>
          {activeEditingPracticeCard && (
            <CardQuickEditor
              key={activeEditingPracticeCard.id}
              card={activeEditingPracticeCard}
              onClose={() => setEditingPracticeCard(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={navDialogOpen} onOpenChange={setNavDialogOpen} modal={false}>
        <DialogContent
          className="max-w-2xl p-5 gap-3"
          dir="rtl"
          showOverlay={false}
          onKeyDown={handleNavDialogKeyDown}
        >
          <DialogHeader>
            <DialogTitle className="text-right">
              {navStep === "seder" && "בחירת סדר"}
              {navStep === "masechta" && "בחירת מסכת"}
              {navStep === "daf" && "בחירת דף"}
              {navStep === "amud" && "בחירת עמוד"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {navStep === "seder" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SEDARIM.map((s) => (
                  <Button
                    key={s}
                    variant={s === navSeder ? "default" : "outline"}
                    className={cn(
                      "h-11 rounded-lg",
                      s === navSeder && "bg-gradient-navy text-primary-foreground",
                    )}
                    onClick={() => handleChooseSeder(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            )}

            {navStep === "masechta" && (
              <>
                <div className="flex items-center justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setNavStep("seder")}
                  >
                    <ChevronRight className="h-4 w-4" /> חזרה לסדרים
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    בחר מסכת מתוך {navSeder}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[55vh] overflow-y-auto p-1">
                  {navMasechtos.map((m) => (
                    <Button
                      key={m.name}
                      variant={m.name === navMasechta ? "default" : "outline"}
                      className={cn(
                        "h-11 rounded-lg",
                        m.name === navMasechta &&
                          "bg-gradient-navy text-primary-foreground",
                      )}
                      onClick={() => handleChooseMasechta(m.name)}
                    >
                      {m.name}
                    </Button>
                  ))}
                </div>
              </>
            )}

            {navStep === "daf" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setNavStep("masechta")}
                  >
                    <ChevronRight className="h-4 w-4" /> חזרה למסכתות
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    קבוצה {navDafPage + 1} מתוך {navDafPageCount}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={!canGoPrevNavPage}
                      onClick={() => setNavDafPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronRight className="h-4 w-4" /> קודמת
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={!canGoNextNavPage}
                      onClick={() => setNavDafPage((p) => Math.min(navDafPageCount - 1, p + 1))}
                    >
                      הבאה <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground text-center">
                  קיצורים: חץ ימין לקבוצה קודמת, חץ שמאל לקבוצה הבאה, Esc לסגירה
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-[55vh] overflow-y-auto p-1">
                  {visibleNavDafs.map((d) => {
                    const selected = d === navDaf;
                    const cnt = navDafCounts.get(d)?.total ?? 0;
                    return (
                      <Button
                        key={d}
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        className={cn(
                          "h-11 rounded-lg",
                          selected && "bg-gradient-navy text-primary-foreground",
                        )}
                        onClick={() => handleChooseDaf(d)}
                      >
                        <span className="text-xs">{dafLabel(d).replace(".", "")}</span>
                        {cnt > 0 ? (
                          <span className={cn("mr-1 text-[10px]", selected ? "text-primary-foreground/90" : "text-gold")}>({cnt})</span>
                        ) : null}
                      </Button>
                    );
                  })}
                </div>
              </>
            )}

            {navStep === "amud" && (
              <>
                <div className="flex items-center justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setNavStep("daf")}
                  >
                    <ChevronRight className="h-4 w-4" /> חזרה לדפים
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    בחר עמוד עבור דף {dafLabel(navDaf).replace(".", "")}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant={navAmud === 1 ? "default" : "outline"}
                    className={cn(
                      "h-16 text-lg rounded-xl",
                      navAmud === 1 && "bg-gradient-navy text-primary-foreground",
                    )}
                    onClick={() => applyNavSelection(1)}
                  >
                    ע"א
                    {navDafCounts.get(navDaf)?.a ? (
                      <span className="mr-2 text-sm">({navDafCounts.get(navDaf)?.a})</span>
                    ) : null}
                  </Button>
                  <Button
                    variant={navAmud === 2 ? "default" : "outline"}
                    className={cn(
                      "h-16 text-lg rounded-xl",
                      navAmud === 2 && "bg-gradient-navy text-primary-foreground",
                    )}
                    onClick={() => applyNavSelection(2)}
                  >
                    ע"ב
                    {navDafCounts.get(navDaf)?.b ? (
                      <span className="mr-2 text-sm">({navDafCounts.get(navDaf)?.b})</span>
                    ) : null}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pinsDialogOpen} onOpenChange={setPinsDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-end gap-2 text-right">
              <Pin className="h-5 w-5 text-gold" /> כל ההצמדות
            </DialogTitle>
          </DialogHeader>
          {pins.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gold/35 p-8 text-center text-sm text-muted-foreground">
              עדיין אין הצמדות. בחר מסכת, דף ועמוד ולחץ על סמל ההצמדה.
            </div>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {[...pins].reverse().map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-xl border-2 border-gold/35 bg-card p-2">
                  <button type="button" onClick={() => jumpToPin(p)} className="min-w-0 flex-1 rounded-lg px-3 py-2 text-right hover:bg-gold/10">
                    <strong className="block truncate">{p.masechta}</strong>
                    <span className="text-xs text-muted-foreground">דף {dafLabel(p.daf).replace(".", "")} · עמוד {p.amud === 1 ? "א׳" : "ב׳"}</span>
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setUiPref("dafLearningPins", pins.filter((item) => item.id !== p.id))}
                    title="הסר הצמדה"
                    aria-label={`הסר הצמדה של ${p.masechta}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type LearnMode = "shas" | "mishna" | "chumash" | "neviim-ketuvim";
type PracticeSection = "general" | "decks";
const MODE_STORAGE_KEY = "daf-learning-mode";

function DeckPracticePanel({ requestedDeckId, onRequestHandled }: { requestedDeckId?: string | null; onRequestHandled?: () => void }) {
  const { state } = useStudy();
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  useEffect(() => {
    if (!requestedDeckId) return;
    setActiveDeckId(requestedDeckId);
    onRequestHandled?.();
  }, [requestedDeckId, onRequestHandled]);
  const deckCards = useMemo(() => {
    const children = new Map<string, string[]>();
    (state.categories ?? []).forEach((category) => {
      if (!category.parentId) return;
      children.set(category.parentId, [...(children.get(category.parentId) ?? []), category.id]);
    });
    const categoryNames = new Map((state.categories ?? []).map((category) => [category.id, category.name]));
    return state.decks.map((deck) => {
      const ids = new Set(deck.categoryIds ?? []);
      if (deck.includeSubCategories !== false) {
        const stack = [...ids];
        while (stack.length) {
          (children.get(stack.pop()!) ?? []).forEach((id) => { if (!ids.has(id)) { ids.add(id); stack.push(id); } });
        }
      }
      const names = new Set([...ids].map((id) => categoryNames.get(id)).filter(Boolean));
      const linked = new Set((state.cardDecks ?? []).filter((link) => link.deckId === deck.id).map((link) => link.cardId));
      const cards = state.cards.filter((card) => card.deckId === deck.id || linked.has(card.id) || card.tags?.some((tag) => tag.startsWith("cat:") && (ids.has(tag.slice(4)) || names.has(tag.slice(4)))));
      return { deck, cards };
    });
  }, [state.decks, state.cards, state.cardDecks, state.categories]);
  const active = deckCards.find(({ deck }) => deck.id === activeDeckId);
  if (active) return <Card className="gold-frame p-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold">תרגול מבחן: {active.deck.name}</h3><Button variant="outline" size="sm" onClick={() => setActiveDeckId(null)}><X className="ml-1 h-4 w-4" />חזרה למבחנים</Button></div><StudySession deckId={active.deck.id} sourceExamName={active.deck.name} mode="practice" cardIds={active.cards.map((card) => card.id)} onExit={() => setActiveDeckId(null)} /></Card>;
  return <Card className="gold-frame p-4"><div className="mb-4"><h2 className="text-lg font-bold">תרגול מבחנים</h2><p className="text-sm text-muted-foreground">כל המבחנים שיצרת בטאב בניית מבחנים.</p></div>{deckCards.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{deckCards.map(({ deck, cards }) => <button key={deck.id} type="button" disabled={!cards.length} onClick={() => setActiveDeckId(deck.id)} className="rounded-2xl border-2 border-gold/35 bg-card p-4 text-right transition hover:border-gold hover:bg-gold/5 disabled:cursor-not-allowed disabled:opacity-55"><span className="mb-3 flex items-center justify-between"><BookOpen className="h-6 w-6 text-gold" /><span className="rounded-full bg-gradient-navy px-2 py-1 text-xs font-bold text-white">{cards.length} שאלות</span></span><strong className="block text-base">{deck.name}</strong><span className="mt-2 flex items-center gap-1 text-sm text-primary"><Play className="h-4 w-4 fill-current" />{cards.length ? "התחל תרגול" : "אין שאלות במבחן"}</span></button>)}</div> : <div className="rounded-2xl border-2 border-dashed border-gold/35 p-10 text-center text-muted-foreground">עדיין לא נוצרו מבחנים. ניתן ליצור מבחן בטאב בניית מבחנים.</div>}</Card>;
}

function DafLearningTab({ isVisible = true, requestedCardId, onCardExit }: { isVisible?: boolean; requestedCardId?: string | null; onCardExit?: () => void }) {
  const { state } = useStudy();
  const [mode, setMode] = useState<LearnMode>("shas");
  const [practiceChoice, setPracticeChoice] = useState<{ section: PracticeSection } | null>(null);
  const [requestedDeckId, setRequestedDeckId] = useState<string | null>(null);
  const practiceSection = practiceChoice?.section ?? null;
  const wasVisibleRef = useRef(false);
  const choiceRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (practiceChoice && window.matchMedia("(max-width: 767px)").matches) {
      choiceRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [practiceChoice]);

  useEffect(() => {
    // Every fresh entrance to the practice page starts as an explicit choice,
    // even when the tab component stayed mounted while another page was open.
    if (isVisible && !wasVisibleRef.current) setPracticeChoice(null);
    wasVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("practice-start-exam-v1");
      if (pending) {
        sessionStorage.removeItem("practice-start-exam-v1");
        setRequestedDeckId(pending);
        setPracticeChoice({ section: "decks" });
      }
    } catch { /* ignore */ }
  }, [isVisible]);

  useEffect(() => {
    const openExam = (event: Event) => {
      const id = (event as CustomEvent<{ deckId?: string }>).detail?.deckId;
      if (!id) return;
      setRequestedDeckId(id);
      setPracticeChoice({ section: "decks" });
    };
    window.addEventListener("deepfocus:start-exam", openExam);
    return () => window.removeEventListener("deepfocus:start-exam", openExam);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  if (requestedCardId) {
    const card = state.cards.find(item => item.id === requestedCardId);
    const exit = () => onCardExit?.();
    return <div dir="rtl" className="space-y-3">
      <Button variant="outline" onClick={exit}>חזרה לבחירת תרגול</Button>
      {card ? <>
        {formatShasLocation(card) && <h2 className="font-bold">{formatShasLocation(card)}</h2>}
        <StudySession key={card.id} deckId={null} mode="practice" cardIds={[card.id]} includeAllQuestionTypes onExit={exit} />
        {isCompleteShasLocation(card) && <GemaraViewer masechta={card.masechta} daf={card.daf} amud={card.amud} isActive={isVisible} />}
      </> : <p>השאלה אינה זמינה עוד. אפשר לחזור ולבחור שאלה אחרת.</p>}
    </div>;
  }

  const tabs: { id: LearnMode; label: string; icon: typeof BookText }[] = [
    { id: "shas",           label: "ש\"ס",            icon: Layers },
    { id: "mishna",         label: "משנה",            icon: BookText },
    { id: "chumash",        label: "חומש",            icon: Scroll },
    { id: "neviim-ketuvim", label: "תנ״ך", icon: BookOpen },
  ];

  return (
    <div className="space-y-3" dir="rtl">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => {
          if (!v) return;
          setMode(v as LearnMode);
          setPracticeChoice(null);
        }}
        className="flex w-full justify-center gap-1 rounded-xl border-2 border-gold/40 bg-card p-1 lg:gap-3 lg:rounded-2xl lg:p-3"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <ToggleGroupItem
              key={t.id}
              value={t.id}
              className="h-10 flex-1 gap-2 rounded-lg px-2 text-sm font-semibold data-[state=on]:bg-gradient-navy data-[state=on]:text-primary-foreground lg:h-16 lg:max-w-none lg:gap-3 lg:rounded-xl lg:px-5 lg:text-lg"
            >
              <Icon className="h-4 w-4 shrink-0 lg:h-6 lg:w-6" /> {t.label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      <div className={cn("space-y-3", practiceChoice && "min-h-[100svh] md:min-h-0")}>
      <section ref={choiceRef} className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 rounded-2xl border-2 border-gold/40 bg-gradient-to-l from-gold/10 via-card to-card p-4 sm:grid-cols-2 sm:p-5" aria-label="בחירת סוג תרגול">
        <button type="button" onClick={() => setPracticeChoice((current) => current?.section === "general" ? null : { section: "general" })} aria-pressed={practiceSection === "general"} className={cn("group flex min-h-28 items-center justify-center gap-4 rounded-2xl border-2 px-5 py-4 text-right transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-md", practiceSection === "general" ? "border-gold bg-gradient-navy text-primary-foreground shadow-md" : "border-gold/35 bg-card text-foreground")}><span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-gold/70", practiceSection === "general" ? "bg-white/10 text-gold" : "bg-gold/10 text-gold")}><Play className="h-7 w-7 fill-current" /></span><span><strong className="block text-xl">תרגול כללי</strong><span className={cn("mt-1 block text-sm", practiceSection === "general" ? "text-primary-foreground/75" : "text-muted-foreground")}>תרגול לפי התחום, המסכת והעמוד</span></span></button>
        <button type="button" onClick={() => setPracticeChoice((current) => current?.section === "decks" ? null : { section: "decks" })} aria-pressed={practiceSection === "decks"} className={cn("group flex min-h-28 items-center justify-center gap-4 rounded-2xl border-2 px-5 py-4 text-right transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-md", practiceSection === "decks" ? "border-gold bg-gradient-navy text-primary-foreground shadow-md" : "border-gold/35 bg-card text-foreground")}><span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-gold/70", practiceSection === "decks" ? "bg-white/10 text-gold" : "bg-gold/10 text-gold")}><BookOpen className="h-7 w-7" /></span><span><strong className="block text-xl">תרגול מבחנים</strong><span className={cn("mt-1 block text-sm", practiceSection === "decks" ? "text-primary-foreground/75" : "text-muted-foreground")}>תרגול מתוך המבחנים שיצרת</span></span></button>
      </section>

      {practiceSection === "decks" ? <DeckPracticePanel requestedDeckId={requestedDeckId} onRequestHandled={() => setRequestedDeckId(null)} /> : practiceSection === "general" ? <>
        {mode === "shas"    && <DafLearningTabInner key="unselected-picker-v1" isVisible={isVisible} />}
        {mode === "mishna"  && <MishnaLearningTab />}
        {mode === "chumash" && <ChumashLearningTab />}
        {mode === "neviim-ketuvim" && <NeviimKetuvimLearningTab />}
      </> : null}
      </div>
    </div>
  );
}

const DafLearningTabMemo = memo(DafLearningTab);
export { DafLearningTabMemo as DafLearningTab };
