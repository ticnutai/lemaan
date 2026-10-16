import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  Eye,
  EyeOff,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Trophy,
  Settings2,
  LayoutGrid,
  Clock,
  ChevronDown,
  Calendar as CalendarIcon,
  RefreshCw,
  Timer,
  TrendingUp,
  TrendingDown,
  Minus,
  List,
  Grid2x2,
  Layers,
  BookmarkPlus,
  Zap,
  Palette,
  Edit2,
  Copy,
  AlignRight,
  AlignCenter,
  AlignLeft,
  Pause,
  Play,
  Trash2,
  MessageSquareText,
  GripVertical,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  QuizThemeEditorDialog,
  CustomQuizTheme,
  SavedTheme,
  DEFAULT_CUSTOM_THEME,
  SAVED_THEMES_KEY,
  FONT_FAMILY_MAP,
  FONT_SIZE_MAP,
  FONT_WEIGHT_MAP,
  BORDER_RADIUS_MAP,
} from "./QuizThemeEditor";
import {
  CombinedTypographyDialog,
  QuizTypography,
  loadTypography,
  storeTypography,
  typographyToStyle,
  typographyToBgStyle,
  ANSWER_TYPOGRAPHY_KEY,
  loadAnswerTypography,
  DEFAULT_QUIZ_TYPOGRAPHY,
} from "./QuizTypographyPanel";
import { CardDecksDialog } from "./CardDecksDialog";
import { CardQuickEditor } from "./CardQuickEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useStudy } from "@/lib/study/store";
import { isDue, buildStudyQueue } from "@/lib/study/srs";
import { parseCloze, hasCloze, renderCloze } from "@/lib/study/cloze";
import type { Card as StudyCard, PracticeResultAnswer, StudyMode } from "@/lib/study/types";
import { resolveQuestionMode, matchesQuestionMode } from '@/lib/study/questionModePreference';
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { QuestionReportDialog } from "./QuestionReportDialog";

// ===== Persistence keys =====
const COMBO_PREF_KEY = "study-combo-pref-v1";
const VIEW_MODE_KEY = "study-view-mode-v1";
const OPT_LAYOUT_KEY = "study-opt-layout-v1"; // "list" | "grid" | "letters"
const QUIZ_ANSWER_MODE_KEY = "study-quiz-answer-mode-v1"; // "instant" | "button"
const QUIZ_THEME_KEY = "study-quiz-theme-v1"; // "classic" | "millionaire" | "navy" | "dark" | "colorful" | "custom"
const CUSTOM_QUIZ_THEME_KEY = "study-quiz-custom-theme-v1";
const QUESTION_ALIGN_KEY = "study-question-align-v1";

function readableTextColor(foreground: string | undefined, background: string | undefined): string | undefined {
  const parseHex = (color: string | undefined) => {
    const match = color?.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    if (!match) return null;
    const hex = match[1].length === 3 ? [...match[1]].map((char) => char + char).join("") : match[1];
    return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  };
  const luminance = (rgb: number[]) => {
    const channels = rgb.map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return foreground;
  const fgL = luminance(fg);
  const bgL = luminance(bg);
  const contrast = (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05);
  if (contrast >= 4.5) return foreground;
  const whiteContrast = 1.05 / (bgL + 0.05);
  const blackContrast = (bgL + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? "#ffffff" : "#000000";
}
const LAST_QUICK_DECK_KEY = "study-last-quick-deck-id-v1";
const TOOLS_OPEN_KEY = "study-desktop-tools-open-v1";

type ComboPref = "flash" | "multi" | "both";
type ViewMode = "classic" | "flip" | "list" | "test";
type OptLayout = "list" | "grid" | "letters";
type QuizAnswerMode = "instant" | "button";
type QuizTheme =
  | "classic"
  | "millionaire"
  | "navy"
  | "dark"
  | "colorful"
  | "custom";
type QuestionAlign = "right" | "center" | "left";

const QUIZ_THEME_META: Record<
  QuizTheme,
  { label: string; desc: string; icon: string }
> = {
  classic: { label: "קלאסי", desc: "רשימה עם אותיות עבריות", icon: "📋" },
  millionaire: {
    label: "מיליונר",
    desc: "גריד כחול כהה עם מסגרות זהב",
    icon: "🏆",
  },
  navy: { label: "נייבי", desc: "כפתורי נייבי על רקע לבן", icon: "🔷" },
  dark: { label: "לילה", desc: "רקע כהה עם מסגרות זהב", icon: "🌙" },
  colorful: { label: "צבעוני", desc: "גריד עם צבע לכל תשובה", icon: "🎨" },
  custom: { label: "מותאם", desc: "עיצוב מותאם אישית שלך", icon: "✏️" },
};

// Per-option colors for the 'colorful' theme
const COLORFUL_OPTS: { base: string; sel: string }[] = [
  {
    base: "bg-blue-600/90 border-blue-400",
    sel: "bg-blue-700 border-blue-200 ring-2 ring-white/30",
  },
  {
    base: "bg-emerald-600/90 border-emerald-400",
    sel: "bg-emerald-700 border-emerald-200 ring-2 ring-white/30",
  },
  {
    base: "bg-orange-500/90 border-orange-300",
    sel: "bg-orange-600 border-orange-100 ring-2 ring-white/30",
  },
  {
    base: "bg-purple-600/90 border-purple-400",
    sel: "bg-purple-700 border-purple-200 ring-2 ring-white/30",
  },
  {
    base: "bg-teal-600/90 border-teal-400",
    sel: "bg-teal-700 border-teal-200 ring-2 ring-white/30",
  },
  {
    base: "bg-rose-600/90 border-rose-400",
    sel: "bg-rose-700 border-rose-200 ring-2 ring-white/30",
  },
];

// Seeds for duplicating builtin themes into the custom editor
const BUILTIN_THEME_SEEDS: Partial<Record<QuizTheme, CustomQuizTheme>> = {
  classic: {
    questionBg: "#ffffff",
    questionText: "#0c1831",
    questionBorder: "#c9a84c",
    questionFontFamily: "sans",
    questionFontSize: "2xl",
    questionFontWeight: "semibold",
    answerFontFamily: "sans",
    answerFontSize: "base",
    answerFontWeight: "semibold",
    optionsLayout: "list",
    optionsBorderRadius: "md",
    optionWrapperBg: "",
    badgeBorderColor: "#c9a84c",
    badgeTextColor: "#0c1831",
    breadcrumbColor: "#64748b",
    optionColors: Array(6).fill({
      bg: "#ffffff",
      text: "#0c1831",
      border: "#c9a84c",
    }),
  },
  millionaire: {
    questionBg: "#061022",
    questionText: "#ffffff",
    questionBorder: "#ca8a04",
    questionFontFamily: "sans",
    questionFontSize: "2xl",
    questionFontWeight: "semibold",
    answerFontFamily: "sans",
    answerFontSize: "base",
    answerFontWeight: "semibold",
    optionsLayout: "grid",
    optionsBorderRadius: "full",
    optionWrapperBg: "#061022",
    badgeBorderColor: "#ca8a04",
    badgeTextColor: "#ffffff",
    breadcrumbColor: "#94a3b8",
    optionColors: Array(6).fill({
      bg: "#0d2040",
      text: "#ffffff",
      border: "#ca8a04",
    }),
  },
  navy: {
    questionBg: "#ffffff",
    questionText: "#14225c",
    questionBorder: "#14225c",
    questionFontFamily: "sans",
    questionFontSize: "2xl",
    questionFontWeight: "semibold",
    answerFontFamily: "sans",
    answerFontSize: "base",
    answerFontWeight: "semibold",
    optionsLayout: "list",
    optionsBorderRadius: "md",
    optionWrapperBg: "",
    badgeBorderColor: "#14225c",
    badgeTextColor: "#14225c",
    breadcrumbColor: "#64748b",
    optionColors: Array(6).fill({
      bg: "#14225c",
      text: "#ffffff",
      border: "#14225c",
    }),
  },
  dark: {
    questionBg: "#111827",
    questionText: "#ffffff",
    questionBorder: "#ca8a04",
    questionFontFamily: "sans",
    questionFontSize: "2xl",
    questionFontWeight: "semibold",
    answerFontFamily: "sans",
    answerFontSize: "base",
    answerFontWeight: "semibold",
    optionsLayout: "list",
    optionsBorderRadius: "md",
    optionWrapperBg: "#111827",
    badgeBorderColor: "#ca8a04",
    badgeTextColor: "#ffffff",
    breadcrumbColor: "#9ca3af",
    optionColors: Array(6).fill({
      bg: "#1f2937",
      text: "#ffffff",
      border: "#ca8a04",
    }),
  },
  colorful: {
    questionBg: "#ffffff",
    questionText: "#1a1a2e",
    questionBorder: "#e5e7eb",
    questionFontFamily: "sans",
    questionFontSize: "2xl",
    questionFontWeight: "semibold",
    answerFontFamily: "sans",
    answerFontSize: "base",
    answerFontWeight: "semibold",
    optionsLayout: "grid",
    optionsBorderRadius: "lg",
    optionWrapperBg: "",
    badgeBorderColor: "#e5e7eb",
    badgeTextColor: "#1a1a2e",
    breadcrumbColor: "#64748b",
    optionColors: [
      { bg: "#2563eb", text: "#ffffff", border: "#60a5fa" },
      { bg: "#059669", text: "#ffffff", border: "#34d399" },
      { bg: "#ea580c", text: "#ffffff", border: "#fb923c" },
      { bg: "#7c3aed", text: "#ffffff", border: "#a78bfa" },
      { bg: "#0d9488", text: "#ffffff", border: "#2dd4bf" },
      { bg: "#e11d48", text: "#ffffff", border: "#fb7185" },
    ],
  },
};

type QuizHistoryEntry = {
  id?: string;
  date: string;
  createdAt?: string;
  pct: number;
  totalMs: number;
  mode: string;
  total: number;
  correct?: number;
};

const HEB_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו"];

const MS = { min: 60_000, hour: 3_600_000, day: 86_400_000 };

const NEXT_INTERVAL_OPTIONS: {
  id: string;
  label: string;
  ms: number | null;
}[] = [
  { id: "auto", label: "\u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9", ms: null },
  { id: "10m", label: "10 \u05d3\u05e7\u05d5\u05ea", ms: 10 * MS.min },
  { id: "1h", label: "\u05e9\u05e2\u05d4", ms: MS.hour },
  { id: "1d", label: "\u05de\u05d7\u05e8", ms: MS.day },
  { id: "3d", label: "3 \u05d9\u05de\u05d9\u05dd", ms: 3 * MS.day },
  { id: "1w", label: "\u05e9\u05d1\u05d5\u05e2", ms: 7 * MS.day },
  { id: "1mo", label: "\u05d7\u05d5\u05d3\u05e9", ms: 30 * MS.day },
];

function NextReviewTabs({
  value,
  customDate,
  onChange,
  onCustomDate,
}: {
  value: string;
  customDate: string;
  onChange: (id: string) => void;
  onCustomDate: (iso: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">חזרה הבאה:</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {NEXT_INTERVAL_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "px-2.5 py-1 text-xs rounded-lg border-2 transition-colors",
              value === o.id
                ? "border-gold bg-gradient-navy text-primary-foreground"
                : "border-gold/40 bg-card hover:bg-secondary",
            )}
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange("custom")}
          className={cn(
            "px-2.5 py-1 text-xs rounded-lg border-2 transition-colors flex items-center gap-1",
            value === "custom"
              ? "border-gold bg-gradient-navy text-primary-foreground"
              : "border-gold/40 bg-card hover:bg-secondary",
          )}
        >
          <CalendarIcon className="h-3 w-3" /> מותאם
        </button>
      </div>
      {value === "custom" && (
        <Input
          type="datetime-local"
          value={customDate}
          onChange={(e) => onCustomDate(e.target.value)}
          className="h-8 text-sm border-2 border-gold/40"
        />
      )}
    </div>
  );
}

function resolveCustomDueAt(
  intervalId: string,
  customDate: string,
): number | undefined {
  if (intervalId === "auto") return undefined;
  if (intervalId === "custom") {
    if (!customDate) return undefined;
    const t = new Date(customDate).getTime();
    return Number.isFinite(t) ? t : undefined;
  }
  const opt = NEXT_INTERVAL_OPTIONS.find((o) => o.id === intervalId);
  if (!opt || opt.ms == null) return undefined;
  return Date.now() + opt.ms;
}

interface Props {
  deckId: string | null;
  mode: StudyMode;
  cardIds?: string[]; // optional whitelist; when provided, restrict queue to these cards
  /** Explicit search navigation must not hide its target due to saved type filters. */
  includeAllQuestionTypes?: boolean;
  onExit: () => void;
  /** When set, session auto-ends after this many seconds (used by Quick Review). */
  timeLimitSec?: number;
  /** When true, the card stretches to fill its container height (used in scaled preview). */
  fillHeight?: boolean;
  sourceExamName?: string | null;
  sourceContext?: { masechta?: string; daf?: number; amud?: 1 | 2 };
  /** Admin-only affordance supplied by the page that owns the classification targets. */
  classificationDragEnabled?: boolean;
}

export function StudySession({
  deckId,
  mode,
  cardIds,
  includeAllQuestionTypes = false,
  onExit,
  timeLimitSec,
  fillHeight = false,
  sourceExamName,
  sourceContext,
  classificationDragEnabled = false,
}: Props) {
  const { state, reviewCard, setUiPref, addCardToDeck, addPracticeResult, deletePracticeResult } = useStudy();
  const isMobile = useIsMobile();

  const comboPrefForQueue = includeAllQuestionTypes ? 'both' : resolveQuestionMode(state.uiPrefs?.studyComboPref,
    typeof window !== 'undefined' ? localStorage.getItem(COMBO_PREF_KEY) : null);
  // Callers may allocate the same whitelist on every refresh. Its identity and
  // incoming order must not reshuffle a running session or reset its answer.
  const cardIdsKey = JSON.stringify(cardIds ? [...new Set(cardIds)].sort() : null);
  const baseQueue = useMemo(() => {
    // When cardIds is explicitly provided, use them directly (supports card_decks-linked cards).
    // When deckId is null (category-owned cards), use all cards.
    let cards: StudyCard[];
    if (cardIds) {
      const allowed = new Set(cardIds);
      cards = state.cards.filter((c) => allowed.has(c.id));
    } else if (deckId) {
      cards = state.cards.filter((c) => c.deckId === deckId);
    } else {
      cards = state.cards;
    }
    // Respect the combo-mode preference at the queue level so that
    // "רק בחירה מרובה" actually hides pure flashcards (and vice versa).
    // Apply the user's choice in free practice too, not just scheduled reviews.
    {
      if (comboPrefForQueue === "multi") {
        cards = cards.filter(
          (c) =>
            matchesQuestionMode(c, "multi"),
        );
      } else if (comboPrefForQueue === "flash") {
        cards = cards.filter(
          (c) => c.type === "flashcard" || (c.type === "combo" && !!c.answer),
        );
      }
    }
    if (mode === "srs") return buildStudyQueue(cards);
    return [...cards].sort(() => Math.random() - 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, mode, cardIdsKey, comboPrefForQueue]);
  const [retryCardIds, setRetryCardIds] = useState<string[] | null>(null);
  const [guidedMistakeReview, setGuidedMistakeReview] = useState(false);
  const queue = useMemo(() => {
    if (!retryCardIds) return baseQueue;
    const allowed = new Set(retryCardIds);
    return baseQueue.filter((card) => allowed.has(card.id));
  }, [baseQueue, retryCardIds]);

  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [instantPendingSubmit, setInstantPendingSubmit] = useState<{
    correct: boolean;
    quality: 0 | 1 | 2 | 3 | 4 | 5;
  } | null>(null);
  const [boolPick, setBoolPick] = useState<boolean | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ kind: "question" } | { kind: "answer"; text: string; index: number }>({ kind: "question" });
  const [comboMode, setComboMode] = useState<"flash" | "multi" | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [results, setResults] = useState<{
    correct: number;
    total: number;
    totalMs: number;
    failed: string[];
  }>({ correct: 0, total: 0, totalMs: 0, failed: [] });
  const [historyVersion, setHistoryVersion] = useState(0);
  const savedHistoryEntryRef = useRef<string | null>(null);
  const resultIdRef = useRef(crypto.randomUUID());
  const [attemptAnswers, setAttemptAnswers] = useState<PracticeResultAnswer[]>([]);
  void historyVersion;

  // Session-level timer (never resets per card)
  const sessionStart = useRef(Date.now());
  const pausedAtRef = useRef<number | null>(null);
  const pausedTotalMsRef = useRef(0);
  const [timerRunning, setTimerRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const getElapsedSeconds = useCallback(() => {
    const now = Date.now();
    const livePausedMs = pausedAtRef.current ? now - pausedAtRef.current : 0;
    const effectiveMs = Math.max(
      0,
      now - sessionStart.current - pausedTotalMsRef.current - livePausedMs,
    );
    return Math.floor(effectiveMs / 1000);
  }, []);

  useEffect(() => {
    setElapsed(getElapsedSeconds());
    const t = setInterval(() => setElapsed(getElapsedSeconds()), 1000);
    return () => clearInterval(t);
  }, [getElapsedSeconds]);

  const toggleTimerRunning = useCallback(() => {
    if (timerRunning) {
      pausedAtRef.current = Date.now();
      setTimerRunning(false);
      try {
        setUiPref("studyTimerRunning", false);
      } catch {
        /* guest */
      }
      return;
    }
    if (pausedAtRef.current) {
      pausedTotalMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    setTimerRunning(true);
    setElapsed(getElapsedSeconds());
    try {
      setUiPref("studyTimerRunning", true);
    } catch {
      /* guest */
    }
  }, [getElapsedSeconds, setUiPref, timerRunning]);

  // Lock body scroll on mobile while session is fullscreen
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile]);

  // Quick Review: optional countdown timer that auto-ends the session.
  useEffect(() => {
    if (!timeLimitSec) return;
    if (elapsed >= timeLimitSec) {
      setIdx((i) => Math.max(i, 1)); // ensure results screen path is taken
      // Jump to results: set idx beyond queue length
      setIdx(queue.length);
    }
  }, [elapsed, timeLimitSec, queue.length]);

  // Option layout / combo preference / view mode — synced via uiPrefs (localStorage + cloud, last-write-wins).
  // We keep localStorage as a synchronous fallback for first paint (and for guest mode).
  // NOTE: optLayout is kept only for legacy pref storage; layout is now driven by quizTheme.
  const _optLayoutRaw =
    (state.uiPrefs?.studyOptLayout as OptLayout | undefined) ??
    (() => {
      if (typeof window === "undefined") return "letters";
      const v = localStorage.getItem(OPT_LAYOUT_KEY);
      return (
        v === "grid" || v === "letters" || v === "list" ? v : "letters"
      ) as OptLayout;
    })();
  void _optLayoutRaw; // kept for potential migration reads

  const comboPref: ComboPref = comboPrefForQueue;
  const setComboPref = useCallback(
    (v: ComboPref) => {
      setIdx(0);
      setRetryCardIds(null);
      try {
        localStorage.setItem(COMBO_PREF_KEY, v);
      } catch {
        /* noop */
      }
      try {
        setUiPref("studyComboPref", v);
      } catch {
        /* guest / not signed in */
      }
    },
    [setUiPref],
  );

  const viewMode: ViewMode =
    (state.uiPrefs?.studyViewMode as ViewMode | undefined) ??
    (() => {
      if (typeof window === "undefined") return "classic";
      const v = localStorage.getItem(VIEW_MODE_KEY);
      return (
        v === "classic" || v === "flip" || v === "list" || v === "test"
          ? v
          : "classic"
      ) as ViewMode;
    })();
  const setViewMode = useCallback(
    (v: ViewMode) => {
      try {
        localStorage.setItem(VIEW_MODE_KEY, v);
      } catch {
        /* noop */
      }
      try {
        setUiPref("studyViewMode", v);
      } catch {
        /* guest / not signed in */
      }
    },
    [setUiPref],
  );

  const quizAnswerMode: QuizAnswerMode =
    (state.uiPrefs?.studyAnswerMode as QuizAnswerMode | undefined) ??
    (() => {
      if (typeof window === "undefined") return "instant";
      const v = localStorage.getItem(QUIZ_ANSWER_MODE_KEY);
      return (
        v === "instant" || v === "button" ? v : "instant"
      ) as QuizAnswerMode;
    })();
  const setQuizAnswerMode = useCallback(
    (v: QuizAnswerMode) => {
      try {
        localStorage.setItem(QUIZ_ANSWER_MODE_KEY, v);
      } catch {
        /* noop */
      }
      try {
        setUiPref("studyAnswerMode", v);
      } catch {
        /* guest / not signed in */
      }
    },
    [setUiPref],
  );

  const quizTheme: QuizTheme =
    (state.uiPrefs?.studyQuizTheme as QuizTheme | undefined) ??
    (() => {
      if (typeof window === "undefined") return "classic";
      const v = localStorage.getItem(QUIZ_THEME_KEY);
      return (
        [
          "classic",
          "millionaire",
          "navy",
          "dark",
          "colorful",
          "custom",
        ].includes(v ?? "")
          ? v
          : "classic"
      ) as QuizTheme;
    })();
  const setQuizTheme = useCallback(
    (v: QuizTheme) => {
      try {
        localStorage.setItem(QUIZ_THEME_KEY, v);
      } catch {
        /* noop */
      }
      try {
        setUiPref("studyQuizTheme", v);
      } catch {
        /* guest / not signed in */
      }
    },
    [setUiPref],
  );

  const [customQuizTheme, setCustomQuizTheme] = useState<CustomQuizTheme>(
    () => {
      try {
        const saved = localStorage.getItem(CUSTOM_QUIZ_THEME_KEY);
        return saved
          ? {
              ...DEFAULT_CUSTOM_THEME,
              ...(JSON.parse(saved) as Partial<CustomQuizTheme>),
            }
          : DEFAULT_CUSTOM_THEME;
      } catch {
        return DEFAULT_CUSTOM_THEME;
      }
    },
  );
  const savedQuizThemes = useMemo<SavedTheme[]>(() => {
    const synced = state.uiPrefs?.studySavedQuizThemes;
    if (Array.isArray(synced)) return synced as unknown as SavedTheme[];
    try {
      return JSON.parse(localStorage.getItem(SAVED_THEMES_KEY) ?? "[]") as SavedTheme[];
    } catch {
      return [];
    }
  }, [state.uiPrefs?.studySavedQuizThemes]);
  const saveCustomTheme = useCallback(
    (t: CustomQuizTheme) => {
      setCustomQuizTheme(t);
      try {
        localStorage.setItem(CUSTOM_QUIZ_THEME_KEY, JSON.stringify(t));
      } catch {
        /* noop */
      }
      try {
        setUiPref("studyCustomTheme", t as unknown as Record<string, unknown>);
      } catch {
        /* guest */
      }
    },
    [setUiPref],
  );
  const saveSavedQuizThemes = useCallback((themes: SavedTheme[]) => {
    try {
      localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(themes));
    } catch {
      /* noop */
    }
    try {
      setUiPref("studySavedQuizThemes", themes as unknown as never);
    } catch {
      /* guest */
    }
  }, [setUiPref]);

  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [mobileSettingsDropdownOpen, setMobileSettingsDropdownOpen] =
    useState(false);
  const [deckDialogOpen, setDeckDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  // Desktop tools row open/close — synced via uiPrefs (localStorage + cloud, last-write-wins)
  const desktopToolsOpen: boolean =
    (state.uiPrefs?.studyToolsOpen as boolean | undefined) ??
    (() => {
      if (typeof window === "undefined") return true;
      const v = localStorage.getItem(TOOLS_OPEN_KEY);
      return v === null ? true : v === "1";
    })();
  const setDesktopToolsOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const value = typeof next === "function" ? next(desktopToolsOpen) : next;
      try {
        localStorage.setItem(TOOLS_OPEN_KEY, value ? "1" : "0");
      } catch {
        /* noop */
      }
      try {
        setUiPref("studyToolsOpen", value);
      } catch {
        /* guest / not signed in */
      }
    },
    [desktopToolsOpen, setUiPref],
  );

  const [typography, setTypography] = useState<QuizTypography>(loadTypography);
  const [answerTypography, setAnswerTypography] =
    useState<QuizTypography>(loadAnswerTypography);

  const [questionAlign, setQuestionAlign] = useState<QuestionAlign>(() => {
    try {
      const v = localStorage.getItem(QUESTION_ALIGN_KEY);
      return (["right", "center", "left"] as QuestionAlign[]).includes(
        v as QuestionAlign,
      )
        ? (v as QuestionAlign)
        : "right";
    } catch {
      return "right";
    }
  });

  // ─── Cloud sync: one-time init of quiz typography / align / custom theme / timer ──────
  const quizPrefsCloudRef = useRef(false);
  useEffect(() => {
    if (quizPrefsCloudRef.current) return;
    const p = state.uiPrefs;
    if (
      !p?.studyTypography &&
      !p?.studyAnswerTypography &&
      !p?.studyQuestionAlign &&
      !p?.studyCustomTheme &&
      p?.studyTimerRunning === undefined
    )
      return;
    quizPrefsCloudRef.current = true;
    if (p.studyTypography) {
      const t = {
        ...DEFAULT_QUIZ_TYPOGRAPHY,
        ...(p.studyTypography as Partial<QuizTypography>),
      };
      setTypography(t);
      storeTypography(t);
    }
    if (p.studyAnswerTypography) {
      const t = {
        ...DEFAULT_QUIZ_TYPOGRAPHY,
        ...(p.studyAnswerTypography as Partial<QuizTypography>),
      };
      setAnswerTypography(t);
      storeTypography(t, ANSWER_TYPOGRAPHY_KEY);
    }
    if (
      p.studyQuestionAlign &&
      (["right", "center", "left"] as string[]).includes(p.studyQuestionAlign)
    ) {
      setQuestionAlign(p.studyQuestionAlign as QuestionAlign);
    }
    if (p.studyCustomTheme) {
      setCustomQuizTheme({
        ...DEFAULT_CUSTOM_THEME,
        ...(p.studyCustomTheme as Partial<CustomQuizTheme>),
      });
    }
    if (p.studyTimerRunning !== undefined) {
      setTimerRunning(p.studyTimerRunning);
      if (!p.studyTimerRunning) pausedAtRef.current = Date.now();
    }
  }, [state.uiPrefs]);

  // Custom next-due selection (per current card). Reset when card changes.
  const [nextInterval, setNextInterval] = useState<string>("auto");
  const [customDate, setCustomDate] = useState<string>("");

  // Test mode: store all answers; reveal nothing until end
  const [testAnswers, setTestAnswers] = useState<
    Array<{
      cardId: string;
      quality: 0 | 1 | 2 | 3 | 4 | 5;
      correct: boolean;
      durationMs: number;
      selected: number[];
      boolPick: boolean | null;
      comboMode: "flash" | "multi" | null;
    }>
  >([]);

  useEffect(() => {
    setStartedAt(Date.now());
    setNextInterval("auto");
    setCustomDate("");
    setInstantPendingSubmit(null);
    const currentCard = queue[idx];
    if (guidedMistakeReview && currentCard) {
      setSelected(currentCard.type === "multiple" || currentCard.type === "combo" ? [...(currentCard.correctIndices ?? [])] : []);
      setBoolPick(currentCard.type === "boolean" ? currentCard.correct : null);
      setComboMode(currentCard.type === "combo" ? (currentCard.options?.length ? "multi" : "flash") : null);
      setRevealed(true);
      return;
    }
    const savedAnswer =
      viewMode === "test"
        ? testAnswers.find((answer) => answer.cardId === queue[idx]?.id)
        : undefined;
    if (savedAnswer) {
      setSelected(savedAnswer.selected);
      setBoolPick(savedAnswer.boolPick);
      setComboMode(savedAnswer.comboMode);
      // In test mode, restore the user's choice without exposing the correct
      // answer. They can review or change it and submit again.
      setRevealed(false);
      return;
    }
    setSelected([]);
    setBoolPick(null);
    setComboMode(null);
    setRevealed(false);
  }, [idx, queue, testAnswers, viewMode, guidedMistakeReview]);

  const card = queue[idx];
  const currentTestAnswer =
    viewMode === "test" && card
      ? testAnswers.find((answer) => answer.cardId === card.id)
      : undefined;

  const restartSession = useCallback((onlyCardIds: string[] | null = null, guided = false) => {
    setRetryCardIds(onlyCardIds);
    setGuidedMistakeReview(guided);
    setIdx(0);
    setResults({ correct: 0, total: 0, totalMs: 0, failed: [] });
    setTestAnswers([]);
    setRevealed(false);
    setSelected([]);
    setBoolPick(null);
    setComboMode(null);
    setInstantPendingSubmit(null);
    savedHistoryEntryRef.current = null;
    resultIdRef.current = crypto.randomUUID();
    setAttemptAnswers([]);
    sessionStart.current = Date.now();
    pausedAtRef.current = null;
    pausedTotalMsRef.current = 0;
    setTimerRunning(true);
    setElapsed(0);
  }, []);

  const advanceGuidedReview = () => {
    if (idx >= queue.length - 1) {
      toast({ title: "החזרה על השגיאות הושלמה" });
      onExit();
      return;
    }
    setIdx((current) => current + 1);
  };

  const quickAddToLastDeck = useCallback(() => {
    if (!card) return;

    const decks = state.decks ?? [];
    if (decks.length === 0) {
      toast({
        title: "אין ערכות עדיין",
        description: "צור ערכה חדשה ואז נוכל לשייך אליה את השאלה.",
      });
      return;
    }

    let targetDeckId = "";
    try {
      targetDeckId = localStorage.getItem(LAST_QUICK_DECK_KEY) ?? "";
    } catch {
      /* ignore */
    }

    const hasRemembered = targetDeckId && decks.some((d) => d.id === targetDeckId);
    if (!hasRemembered) {
      const linkedDeckId =
        card.deckId && decks.some((d) => d.id === card.deckId)
          ? card.deckId
          : (state.cardDecks ?? []).find(
                (l) => l.cardId === card.id && decks.some((d) => d.id === l.deckId),
              )?.deckId ?? "";

      if (linkedDeckId) {
        targetDeckId = linkedDeckId;
      } else if (deckId && decks.some((d) => d.id === deckId)) {
        targetDeckId = deckId;
      } else if (decks.length === 1) {
        targetDeckId = decks[0].id;
      } else {
        setDeckDialogOpen(true);
        toast({
          title: "בחר ערכה בפעם הראשונה",
          description: "אחר כך הכפתור המהיר יוסיף אוטומטית לערכה האחרונה.",
        });
        return;
      }
    }

    const alreadyLinked =
      card.deckId === targetDeckId ||
      (state.cardDecks ?? []).some(
        (l) => l.cardId === card.id && l.deckId === targetDeckId,
      );

    const targetDeckName =
      decks.find((d) => d.id === targetDeckId)?.name ?? "הערכה שנבחרה";

    if (alreadyLinked) {
      toast({
        title: "כבר משויך לערכה",
        description: `השאלה כבר קיימת בערכה "${targetDeckName}".`,
      });
      try {
        localStorage.setItem(LAST_QUICK_DECK_KEY, targetDeckId);
      } catch {
        /* ignore */
      }
      return;
    }

    addCardToDeck(card.id, targetDeckId);
    try {
      localStorage.setItem(LAST_QUICK_DECK_KEY, targetDeckId);
    } catch {
      /* ignore */
    }

    toast({
      title: "נוסף לערכה",
      description: `השאלה נוספה לערכה "${targetDeckName}".`,
    });
  }, [card, state.decks, state.cardDecks, addCardToDeck, deckId]);

  const categoryBreadcrumb = useMemo(() => {
    const cats = state.categories ?? [];
    const catPayloads =
      card?.tags.filter((t) => t.startsWith("cat:")).map((t) => t.slice(4)) ??
      [];
    if (!catPayloads.length) return null;
    const buildPath = (payload: string): string[] => {
      const cat = cats.find((c) => c.name === payload) ?? cats.find((c) => c.id === payload);
      if (!cat) return [];
      const path: string[] = [];
      let cur: typeof cat | undefined = cat;
      while (cur) {
        path.unshift(cur.name);
        cur = cur.parentId
          ? cats.find((c) => c.id === cur!.parentId)
          : undefined;
      }
      return path;
    };
    let bestPath = buildPath(catPayloads[0]);
    for (const payload of catPayloads.slice(1)) {
      const p = buildPath(payload);
      if (p.length > bestPath.length) bestPath = p;
    }
    if (!bestPath.length) return null;
    // Skip root level (e.g. "תלמוד בבלי") when there are deeper levels
    const displayPath = bestPath.length > 1 ? bestPath.slice(1) : bestPath;
    return displayPath.join(" ❯ ");
  }, [card?.tags, state.categories]);

  const submit = useCallback(
    (correct: boolean, quality: 0 | 1 | 2 | 3 | 4 | 5) => {
      if (!card) return;
      const durationMs = Date.now() - startedAt;
      const customDueAt = resolveCustomDueAt(nextInterval, customDate);
      const cardSnapshot = card; // capture for undo (current srs/stats are pre-review)
      const idxAtSubmit = idx;
      const previousTestAnswer =
        viewMode === "test"
          ? testAnswers.find((answer) => answer.cardId === card.id)
          : undefined;
      if (viewMode === "test") {
        setTestAnswers((arr) => [
          ...arr.filter((answer) => answer.cardId !== card.id),
          {
            cardId: card.id,
            quality,
            correct,
            durationMs,
            selected: [...selected],
            boolPick,
            comboMode,
          },
        ]);
      } else {
        const res = reviewCard(
          card.id,
          quality,
          durationMs,
          mode === "srs",
          customDueAt,
        );
      }
      const answerSnapshot: PracticeResultAnswer = {
        id: `${resultIdRef.current}:${card.id}`,
        cardId: card.id,
        question: card.question,
        correct,
        quality,
        durationMs,
        answeredAt: Date.now(),
        categoryPath: (card.tags ?? []).filter((tag) => tag.startsWith("cat:")).map((tag) => tag.slice(4)),
        masechta: sourceContext?.masechta ?? card.masechta ?? undefined,
        daf: sourceContext?.daf ?? card.daf ?? undefined,
        amud: sourceContext?.amud ?? card.amud ?? undefined,
      };
      setAttemptAnswers((answers) => [
        ...answers.filter((answer) => answer.cardId !== card.id),
        answerSnapshot,
      ]);
      setResults((r) => ({
        correct:
          r.correct -
          (previousTestAnswer?.correct ? 1 : 0) +
          (correct ? 1 : 0),
        total: r.total + (previousTestAnswer ? 0 : 1),
        totalMs:
          r.totalMs -
          (previousTestAnswer?.durationMs ?? 0) +
          durationMs,
        failed: correct
          ? r.failed.filter((id) => id !== card.id)
          : [...r.failed.filter((id) => id !== card.id), card.id],
      }));
      setRevealed(false);
      setSelected([]);
      setBoolPick(null);
      setComboMode(null);
      setIdx((i) => i + 1);
    },
    [
      card,
      startedAt,
      mode,
      reviewCard,
      nextInterval,
      customDate,
      viewMode,
      idx,
      testAnswers,
      selected,
      boolPick,
      comboMode,
      sourceContext,
    ],
  );

  // Flush test-mode answers when finishing
  useEffect(() => {
    if (viewMode === "test" && idx >= queue.length && testAnswers.length > 0) {
      testAnswers.forEach((a) =>
        reviewCard(a.cardId, a.quality, a.durationMs, mode === "srs"),
      );
      setTestAnswers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, queue.length, viewMode]);

  // Persist one complete, immutable attempt. The same record powers every
  // progress view, so exam and general results can never be double-counted.
  useEffect(() => {
    if (idx < queue.length || results.total === 0 || savedHistoryEntryRef.current) return;
    const completedAt = Date.now();
    const id = resultIdRef.current;
    savedHistoryEntryRef.current = id;
    addPracticeResult({
      id,
      kind: deckId ? "exam" : "general",
      sourceExamId: deckId,
      sourceExamName: deckId
        ? (sourceExamName ?? state.decks.find((deck) => deck.id === deckId)?.name ?? "מבחן שנמחק")
        : null,
      startedAt: sessionStart.current,
      completedAt,
      total: results.total,
      correct: results.correct,
      score: Math.round((results.correct / results.total) * 100),
      durationMs: Math.max(results.totalMs, Math.round(elapsed * 1000)),
      questionIds: attemptAnswers.map((answer) => answer.cardId).filter((id): id is string => Boolean(id)),
      answers: attemptAnswers,
      completed: true,
      updatedAt: completedAt,
    });
  }, [addPracticeResult, attemptAnswers, deckId, elapsed, idx, queue.length, results, sourceExamName, state.decks]);

  // Use the latest committed handler without restarting the answer deadline
  // whenever store callbacks/context objects acquire a new identity.
  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; }, [submit]);
  // Cancel only when the pending answer or actual question changes/unmounts.
  useEffect(() => {
    if (!instantPendingSubmit) return;
    const t = setTimeout(() => {
      setInstantPendingSubmit(null);
      submitRef.current(instantPendingSubmit.correct, instantPendingSubmit.quality);
    }, 1000);
    return () => clearTimeout(t);
  }, [instantPendingSubmit, card?.id]);

  // === Keyboard shortcuts ===
  // Space / Enter — reveal answer (flashcard) or check answer (multiple)
  // Flashcard: 1=שכחתי, 2=קשה, 3=טוב, 4=קל
  // Multiple: 1-9 = toggle option
  // Boolean: 1 = נכון, 2 = לא נכון
  // U / Escape = יציאה
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!card) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Exit
      if (e.key.toLowerCase() === "u" || e.key === "Escape") {
        e.preventDefault();
        onExit();
        return;
      }

      const isFlash =
        card.type === "flashcard" ||
        (card.type === "combo" && comboMode === "flash");
      const isMulti =
        card.type === "multiple" ||
        (card.type === "combo" && comboMode === "multi");

      // Flashcard reveal + grade
      if (isFlash) {
        if (!revealed && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          setRevealed(true);
          return;
        }
        if (revealed) {
          if (e.key === "1") {
            e.preventDefault();
            submit(false, 1);
            return;
          }
          if (e.key === "2") {
            e.preventDefault();
            submit(true, 3);
            return;
          }
          if (e.key === "3") {
            e.preventDefault();
            submit(true, 4);
            return;
          }
          if (e.key === "4") {
            e.preventDefault();
            submit(true, 5);
            return;
          }
        }
      }

      // Multiple choice — 1-9 toggle option, Enter/Space = check
      if (isMulti && (card.type as string) !== "boolean") {
        const opts =
          card.type === "multiple" || card.type === "combo"
            ? (card.options ?? [])
            : [];
        if (!revealed && /^[1-9]$/.test(e.key)) {
          const i = parseInt(e.key, 10) - 1;
          if (i < opts.length) {
            e.preventDefault();
            setSelected((arr) =>
              arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i],
            );
            return;
          }
        }
        if (
          !revealed &&
          (e.key === "Enter" || e.key === " ") &&
          selected.length > 0
        ) {
          e.preventDefault();
          setRevealed(true);
          return;
        }
      }

      // Boolean — 1=true, 2=false
      if (card.type === "boolean" && !revealed) {
        if (e.key === "1") {
          e.preventDefault();
          setBoolPick(true);
          setRevealed(true);
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          setBoolPick(false);
          setRevealed(true);
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [card, revealed, comboMode, selected, submit, onExit]);

  if (queue.length === 0) {
    return (
      <Card className="gold-frame p-10 text-center space-y-4">
        <Trophy className="h-12 w-12 text-gold mx-auto" />
        <h3 className="font-display text-2xl font-bold">אין שאלות לחזרה</h3>
        <p className="text-muted-foreground">
          {mode === "srs"
            ? "כל הכבוד! חזרת על כל הכרטיסים שצריך היום."
            : "אין שאלות שמתאימות לסוג שבחרת. אפשר לבחור את כל הסוגים."}
        </p>
        {comboPref !== "both" && (
          <Button variant="outline" onClick={() => setComboPref("both")}>הצג את כל סוגי השאלות</Button>
        )}
        <Button
          onClick={onExit}
          className="bg-gradient-navy text-primary-foreground rounded-xl"
        >
          חזרה
        </Button>
      </Card>
    );
  }

  // ===== List view: read-only browse of all questions + answers =====
  if (viewMode === "list") {
    return (
      <Card className="gold-frame p-6 space-y-4 animate-fade-in" dir="rtl">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onExit}>
            יציאה <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {queue.length} שאלות · תצוגת רשימה
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-gold" />
                  <span className="text-xs">רשימה</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setViewMode("classic")}>
                  קלאסי
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("flip")}>
                  כרטיס מתהפך
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("list")}>
                  רשימה
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("test")}>
                  מבחן
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          {queue.map((c, i) => (
            <details
              key={c.id}
              className="rounded-xl border-2 border-gold/30 bg-card p-4 group"
            >
              <summary className="cursor-pointer font-medium flex items-center justify-between gap-2">
                <span>
                  {i + 1}. {c.question.replace(/\{\{c\d+::([^}]+)\}\}/g, "$1")}
                </span>
                <Badge variant="outline" className="text-xs">
                  {c.type === "flashcard"
                    ? "פתוחה"
                    : c.type === "multiple"
                      ? "אמריקאית"
                      : c.type === "boolean"
                        ? "נכון/לא"
                        : "משולבת"}
                </Badge>
              </summary>
              <div className="mt-3 pt-3 border-t border-gold/20 space-y-2 text-sm">
                {c.type === "flashcard" && (
                  <p className="text-foreground">{c.answer}</p>
                )}
                {c.type === "combo" && c.answer && (
                  <p className="text-foreground">{c.answer}</p>
                )}
                {(c.type === "multiple" ||
                  (c.type === "combo" && c.options?.length)) && (
                  <ul className="space-y-1">
                    {c.options?.map((o, j) => (
                      <li
                        key={j}
                        className={cn(
                          "px-2 py-1 rounded",
                          c.correctIndices?.includes(j)
                            ? "bg-green-50 dark:bg-green-950/30 border border-green-500/40"
                            : "border border-gold/20",
                        )}
                      >
                        {c.correctIndices?.includes(j) && (
                          <Check className="inline h-3 w-3 text-green-600 ml-1" />
                        )}
                        {o}
                      </li>
                    ))}
                  </ul>
                )}
                {c.type === "boolean" && (
                  <p>
                    תשובה: <strong>{c.correct ? "נכון" : "לא נכון"}</strong>
                  </p>
                )}
                {(c as { explanation?: string }).explanation && (
                  <p className="text-xs text-muted-foreground italic">
                    {(c as { explanation?: string }).explanation}
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      </Card>
    );
  }

  if (idx >= queue.length) {
    const pct = Math.round((results.correct / results.total) * 100) || 0;
    const avgSec =
      results.total > 0
        ? Math.round((results.totalMs / results.total / 1000) * 10) / 10
        : 0;
    const totalSec = Math.floor(elapsed);
    const totalMin = Math.floor(totalSec / 60);
    const totalSecRem = totalSec % 60;
    const totalTimeStr =
      totalMin > 0
        ? `${totalMin}:${String(totalSecRem).padStart(2, "0")} דקות`
        : `${totalSec} שניות`;
    const medal: { color: string; label: string; border: string } =
      pct >= 90
        ? {
            color: "text-yellow-500",
            label: "מושלם",
            border: "border-yellow-500",
          }
        : pct >= 75
          ? {
              color: "text-slate-400",
              label: "טוב מאוד",
              border: "border-slate-400",
            }
          : pct >= 60
            ? {
                color: "text-amber-700",
                label: "עברת",
                border: "border-amber-700",
              }
            : {
                color: "text-destructive",
                label: "מומלץ לחזור",
                border: "border-destructive",
              };
    const failedCards = state.cards.filter((c) =>
      results.failed.includes(c.id),
    );

    // Load history & save this completed attempt exactly once.
    const completedAt = new Date();
    const today = completedAt.toISOString().slice(0, 10);
    const entryId =
      savedHistoryEntryRef.current ??
      `${completedAt.toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
    const todayEntry: QuizHistoryEntry = {
      id: entryId,
      date: today,
      createdAt: completedAt.toISOString(),
      pct,
      totalMs: elapsed * 1000,
      mode,
      total: results.total,
      correct: results.correct,
    };
    const history: QuizHistoryEntry[] = [todayEntry, ...(state.practiceResults ?? [])
      .filter((item) => item.id !== entryId && item.kind === (deckId ? "exam" : "general") && (!deckId || item.sourceExamId === deckId))
      .sort((a, b) => b.completedAt - a.completedAt)
      .map((item) => ({
        id: item.id,
        date: new Date(item.completedAt).toISOString().slice(0, 10),
        createdAt: new Date(item.completedAt).toISOString(),
        pct: item.score,
        totalMs: item.durationMs,
        mode,
        total: item.total,
        correct: item.correct,
      }))];

    // Compare with the immediately preceding attempt, including attempts today.
    const prev = history.find((h) => h.id !== entryId);
    const pctDiff = prev ? pct - prev.pct : null;
    const timeDiff = prev ? elapsed * 1000 - prev.totalMs : null; // positive = slower

    const retryFailed = () => restartSession([...results.failed], false);
    const reviewFailed = () => restartSession([...results.failed], true);
    return (
      <Card
        data-testid="study-results"
        className={cn("gold-frame min-w-0 max-w-full p-8 text-center font-sans tabular-nums space-y-5 animate-fade-in [&_.font-display]:font-sans [&>div]:min-w-0", isMobile && "fixed inset-0 z-50 w-full rounded-none overflow-y-auto overflow-x-hidden p-4")}
        dir="rtl"
      >
        <div
          className="w-20 h-20 shrink-0 rounded-full border-2 border-gold bg-gradient-navy text-gold flex items-center justify-center shadow-lg mx-auto"
        >
          <Trophy className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
        </div>
        {/* כותרת */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground font-semibold">
            תוצאות החזרה
          </p>
          <h3 className="font-display text-3xl font-bold tracking-tight">
            סיימת את החזרה!
          </h3>
        </div>

        {/* ציון — עיצוב יוקרתי */}
        <div className="relative flex flex-col items-center gap-1 py-2">
          <div className="flex items-center gap-px text-gold" dir="ltr">
            <div
              className={cn(
                "font-display font-bold leading-none tracking-tight",
                "text-gold",
              )}
              style={{ fontSize: "5.5rem" }}
            >
              {pct}
            </div>
            <span
              className={cn(
                "font-display font-bold self-start mt-3",
                "text-gold",
              )}
              style={{ fontSize: "2.2rem" }}
            >
              %
            </span>
          </div>
          {/* קו קישוט זהב */}
          <div className="flex items-center gap-3 w-48">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-yellow-500/60" />
            <span className="h-1.5 w-1.5 rotate-45 bg-gold" aria-hidden="true" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-yellow-500/60" />
          </div>
          <p
            className={cn(
              "font-display text-lg font-semibold tracking-wide",
              medal.color,
            )}
          >
            {medal.label}
          </p>
        </div>

        {/* עידוד */}
        <p className="text-sm font-medium text-muted-foreground italic">
          {pct >= 90
            ? "מדהים! שליטה מלאה — כל הכבוד!"
            : pct >= 75
              ? "יפה מאוד! אתה בדרך הנכונה."
              : pct >= 60
                ? "עברת — עוד קצת ותגיע לשלמות!"
                : "אל תתייאש, כל חזרה מקדמת אותך קדימה!"}
        </p>

        {/* פעולות המשך מוצגות מיד אחרי הציון, ללא צורך בגלילה */}
        <div className="flex flex-wrap gap-2 justify-center max-md:grid max-md:grid-cols-1 max-md:[&_button]:w-full max-md:[&_button]:min-w-0 max-md:[&_button]:whitespace-normal max-md:[&_button]:h-auto max-md:[&_button]:min-h-10 max-md:[&_button]:py-2">
          {failedCards.length > 0 && (
            <Button onClick={reviewFailed} className="border-2 border-gold bg-gold/20 text-navy hover:bg-gold/30 rounded-xl">
              <Eye className="h-4 w-4" /> חזרה מודרכת על השגיאות
            </Button>
          )}
          {failedCards.length > 0 && (
            <Button onClick={retryFailed} variant="outline" className="border-2 border-destructive/50 text-destructive rounded-xl">
              <RefreshCw className="h-4 w-4" /> מבחן חוזר על השגיאות
            </Button>
          )}
          <Button onClick={() => restartSession(null)} variant="outline" className="border-2 border-gold rounded-xl">
            <RotateCcw className="h-4 w-4" /> בצע שוב את כל המבחן
          </Button>
          <Button onClick={onExit} className="bg-gradient-navy text-primary-foreground rounded-xl">סיום</Button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto pt-2">
          <div className="rounded-xl border-2 border-gold/40 bg-card p-3">
            <div className="text-xs text-muted-foreground">נכונות</div>
            <div className="text-2xl font-display font-bold text-green-600">
              {results.correct}
            </div>
          </div>
          <div className="rounded-xl border-2 border-gold/40 bg-card p-3">
            <div className="text-xs text-muted-foreground">שגויות</div>
            <div className="text-2xl font-display font-bold text-destructive">
              {results.total - results.correct}
            </div>
          </div>
          <div className="rounded-xl border-2 border-gold/40 bg-card p-3">
            <div className="text-xs text-muted-foreground">זמן ממוצע</div>
            <div className="text-xl font-display font-bold text-navy flex items-center justify-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {avgSec}ש׳
            </div>
          </div>
          <div className="rounded-xl border-2 border-gold/40 bg-card p-3">
            <div className="text-xs text-muted-foreground">סה"כ זמן</div>
            <div className="text-lg font-display font-bold text-navy flex items-center justify-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              {totalTimeStr}
            </div>
          </div>
        </div>

        {/* History comparison */}
        {prev && (
          <div className="max-w-md mx-auto rounded-xl border border-gold/30 bg-secondary/40 p-3 text-sm space-y-2 text-right">
            <div className="font-semibold text-foreground flex flex-wrap items-center gap-1">
              <TrendingUp className="h-4 w-4 text-gold" /> השוואה לחזרה הקודמת (
              {prev.date})
            </div>
            <div className="flex flex-wrap justify-between text-xs gap-2">
              <span className="flex items-center gap-1">
                {pctDiff !== null && pctDiff > 0 && (
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                )}
                {pctDiff !== null && pctDiff < 0 && (
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                )}
                {pctDiff !== null && pctDiff === 0 && (
                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span
                  className={
                    pctDiff !== null
                      ? pctDiff > 0
                        ? "text-green-600 font-semibold"
                        : pctDiff < 0
                          ? "text-destructive font-semibold"
                          : "text-muted-foreground"
                      : ""
                  }
                >
                  {pctDiff !== null
                    ? `${pctDiff > 0 ? "+" : ""}${pctDiff}% ציון`
                    : ""}
                </span>
              </span>
              <span className="text-muted-foreground">
                ציון קודם: {prev.pct}%
              </span>
            </div>
            {timeDiff !== null && (
              <div className="text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1 text-foreground"
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-gold" />
                  {timeDiff < 0
                    ? `${Math.round(Math.abs(timeDiff) / 1000)}ש׳ מהר יותר`
                    : `${Math.round(timeDiff / 1000)}ש׳ איטי יותר`}
                </span>
                <span>זמן קודם: {Math.round(prev.totalMs / 1000)}ש׳</span>
              </div>
            )}
          </div>
        )}

        {/* History mini chart (last 5 sessions) */}
        {history.length >= 1 && (
          <div className="max-w-md mx-auto">
            <div className="text-xs text-muted-foreground text-right mb-1">
              היסטוריית מבחנים (5 אחרונים)
            </div>
            <div className="flex items-end justify-center gap-2 h-16">
              {history
                .slice(0, 5)
                .reverse()
                .map((h, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-1 flex-1"
                  >
                    <div className="text-[10px] text-muted-foreground">
                      {h.pct}%
                    </div>
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${Math.max(8, (h.pct / 100) * 48)}px`,
                        background:
                          h.pct >= 90
                            ? "hsl(var(--gold))"
                            : h.pct >= 60
                              ? "hsl(var(--navy))"
                              : "hsl(var(--destructive))",
                        opacity:
                          i === history.slice(0, 5).length - 1
                            ? 1
                            : 0.6 + i * 0.1,
                      }}
                    />
                    <div className="text-[9px] text-muted-foreground truncate w-full text-center">
                      {h.date.slice(5)}
                    </div>
                  </div>
                ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {history.slice(0, 5).map((entry, index) => {
                const previousEntry = history[index + 1];
                const difference = previousEntry
                  ? entry.pct - previousEntry.pct
                  : null;
                const displayTime = entry.createdAt
                  ? new Date(entry.createdAt).toLocaleString("he-IL", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : entry.date;
                return (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/20 bg-card px-2.5 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-navy">{entry.pct}%</span>
                      <span className="text-muted-foreground">
                        {entry.correct ?? Math.round((entry.pct / 100) * entry.total)}
                        /{entry.total}
                      </span>
                      {difference !== null && (
                        <span
                          className={cn(
                            "font-semibold",
                            difference > 0
                              ? "text-green-600"
                              : difference < 0
                                ? "text-destructive"
                                : "text-muted-foreground",
                          )}
                        >
                          {difference > 0 ? "+" : ""}
                          {difference}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{displayTime}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title="מחק תוצאה מההיסטוריה"
                        onClick={() => {
                          deletePracticeResult(entry.id!);
                          if (savedHistoryEntryRef.current === entry.id) {
                            savedHistoryEntryRef.current = "deleted";
                          }
                          setHistoryVersion((version) => version + 1);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {failedCards.length > 0 && (
          <div className="text-right max-w-md mx-auto rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="text-sm font-semibold text-destructive">
              שאלות שנכשלת בהן ({failedCards.length}):
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
              {failedCards.slice(0, 8).map((c) => (
                <li key={c.id} className="truncate">
                  • {c.question.replace(/\{\{c\d+::([^}]+)\}\}/g, "$1")}
                </li>
              ))}
              {failedCards.length > 8 && (
                <li className="opacity-60">ועוד {failedCards.length - 8}...</li>
              )}
            </ul>
          </div>
        )}
      </Card>
    );
  }

  const progress = (idx / queue.length) * 100;

  // ── Per-theme question area styles ──────────────────────────────────────────
  const questionAreaCls =
    quizTheme === "millionaire"
      ? "bg-[#061022] border-yellow-600/60"
      : quizTheme === "navy"
        ? "bg-white dark:bg-card border-navy/40"
        : quizTheme === "dark"
          ? "bg-gray-900 border-yellow-600/40"
          : "bg-secondary/30 border-gold/30"; // classic, colorful, custom (colours via style prop)

  const questionAreaStyle: React.CSSProperties = {
    ...(quizTheme === "custom"
      ? {
          backgroundColor: customQuizTheme.questionBg,
          borderColor: customQuizTheme.questionBorder,
        }
      : {}),
    ...typographyToBgStyle(typography),
  };

  const effectiveQuestionBg = typography.bgColor || (quizTheme === "custom"
    ? customQuizTheme.questionBg
    : quizTheme === "millionaire"
      ? "#061022"
      : quizTheme === "dark"
        ? "#111827"
        : quizTheme === "navy"
          ? "#ffffff"
          : undefined);
  const requestedQuestionText = typography.textColor || (quizTheme === "custom"
    ? customQuizTheme.questionText
    : quizTheme === "millionaire" || quizTheme === "dark"
      ? "#ffffff"
      : quizTheme === "navy"
        ? "#0c1831"
        : undefined);
  const accessibleQuestionText = readableTextColor(requestedQuestionText, effectiveQuestionBg);
  const hasDarkQuestionSurface = effectiveQuestionBg
    ? readableTextColor("#111827", effectiveQuestionBg) === "#ffffff"
    : quizTheme === "millionaire" || quizTheme === "dark";

  const questionTextCls =
    quizTheme === "millionaire"
      ? "text-white"
      : quizTheme === "dark"
        ? "text-white"
        : quizTheme === "navy"
          ? "text-navy dark:text-foreground"
          : "text-foreground";

  const questionTextStyle: React.CSSProperties = {
    ...(quizTheme === "custom"
      ? {
          color: customQuizTheme.questionText,
          fontFamily: FONT_FAMILY_MAP[customQuizTheme.questionFontFamily],
          fontSize: FONT_SIZE_MAP[customQuizTheme.questionFontSize],
          fontWeight: FONT_WEIGHT_MAP[customQuizTheme.questionFontWeight],
        }
      : {}),
    // Typography overlay (always applied on top of theme)
    ...typographyToStyle(typography),
    ...(accessibleQuestionText ? { color: accessibleQuestionText } : {}),
    // Alignment from dedicated toggle (typography.align wins when explicitly set)
    textAlign: typography.align,
  };

  return (
    <Card
      data-study-session="true"
      className={cn(
        "animate-fade-in",
        isMobile
          ? "fixed inset-0 z-50 rounded-none border-none bg-background flex flex-col gap-2 p-3 overflow-hidden"
          : fillHeight
            ? "gold-frame p-6 flex flex-col h-full gap-5"
            : "gold-frame p-6 space-y-5",
      )}
      dir="rtl"
    >
      {/* ── Mobile compact toolbar ── */}
      {isMobile && (
        <div data-testid="mobile-study-toolbar" aria-label="כלי תרגול — גלילה אופקית" className="shrink-0 flex flex-nowrap items-center gap-2 pt-1 pb-2 w-full min-w-0 overflow-x-auto touch-pan-x [&>*]:shrink-0 [&_button]:shrink-0 [&_button]:whitespace-nowrap [&_button]:!w-[40px] [&_button]:!h-[40px] [&_button]:!min-w-[40px] [&_button]:!min-h-[40px]">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 min-w-10 rounded-xl border-gold/50 hover:bg-gold/10"
            aria-label="יציאה מהתרגול"
            title="יציאה מהתרגול"
            onClick={onExit}
          >
            <X className="h-5 w-5 text-gold" />
          </Button>
          <div className="flex flex-1 items-center gap-1.5">
            <span data-testid="study-question-counter" aria-label="מספר השאלה מתוך התרגול" className="flex h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl border border-gold/50 bg-background px-1 text-xs font-semibold text-muted-foreground" dir="ltr">
              {idx + 1}/{queue.length}
            </span>
            {timeLimitSec ? (
              (() => {
                const remain = Math.max(0, timeLimitSec - elapsed);
                const danger = remain <= 30;
                return (
                  <span
                    className={cn(
                      "h-[40px] min-w-[52px] shrink-0 text-xs font-bold border rounded-xl px-1.5 flex items-center justify-center gap-0.5 bg-background",
                      danger
                        ? "border-destructive/60 text-destructive animate-pulse"
                        : "border-gold/50 text-gold",
                    )}
                  >
                    <Timer className="h-3 w-3" />
                    {Math.floor(remain / 60)}:
                    {String(remain % 60).padStart(2, "0")}
                  </span>
                );
              })()
            ) : (
              <span data-testid="study-session-time" aria-label="זמן התרגול" className="h-[40px] min-w-[52px] shrink-0 text-xs text-muted-foreground border border-gold/50 rounded-xl px-1.5 flex items-center justify-center gap-0.5 bg-background">
                <Timer className="h-3 w-3 text-gold" />
                {Math.floor(elapsed / 60)}:
                {String(elapsed % 60).padStart(2, "0")}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 min-w-10 p-0 rounded-xl border-gold/50 hover:bg-gold/10"
              title="הוספה מהירה לערכה אחרונה"
              onClick={quickAddToLastDeck}
              disabled={!card}
            >
              <BookmarkPlus className="h-5 w-5 text-gold" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 min-w-10 p-0 rounded-xl border-gold/50 hover:bg-gold/10"
              title="הוסף את השאלה לערכות"
              onClick={() => setDeckDialogOpen(true)}
              disabled={!card}
            >
              <Layers className="h-5 w-5 text-gold" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 min-w-10 p-0 rounded-xl border-gold/50 hover:bg-gold/10"
              title="עריכת שאלה ותשובה"
              onClick={() => setEditorOpen(true)}
              disabled={!card}
            >
              <Edit2 className="h-5 w-5 text-gold" />
            </Button>
            <DropdownMenu
              open={mobileSettingsDropdownOpen}
              onOpenChange={setMobileSettingsDropdownOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="ms-auto h-10 w-10 min-w-10 p-0 rounded-xl border-gold/50 hover:bg-gold/10"
                  aria-label="הגדרות תרגול"
                  title="הגדרות תרגול"
                >
                  <Settings2 className="h-5 w-5 text-gold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>עיצוב</DropdownMenuLabel>
                {(
                  [
                    "classic",
                    "millionaire",
                    "navy",
                    "dark",
                    "colorful",
                    "custom",
                  ] as QuizTheme[]
                ).map((t) => (
                  <DropdownMenuItem
                    key={t}
                    onClick={() => {
                      setQuizTheme(t);
                      if (t === "custom") setThemeEditorOpen(true);
                    }}
                    className={cn(
                      "gap-2 justify-between",
                      quizTheme === t && "font-bold bg-secondary",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span>{QUIZ_THEME_META[t].icon}</span>
                      {QUIZ_THEME_META[t].label}
                    </span>
                    {t !== "custom" && (
                      <button
                        title={`שכפל "${QUIZ_THEME_META[t].label}" לעריכה`}
                        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setCustomQuizTheme(BUILTIN_THEME_SEEDS[t]!);
                          setQuizTheme("custom");
                          setMobileSettingsDropdownOpen(false);
                          setThemeEditorOpen(true);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>מסלול שאלות</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setComboPref("flash")}
                  className={cn(
                    "gap-2",
                    comboPref === "flash" && "font-bold bg-secondary",
                  )}
                >
                  <Eye className="h-4 w-4" /> רק תשובה פתוחה
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setComboPref("multi")}
                  className={cn(
                    "gap-2",
                    comboPref === "multi" && "font-bold bg-secondary",
                  )}
                >
                  <Check className="h-4 w-4" /> רק בחירה מרובה
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setComboPref("both")}
                  className={cn(
                    "gap-2",
                    comboPref === "both" && "font-bold bg-secondary",
                  )}
                >
                  <RotateCcw className="h-4 w-4" /> שניהם
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>תצוגה</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setViewMode("classic")}
                  className={cn(
                    viewMode === "classic" && "font-bold bg-secondary",
                  )}
                >
                  קלאסי
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setViewMode("flip")}
                  className={cn(
                    viewMode === "flip" && "font-bold bg-secondary",
                  )}
                >
                  כרטיס מתהפך
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setViewMode("list")}
                  className={cn(
                    (viewMode as string) === "list" && "font-bold bg-secondary",
                  )}
                >
                  רשימה
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setViewMode("test")}
                  className={cn(
                    viewMode === "test" && "font-bold bg-secondary",
                  )}
                >
                  מבחן
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>יישור שאלה</DropdownMenuLabel>
                {(["right", "center", "left"] as QuestionAlign[]).map((a) => (
                  <DropdownMenuItem
                    key={a}
                    onClick={() => {
                      setQuestionAlign(a);
                      const t = { ...typography, align: a };
                      setTypography(t);
                      storeTypography(t);
                      try {
                        localStorage.setItem(QUESTION_ALIGN_KEY, a);
                      } catch {
                        /* noop */
                      }
                      try {
                        setUiPref("studyQuestionAlign", a);
                      } catch {
                        /* guest */
                      }
                      try {
                        setUiPref(
                          "studyTypography",
                          t as unknown as Record<string, unknown>,
                        );
                      } catch {
                        /* guest */
                      }
                    }}
                    className={cn(
                      questionAlign === a && "font-bold bg-secondary",
                    )}
                  >
                    {a === "right" ? "ימין" : a === "center" ? "מרכז" : "שמאל"}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>מצב תשובה</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setQuizAnswerMode("instant")}
                  className={cn(
                    "gap-2",
                    quizAnswerMode === "instant" && "font-bold bg-secondary",
                  )}
                >
                  <Zap className="h-4 w-4" /> מיידי
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setQuizAnswerMode("button")}
                  className={cn(
                    "gap-2",
                    quizAnswerMode === "button" && "font-bold bg-secondary",
                  )}
                >
                  <Check className="h-4 w-4" /> בדוק תשובה
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={toggleTimerRunning}
                  className="gap-2"
                >
                  {timerRunning ? (
                    <>
                      <Pause className="h-4 w-4" /> עצור שעון
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> הפעל שעון
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
      {/* ── Desktop toolbar (hidden on mobile) ── */}
      <div
        className={cn(
          "flex items-center gap-2 flex-wrap",
          isMobile && "hidden",
        )}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
          title="הוספה מהירה לערכה אחרונה"
          onClick={quickAddToLastDeck}
          disabled={!card}
        >
          <BookmarkPlus className="h-3.5 w-3.5 text-gold" />
          <span className="text-xs">מהיר</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
          title="הוסף את השאלה לערכות"
          onClick={() => setDeckDialogOpen(true)}
          disabled={!card}
        >
          <Layers className="h-3.5 w-3.5 text-gold" />
          <span className="text-xs">ערכות</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
          title={desktopToolsOpen ? "הסתר סרגל כלים" : "הצג סרגל כלים"}
          onClick={() => setDesktopToolsOpen((prev) => !prev)}
        >
          {desktopToolsOpen ? (
            <>
              <EyeOff className="h-3.5 w-3.5 text-gold" />
              <span className="text-xs">הסתר כלים</span>
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 text-gold" />
              <span className="text-xs">כלים</span>
            </>
          )}
        </Button>

        {desktopToolsOpen && (
          <>
        {/* RIGHT edge (RTL start): quiz theme picker + edit btn */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Quiz theme picker */}
          <DropdownMenu
            open={themeDropdownOpen}
            onOpenChange={setThemeDropdownOpen}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
                title="עיצוב שאלות אמריקאיות"
              >
                <Palette className="h-3.5 w-3.5 text-gold" />
                <span className="text-xs">
                  {QUIZ_THEME_META[quizTheme].label}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>עיצוב שאלות אמריקאיות</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(
                [
                  "classic",
                  "millionaire",
                  "navy",
                  "dark",
                  "colorful",
                  "custom",
                ] as QuizTheme[]
              ).map((t) => (
                <DropdownMenuItem
                  key={t}
                  onClick={() => {
                    setQuizTheme(t);
                    if (t === "custom") setThemeEditorOpen(true);
                  }}
                  className={cn(
                    "flex items-start gap-2",
                    quizTheme === t && "font-bold bg-secondary",
                  )}
                >
                  <span className="text-base mt-0.5">
                    {QUIZ_THEME_META[t].icon}
                  </span>
                  <div className="flex-1">
                    <div>{QUIZ_THEME_META[t].label}</div>
                    <div className="text-xs text-muted-foreground font-normal">
                      {QUIZ_THEME_META[t].desc}
                    </div>
                  </div>
                  {t === "custom" ? (
                    <Edit2 className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
                  ) : (
                    <button
                      title={`שכפל "${QUIZ_THEME_META[t].label}" לעריכה`}
                      className="shrink-0 mt-0.5 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setCustomQuizTheme(BUILTIN_THEME_SEEDS[t]!);
                        setQuizTheme("custom");
                        setThemeDropdownOpen(false);
                        setThemeEditorOpen(true);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Edit button for custom theme */}
          {quizTheme === "custom" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 border-gold/50 hover:bg-gold/10"
              title="ערוך ערכת נושא מותאמת"
              onClick={() => setThemeEditorOpen(true)}
            >
              <Edit2 className="h-3.5 w-3.5 text-gold" />
            </Button>
          )}
          {/* Combo-mode preference dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
                title="מסלול תרגול"
              >
                <Settings2 className="h-3.5 w-3.5 text-gold" />
                <span className="text-xs">
                  {comboPref === "flash"
                    ? "פתוחה"
                    : comboPref === "multi"
                      ? "מרובה"
                      : "שניהם"}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>מסלול שאלות ותשובות</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setComboPref("flash")}>
                <Eye className="h-4 w-4" /> רק תשובה פתוחה
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setComboPref("multi")}>
                <Check className="h-4 w-4" /> רק בחירה מרובה
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setComboPref("both")}>
                <RotateCcw className="h-4 w-4" /> שניהם (ברצף)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* View-mode dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
                title="תצוגה"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-gold" />
                <span className="text-xs">
                  {viewMode === "classic"
                    ? "קלאסי"
                    : viewMode === "flip"
                      ? "מתהפך"
                      : (viewMode as string) === "list"
                        ? "רשימה"
                        : "מבחן"}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>צורת תצוגה</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setViewMode("classic")}>
                קלאסי
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode("flip")}>
                כרטיס מתהפך
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode("list")}>
                רשימה (סקירה בלבד)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode("test")}>
                מבחן (ללא גילוי בזמן אמת)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Question text alignment toggle */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 border-gold/50 hover:bg-gold/10"
            title="יישור טקסט השאלה"
            onClick={() => {
              const next: QuestionAlign =
                typography.align === "right"
                  ? "center"
                  : typography.align === "center"
                    ? "left"
                    : "right";
              setQuestionAlign(next);
              const tNext = { ...typography, align: next };
              setTypography(tNext);
              storeTypography(tNext);
              try {
                localStorage.setItem(QUESTION_ALIGN_KEY, next);
              } catch {
                /* noop */
              }
              try {
                setUiPref("studyQuestionAlign", next);
              } catch {
                /* guest */
              }
              try {
                setUiPref(
                  "studyTypography",
                  tNext as unknown as Record<string, unknown>,
                );
              } catch {
                /* guest */
              }
            }}
          >
            {typography.align === "right" && (
              <AlignRight className="h-3.5 w-3.5 text-gold" />
            )}
            {typography.align === "center" && (
              <AlignCenter className="h-3.5 w-3.5 text-gold" />
            )}
            {typography.align === "left" && (
              <AlignLeft className="h-3.5 w-3.5 text-gold" />
            )}
          </Button>
          {/* Combined typography dialog — one T button for questions + answers */}
          <CombinedTypographyDialog
            questionValue={typography}
            onQuestionChange={(t) => {
              setTypography(t);
              try {
                setUiPref(
                  "studyTypography",
                  t as unknown as Record<string, unknown>,
                );
              } catch {
                /* guest */
              }
            }}
            answerValue={answerTypography}
            onAnswerChange={(t) => {
              setAnswerTypography(t);
              try {
                setUiPref(
                  "studyAnswerTypography",
                  t as unknown as Record<string, unknown>,
                );
              } catch {
                /* guest */
              }
            }}
          />
          {/* Answer-mode toggle */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
            title={
              quizAnswerMode === "instant"
                ? "מצב מיידי — לחץ לעבור לבדוק תשובה"
                : "מצב בדוק תשובה — לחץ לעבור למיידי"
            }
            onClick={() =>
              setQuizAnswerMode(
                quizAnswerMode === "instant" ? "button" : "instant",
              )
            }
          >
            {quizAnswerMode === "instant" ? (
              <>
                <Zap className="h-3.5 w-3.5 text-gold" />
                <span className="text-xs">מיידי</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 text-gold" />
                <span className="text-xs">בדוק</span>
              </>
            )}
          </Button>
          {/* Live timer */}
          {timeLimitSec ? (
            (() => {
              const remain = Math.max(0, timeLimitSec - elapsed);
              const danger = remain <= 30;
              return (
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs font-bold border rounded-lg px-2 py-1",
                    danger
                      ? "border-destructive/60 bg-destructive/10 text-destructive animate-pulse"
                      : "border-gold/50 bg-gold/10 text-gold",
                  )}
                >
                  <Timer className="h-3.5 w-3.5" />⏱ {Math.floor(remain / 60)}:
                  {String(remain % 60).padStart(2, "0")}
                </span>
              );
            })()
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground border border-gold/30 rounded-lg px-2 py-1 bg-secondary/40">
              <Timer className="h-3.5 w-3.5 text-gold" />
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
            title={timerRunning ? "השהה שעון" : "המשך שעון"}
            onClick={toggleTimerRunning}
          >
            {timerRunning ? (
              <>
                <Pause className="h-3.5 w-3.5 text-gold" />
                <span className="text-xs">עצור שעון</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-gold" />
                <span className="text-xs">הפעל שעון</span>
              </>
            )}
          </Button>
          {viewMode === "test" && idx > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
              title="חזור לשאלה הקודמת וראה את התשובה שסימנת"
              onClick={() => setIdx((current) => Math.max(0, current - 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-xs">שאלה קודמת</span>
            </Button>
          )}
          {viewMode === "test" &&
            currentTestAnswer &&
            idx < queue.length - 1 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 border-gold/50 hover:bg-gold/10 gap-1"
                title="חזור לשאלה הבאה בלי לשנות את התשובה"
                onClick={() =>
                  setIdx((current) => Math.min(queue.length - 1, current + 1))
                }
              >
                <span className="text-xs">שאלה הבאה</span>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
          <span className="text-sm text-muted-foreground">
            {idx + 1} / {queue.length} ·{" "}
            {mode === "srs" ? "חזרה ממוקדת" : "תרגול חופשי"}
          </span>
        </div>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 ms-auto text-muted-foreground hover:text-foreground"
          title="סגור מצב שאלות וחזור לתצוגה מפוצלת (Esc)"
          onClick={onExit}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Progress
        value={progress}
        className={cn("h-2", (isMobile || fillHeight) && "shrink-0")}
      />
      {guidedMistakeReview && (
        <div className="rounded-xl border-2 border-green-500/50 bg-green-50 px-3 py-2 text-center text-sm font-semibold text-green-800" dir="rtl">
          חזרה מודרכת: התשובה הנכונה מסומנת בירוק — לחץ עליה כדי להמשיך.
        </div>
      )}

      <div
        data-testid="study-question-card"
        draggable={classificationDragEnabled}
        onDragStart={classificationDragEnabled ? (event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-study-card-id", card.id);
          event.dataTransfer.setData("text/plain", card.id);
        } : undefined}
        className={cn(
          "relative mx-auto flex flex-col items-stretch justify-center border-2",
          classificationDragEnabled && "cursor-grab active:cursor-grabbing",
          isMobile
            ? "w-full rounded-2xl p-3 pt-8 overflow-y-auto"
            : "w-[82%] md:w-[76%] lg:w-[72%] max-w-6xl min-h-[150px] rounded-[2.75rem] px-8 py-8 pt-10",
          questionAreaCls,
        )}
        style={questionAreaStyle}
      >
        {/* Type on the left, RTL breadcrumbs on the right. */}
        <Badge
          variant="outline"
          data-testid="study-question-type"
          className={cn("absolute top-3 left-3 border-gold text-xs max-md:text-[10px] max-md:px-2 max-md:py-0 max-md:leading-4", hasDarkQuestionSurface ? "text-white" : "text-navy")}
          style={
            quizTheme === "custom"
              ? {
                  borderColor: customQuizTheme.badgeBorderColor,
                  color: readableTextColor(customQuizTheme.badgeTextColor, effectiveQuestionBg),
                }
              : {}
          }
        >
          {card.type === "flashcard"
            ? "כרטיסיה"
            : card.type === "multiple"
              ? "אמריקאית"
              : card.type === "boolean"
                ? "נכון/לא נכון"
                : "משולבת"}
        </Badge>
        {/* Top-right corner: category breadcrumb */}
        {categoryBreadcrumb && (
          <span
            data-testid="study-question-breadcrumb"
            className={cn("absolute top-3 right-3 max-w-[55%] truncate text-right text-xs", hasDarkQuestionSurface ? "text-white/75" : "text-muted-foreground")}
            dir="rtl"
            style={
              quizTheme === "custom"
                ? { color: readableTextColor(customQuizTheme.breadcrumbColor, effectiveQuestionBg) }
                : {}
            }
          >
            {categoryBreadcrumb}
          </span>
        )}
        <div className="flex w-full items-start gap-2" dir="rtl">
          <h3
            className={cn(
              "min-w-0 flex-1 font-display text-2xl font-semibold leading-relaxed",
              questionAlign === "right"
                ? "text-right"
                : questionAlign === "center"
                  ? "text-center"
                  : "text-left",
              questionTextCls,
            )}
            style={questionTextStyle}
          >
            {hasCloze(card.question) ? (
              <span dir="rtl">
                {(() => {
                  const parts = parseCloze(card.question);
                  const showAll =
                    revealed ||
                    (card.type !== "flashcard" &&
                      !(card.type === "combo" && comboMode === "flash"));
                  return renderCloze(parts, 1, showAll);
                })()}
              </span>
            ) : (
              card.question
            )}
          </h3>
          <button
            type="button"
            title="כתוב הערה למנהל על השאלה"
            aria-label="כתוב הערה למנהל על השאלה"
            onClick={() => { setReportTarget({ kind: "question" }); setReportOpen(true); }}
            className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-background/90 text-gold hover:bg-gold/10"
          >
            <MessageSquareText className="h-3.5 w-3.5" />
          </button>
        </div>
        {(classificationDragEnabled || card.tags?.includes("source:yeshiva") || card.tags?.includes("source:shemesh")) && (
          <div
            data-testid="study-question-metadata"
            className="mt-3 flex w-full flex-wrap items-center justify-between gap-2 border-t border-gold/20 pt-2"
            dir="rtl"
          >
            {classificationDragEnabled ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm" title="גרור את השאלה לעמוד א׳ או לעמוד ב׳">
                <GripVertical className="h-3.5 w-3.5 text-gold" /> גרור לסיווג
              </span>
            ) : <span />}
            <span className="inline-flex items-center gap-1.5" aria-label="מקור השאלה">
              {card.tags?.includes("source:yeshiva") && (
                <span
                  title="yeshiva.org.il"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/50 text-[11px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: "hsl(220 70% 25%)" }}
                >
                  Y
                </span>
              )}
              {card.tags?.includes("source:shemesh") && (
                <span
                  title="שמש בגבעון"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gold/70 text-[11px] font-bold text-black shadow-sm"
                  style={{ backgroundColor: "hsl(45 85% 55%)" }}
                >
                  S
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      <div
        className={cn(isMobile || fillHeight ? "flex-1 min-h-0 overflow-y-auto" : "shrink-0")}
      >
        {/* Flashcard */}
        {card.type === "flashcard" && (
          <div className="space-y-3" dir="rtl">
            {!revealed ? (
              <Button
                onClick={() => setRevealed(true)}
                className={cn(
                  "w-full bg-gradient-navy text-primary-foreground rounded-xl py-6",
                  viewMode === "flip" &&
                    "transition-transform [transform:rotateY(0deg)] hover:[transform:rotateY(8deg)]",
                )}
              >
                <Eye className="h-5 w-5" /> הצג תשובה
              </Button>
            ) : (
              <>
                <div className="flex items-stretch gap-1.5">
                <div className={cn("min-w-0 flex-1 p-5 rounded-xl bg-card border-2 border-gold/40", viewMode === "flip" && "animate-fade-in")}>
                  <p
                    className="text-lg text-foreground text-right font-medium"
                    dir="rtl"
                  >
                    {card.answer}
                  </p>
                </div>
                <button type="button" title="כתוב הערה למנהל על התשובה" aria-label="כתוב הערה למנהל על התשובה" onClick={() => { setReportTarget({ kind: "answer", text: card.answer, index: 0 }); setReportOpen(true); }} className="flex w-8 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-card text-gold hover:bg-gold/10"><MessageSquareText className="h-3.5 w-3.5" /></button>
                </div>
                {guidedMistakeReview ? (
                  <Button onClick={advanceGuidedReview} className="w-full bg-green-600 text-white hover:bg-green-700">הבנתי — לשאלה הבאה</Button>
                ) : (<>
                <NextReviewTabs
                  value={nextInterval}
                  customDate={customDate}
                  onChange={setNextInterval}
                  onCustomDate={setCustomDate}
                />
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    onClick={() => submit(false, 1)}
                    variant="outline"
                    className="border-2 border-destructive/50 text-destructive"
                  >
                    שכחתי
                  </Button>
                  <Button
                    onClick={() => submit(true, 3)}
                    variant="outline"
                    className="border-2 border-gold/50"
                  >
                    קשה
                  </Button>
                  <Button
                    onClick={() => submit(true, 4)}
                    variant="outline"
                    className="border-2 border-gold"
                  >
                    טוב
                  </Button>
                  <Button
                    onClick={() => submit(true, 5)}
                    className="bg-gradient-navy text-primary-foreground"
                  >
                    קל
                  </Button>
                </div>
                </>)}
              </>
            )}
          </div>
        )}

        {/* Multiple choice */}
        {card.type === "multiple" && (
          <div
            className={cn(
              "space-y-3",
              isMobile && "h-full min-h-0 flex flex-col",
            )}
            dir="rtl"
          >
            {/* Theme-aware options rendering */}
            {(() => {
              const isGrid =
                quizTheme === "millionaire" ||
                quizTheme === "colorful" ||
                (quizTheme === "custom" &&
                  customQuizTheme.optionsLayout === "grid");
              const wrapperCls =
                quizTheme === "millionaire"
                  ? "grid grid-cols-2 gap-3 p-4 rounded-2xl bg-[#061022]"
                  : quizTheme === "colorful"
                    ? "grid grid-cols-2 gap-3"
                    : quizTheme === "dark"
                      ? "space-y-2 p-3 rounded-2xl bg-gray-900"
                      : quizTheme === "custom" &&
                          customQuizTheme.optionsLayout === "grid"
                        ? cn(
                            "grid grid-cols-2 gap-3",
                            customQuizTheme.optionWrapperBg &&
                              "p-3 rounded-2xl",
                          )
                        : quizTheme === "custom" &&
                            customQuizTheme.optionWrapperBg
                          ? "space-y-2 p-3 rounded-2xl"
                          : "space-y-2";
              const wrapperStyle: React.CSSProperties =
                quizTheme === "custom" && customQuizTheme.optionWrapperBg
                  ? { backgroundColor: customQuizTheme.optionWrapperBg }
                  : {};
              const mobileWrapperCls =
                (isMobile || fillHeight) && isGrid
                  ? "flex-1 min-h-0 auto-rows-fr"
                  : isMobile || fillHeight
                    ? "flex-1 min-h-0 flex flex-col [&>div]:flex-1 [&>div]:min-h-[64px]"
                    : "";
              return (
                <div
                  className={cn(wrapperCls, mobileWrapperCls)}
                  style={wrapperStyle}
                >
                  {card.options.map((opt, i) => {
                    const isSelected = selected.includes(i);
                    const isCorrect = card.correctIndices.includes(i);
                    const showResult = revealed;
                    const handleClick = () => {
                      if (guidedMistakeReview) {
                        if (isCorrect) advanceGuidedReview();
                        return;
                      }
                      if (revealed) return;
                      if (quizAnswerMode === "instant") {
                        const correct =
                          card.correctIndices.length === 1 &&
                          card.correctIndices.includes(i);
                        setSelected([i]);
                        setRevealed(true);
                        setInstantPendingSubmit({
                          correct,
                          quality: correct ? 5 : 1,
                        });
                      } else {
                        setSelected((arr) =>
                          isSelected ? arr.filter((x) => x !== i) : [...arr, i],
                        );
                      }
                    };

                    // ── Compute per-theme button + letter classes ──
                    let btnCls = "";
                    let btnStyle: React.CSSProperties = {};
                    let optTextStyle: React.CSSProperties = {};
                    let letterEl: React.ReactNode = null;

                    if (quizTheme === "classic") {
                      btnCls = cn(
                        "w-full p-4 rounded-xl border-2 text-right transition-all flex items-center gap-3",
                        !showResult && isSelected && "border-navy bg-secondary",
                        !showResult &&
                          !isSelected &&
                          "border-gold/40 bg-card hover:bg-secondary/50",
                        showResult &&
                          isCorrect &&
                          "border-green-500 bg-green-50 dark:bg-green-950/30",
                        showResult &&
                          !isCorrect &&
                          isSelected &&
                          "border-destructive bg-destructive/10",
                        showResult &&
                          !isCorrect &&
                          !isSelected &&
                          "border-gold/20 opacity-60",
                      );
                      letterEl = (
                        <span
                          className={cn(
                            "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold",
                            !showResult && isSelected
                              ? "bg-navy text-primary-foreground"
                              : "bg-gold/20 text-navy",
                            showResult && isCorrect
                              ? "bg-green-500 text-white"
                              : "",
                            showResult && !isCorrect && isSelected
                              ? "bg-destructive text-white"
                              : "",
                            showResult && !isCorrect && !isSelected
                              ? "bg-gold/20 text-navy opacity-60"
                              : "",
                          )}
                        >
                          {HEB_LETTERS[i]}
                        </span>
                      );
                    } else if (quizTheme === "millionaire") {
                      btnCls = cn(
                        "relative p-4 rounded-[2rem] border-2 text-right transition-all min-h-[80px] flex flex-col items-end justify-center gap-2 overflow-hidden",
                        !showResult &&
                          !isSelected &&
                          "border-yellow-600/60 bg-gradient-to-b from-[#0d2040] to-[#0a1628] text-white hover:border-yellow-400 hover:shadow-[0_0_12px_rgba(234,179,8,0.3)]",
                        !showResult &&
                          isSelected &&
                          "border-yellow-300 bg-gradient-to-b from-[#1a3a60] to-[#0d2040] text-yellow-200 shadow-[0_0_16px_rgba(234,179,8,0.4)]",
                        showResult &&
                          isCorrect &&
                          "border-green-400 bg-gradient-to-b from-green-800 to-green-900 text-white",
                        showResult &&
                          !isCorrect &&
                          isSelected &&
                          "border-red-500 bg-gradient-to-b from-red-900 to-red-950 text-white",
                        showResult &&
                          !isCorrect &&
                          !isSelected &&
                          "border-yellow-600/20 bg-gradient-to-b from-[#0d2040] to-[#0a1628] opacity-50 text-white",
                      );
                      letterEl = (
                        <span
                          className={cn(
                            "flex-shrink-0 h-6 min-w-[1.5rem] px-1.5 rounded-full flex items-center justify-center text-xs font-bold border",
                            !showResult &&
                              !isSelected &&
                              "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
                            !showResult &&
                              isSelected &&
                              "bg-yellow-400/30 text-yellow-200 border-yellow-300/60",
                            showResult &&
                              isCorrect &&
                              "bg-green-500/30 text-green-200 border-green-400",
                            showResult &&
                              !isCorrect &&
                              isSelected &&
                              "bg-red-500/30 text-red-200 border-red-400",
                            showResult &&
                              !isCorrect &&
                              !isSelected &&
                              "bg-yellow-500/10 text-yellow-600/50 border-yellow-600/20",
                          )}
                        >
                          {HEB_LETTERS[i]}
                        </span>
                      );
                    } else if (quizTheme === "navy") {
                      btnCls = cn(
                        "w-full py-4 px-5 rounded-xl border-2 text-right transition-all flex items-center gap-3 font-semibold",
                        !showResult &&
                          !isSelected &&
                          "border-navy/30 bg-white dark:bg-card text-navy dark:text-foreground hover:border-navy hover:bg-navy/5",
                        !showResult &&
                          isSelected &&
                          "border-navy bg-navy text-white",
                        showResult &&
                          isCorrect &&
                          "border-green-600 bg-green-600 text-white",
                        showResult &&
                          !isCorrect &&
                          isSelected &&
                          "border-red-500 bg-red-500 text-white",
                        showResult &&
                          !isCorrect &&
                          !isSelected &&
                          "border-gray-200 bg-gray-50 dark:bg-card opacity-60",
                      );
                      letterEl = (
                        <span
                          className={cn(
                            "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border",
                            !showResult &&
                              !isSelected &&
                              "bg-navy/10 text-navy border-navy/30",
                            !showResult &&
                              isSelected &&
                              "bg-white text-navy border-white/60",
                            showResult &&
                              isCorrect &&
                              "bg-white text-green-700 border-white",
                            showResult &&
                              !isCorrect &&
                              isSelected &&
                              "bg-white text-red-600 border-white",
                            showResult &&
                              !isCorrect &&
                              !isSelected &&
                              "bg-gray-200/50 text-muted-foreground border-gray-200",
                          )}
                        >
                          {HEB_LETTERS[i]}
                        </span>
                      );
                    } else if (quizTheme === "dark") {
                      btnCls = cn(
                        "w-full p-4 rounded-xl border-2 text-right transition-all flex items-center gap-3",
                        !showResult &&
                          !isSelected &&
                          "border-yellow-600/40 bg-gray-800 text-white hover:border-yellow-400 hover:bg-gray-700",
                        !showResult &&
                          isSelected &&
                          "border-yellow-400 bg-gray-700 text-yellow-200 shadow-[0_0_10px_rgba(234,179,8,0.2)]",
                        showResult &&
                          isCorrect &&
                          "border-green-400 bg-green-900/70 text-green-100",
                        showResult &&
                          !isCorrect &&
                          isSelected &&
                          "border-red-500 bg-red-900/70 text-red-100",
                        showResult &&
                          !isCorrect &&
                          !isSelected &&
                          "border-gray-700 bg-gray-800/50 text-gray-500",
                      );
                      letterEl = (
                        <span
                          className={cn(
                            "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border",
                            !showResult &&
                              !isSelected &&
                              "bg-yellow-900/40 text-yellow-400 border-yellow-700/50",
                            !showResult &&
                              isSelected &&
                              "bg-yellow-500/30 text-yellow-200 border-yellow-400/50",
                            showResult &&
                              isCorrect &&
                              "bg-green-500/30 text-green-200 border-green-400/50",
                            showResult &&
                              !isCorrect &&
                              isSelected &&
                              "bg-red-500/30 text-red-200 border-red-400/50",
                            showResult &&
                              !isCorrect &&
                              !isSelected &&
                              "bg-gray-700 text-gray-500 border-gray-600/50",
                          )}
                        >
                          {HEB_LETTERS[i]}
                        </span>
                      );
                    } else if (quizTheme === "custom") {
                      const oc =
                        customQuizTheme.optionColors[
                          i % customQuizTheme.optionColors.length
                        ];
                      const rad =
                        BORDER_RADIUS_MAP[customQuizTheme.optionsBorderRadius];
                      btnCls = cn(
                        "p-4 border-2 text-right transition-all flex items-center gap-3 font-medium",
                        !isGrid && "w-full",
                        isGrid &&
                          "min-h-[80px] flex-col items-end justify-center",
                        !showResult && "hover:opacity-90",
                        showResult &&
                          isCorrect &&
                          "ring-4 ring-green-300 ring-offset-1",
                        showResult &&
                          !isCorrect &&
                          isSelected &&
                          "opacity-80 ring-4 ring-red-500 ring-offset-1",
                        showResult && !isCorrect && !isSelected && "opacity-40",
                      );
                      btnStyle = {
                        backgroundColor: oc.bg,
                        color: oc.text,
                        borderColor: oc.border,
                        borderRadius: rad,
                      };
                      optTextStyle = {
                        fontFamily:
                          FONT_FAMILY_MAP[customQuizTheme.answerFontFamily],
                        fontSize: FONT_SIZE_MAP[customQuizTheme.answerFontSize],
                        fontWeight:
                          FONT_WEIGHT_MAP[customQuizTheme.answerFontWeight],
                      };
                      letterEl = (
                        <span
                          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border"
                          style={{
                            backgroundColor: oc.text + "22",
                            color: oc.text,
                            borderColor: oc.text + "55",
                          }}
                        >
                          {HEB_LETTERS[i]}
                        </span>
                      );
                    } else {
                      // colorful — per-option color, no letter
                      const c = COLORFUL_OPTS[i % COLORFUL_OPTS.length];
                      btnCls = cn(
                        "relative p-4 rounded-2xl border-2 text-right transition-all min-h-[80px] flex flex-col items-end justify-center gap-2 font-semibold text-white",
                        !showResult &&
                          !isSelected &&
                          `${c.base} hover:opacity-90`,
                        !showResult && isSelected && c.sel,
                        showResult &&
                          isCorrect &&
                          `${c.base} ring-4 ring-green-300 ring-offset-1`,
                        showResult &&
                          !isCorrect &&
                          isSelected &&
                          `${c.base} opacity-80 ring-4 ring-red-500 ring-offset-1`,
                        showResult &&
                          !isCorrect &&
                          !isSelected &&
                          `${c.base} opacity-40`,
                      );
                      letterEl = null;
                    }

                    // Apply answer typography overlay on top of any theme
                    optTextStyle = {
                      ...optTextStyle,
                      ...typographyToStyle(answerTypography),
                      textAlign: answerTypography.align,
                    };
                    btnStyle = {
                      ...btnStyle,
                      ...typographyToBgStyle(answerTypography),
                    };

                    return (
                      <div key={i} className={cn("flex gap-1.5", (isMobile || fillHeight) && "min-h-0")}>
                      <button
                        dir="rtl"
                        disabled={revealed && !guidedMistakeReview}
                        onClick={handleClick}
                        className={cn(
                          btnCls,
                          "min-w-0 flex-1",
                          (isMobile || fillHeight) &&
                            (isGrid ? "h-full min-h-0" : "flex-1 min-h-0"),
                        )}
                        style={btnStyle}
                      >
                        {isGrid ? (
                          // Grid layout: text stacked, letter+icon at bottom
                          <>
                            <span
                              className="font-medium text-right leading-snug w-full"
                              style={optTextStyle}
                            >
                              {opt}
                            </span>
                            <div className="w-full flex justify-between items-center mt-1">
                              {letterEl ?? <span />}
                              <span>
                                {showResult && isCorrect && (
                                  <Check className="h-5 w-5 text-green-300" />
                                )}
                                {showResult && !isCorrect && isSelected && (
                                  <X className="h-5 w-5 text-red-300" />
                                )}
                              </span>
                            </div>
                          </>
                        ) : (
                          // List layout: letter | text | icon inline
                          <>
                            {letterEl}
                            <span
                              className="font-medium flex-1 text-right"
                              style={optTextStyle}
                            >
                              {opt}
                            </span>
                            <span className="flex-shrink-0 w-5">
                              {showResult && isCorrect && (
                                <Check className="h-5 w-5 text-green-600" />
                              )}
                              {showResult && !isCorrect && isSelected && (
                                <X className="h-5 w-5 text-destructive" />
                              )}
                            </span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        title={`כתוב הערה למנהל על תשובה ${i + 1}`}
                        aria-label={`כתוב הערה למנהל על תשובה ${i + 1}`}
                        onClick={() => { setReportTarget({ kind: "answer", text: opt, index: i }); setReportOpen(true); }}
                        className="flex w-8 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-card text-gold hover:bg-gold/10"
                      >
                        <MessageSquareText className="h-3.5 w-3.5" />
                      </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {!revealed ? (
              quizAnswerMode === "button" ? (
                <Button
                  disabled={selected.length === 0}
                  onClick={() => setRevealed(true)}
                  className="w-full bg-gradient-navy text-primary-foreground rounded-xl py-6"
                >
                  בדוק תשובה
                </Button>
              ) : null
            ) : (
              (() => {
                const correct =
                  selected.length === card.correctIndices.length &&
                  selected.every((s) => card.correctIndices.includes(s));
                return (
                  <>
                    {quizAnswerMode === "button" && (
                      <NextReviewTabs
                        value={nextInterval}
                        customDate={customDate}
                        onChange={setNextInterval}
                        onCustomDate={setCustomDate}
                      />
                    )}
                    {quizAnswerMode === "button" && (
                      <Button
                        onClick={() => {
                          setInstantPendingSubmit(null);
                          submit(correct, correct ? 5 : 1);
                        }}
                        className={cn(
                          "w-full rounded-xl py-6 text-primary-foreground",
                          correct
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-destructive hover:bg-destructive/90",
                        )}
                      >
                        {correct ? "נכון! המשך" : "לא נכון - המשך"}
                      </Button>
                    )}
                  </>
                );
              })()
            )}
          </div>
        )}

        {/* Boolean */}
        {card.type === "boolean" && (
          <div className="space-y-3" dir="rtl">
            {!revealed || guidedMistakeReview ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex gap-1.5">
                <Button
                  onClick={() => {
                    if (guidedMistakeReview) {
                      if (card.correct) advanceGuidedReview();
                      return;
                    }
                    setBoolPick(true);
                    setRevealed(true);
                  }}
                  variant="outline"
                  className={cn("min-w-0 flex-1 border-2 rounded-xl py-8 text-lg", guidedMistakeReview && card.correct ? "border-green-500 bg-green-100 text-green-800" : "border-gold/50")}
                >
                  <Check className="h-5 w-5" /> נכון
                </Button>
                <button type="button" title="הערה על התשובה נכון" aria-label="כתוב הערה למנהל על התשובה נכון" onClick={() => { setReportTarget({ kind: "answer", text: "נכון", index: 0 }); setReportOpen(true); }} className="flex w-8 shrink-0 items-center justify-center rounded-xl border border-gold/40 text-gold"><MessageSquareText className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex gap-1.5">
                <Button
                  onClick={() => {
                    if (guidedMistakeReview) {
                      if (!card.correct) advanceGuidedReview();
                      return;
                    }
                    setBoolPick(false);
                    setRevealed(true);
                  }}
                  variant="outline"
                  className={cn("min-w-0 flex-1 border-2 rounded-xl py-8 text-lg", guidedMistakeReview && !card.correct ? "border-green-500 bg-green-100 text-green-800" : "border-gold/50")}
                >
                  <X className="h-5 w-5" /> לא נכון
                </Button>
                <button type="button" title="הערה על התשובה לא נכון" aria-label="כתוב הערה למנהל על התשובה לא נכון" onClick={() => { setReportTarget({ kind: "answer", text: "לא נכון", index: 1 }); setReportOpen(true); }} className="flex w-8 shrink-0 items-center justify-center rounded-xl border border-gold/40 text-gold"><MessageSquareText className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ) : (
              (() => {
                const correct = boolPick === card.correct;
                return (
                  <>
                    <div
                      className={cn(
                        "p-4 rounded-xl border-2 text-center space-y-2",
                        correct
                          ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                          : "border-destructive bg-destructive/10",
                      )}
                    >
                      <div className="font-display text-xl font-bold">
                        {correct ? "✓ נכון!" : "✗ לא נכון"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        התשובה:{" "}
                        <span className="font-semibold text-foreground">
                          {card.correct ? "נכון" : "לא נכון"}
                        </span>
                      </div>
                      {card.explanation && (
                        <p className="text-sm text-foreground mt-2">
                          {card.explanation}
                        </p>
                      )}
                    </div>
                    <NextReviewTabs
                      value={nextInterval}
                      customDate={customDate}
                      onChange={setNextInterval}
                      onCustomDate={setCustomDate}
                    />
                    <Button
                      onClick={() => submit(correct, correct ? 5 : 1)}
                      className="w-full bg-gradient-navy text-primary-foreground rounded-xl py-6"
                    >
                      הבא <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </>
                );
              })()
            )}
          </div>
        )}

        {/* Combo card */}
        {card.type === "combo" &&
          (() => {
            const hasFlash = !!card.answer;
            const hasMulti = !!(card.options && card.options.length > 0);
            // Determine active mode: prefer comboPref unless not available, otherwise auto
            let prefMode: "flash" | "multi" | null;
            if (comboPref === "flash" && hasFlash) prefMode = "flash";
            else if (comboPref === "multi" && hasMulti) prefMode = "multi";
            else if (comboPref === "both")
              prefMode = null; // show selector
            else prefMode = hasFlash ? "flash" : hasMulti ? "multi" : null;
            const onlyMode =
              hasFlash && !hasMulti
                ? "flash"
                : !hasFlash && hasMulti
                  ? "multi"
                  : null;
            const activeMode = comboMode ?? prefMode ?? onlyMode;

            if (!activeMode) {
              return (
                <div className="space-y-3">
                  <p className="text-center text-sm text-muted-foreground">
                    בחר מצב תרגול:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => {
                        setComboMode("flash");
                      }}
                      variant="outline"
                      className="border-2 border-gold rounded-xl py-6 text-navy"
                    >
                      <Eye className="h-4 w-4" /> תשובה פתוחה
                    </Button>
                    <Button
                      onClick={() => {
                        setComboMode("multi");
                      }}
                      variant="outline"
                      className="border-2 border-gold rounded-xl py-6 text-navy"
                    >
                      <Check className="h-4 w-4" /> בחירה מרובה
                    </Button>
                  </div>
                </div>
              );
            }

            if (activeMode === "flash") {
              return (
                <div className="space-y-3" dir="rtl">
                  {!revealed ? (
                    <Button
                      onClick={() => setRevealed(true)}
                      className="w-full bg-gradient-navy text-primary-foreground rounded-xl py-6"
                    >
                      <Eye className="h-5 w-5" /> הצג תשובה
                    </Button>
                  ) : (
                    <>
                      <div className="flex items-stretch gap-1.5">
                      <div className="min-w-0 flex-1 p-5 rounded-xl bg-card border-2 border-gold/40">
                        <p
                          className="text-lg text-foreground text-right font-medium"
                          dir="rtl"
                        >
                          {card.answer}
                        </p>
                        {card.explanation && (
                          <p className="text-sm text-muted-foreground text-center mt-2">
                            {card.explanation}
                          </p>
                        )}
                      </div>
                      <button type="button" title="כתוב הערה למנהל על התשובה" aria-label="כתוב הערה למנהל על התשובה" onClick={() => { setReportTarget({ kind: "answer", text: card.answer ?? "", index: 0 }); setReportOpen(true); }} className="flex w-8 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-card text-gold hover:bg-gold/10"><MessageSquareText className="h-3.5 w-3.5" /></button>
                      </div>
                      {guidedMistakeReview ? (
                        <Button onClick={advanceGuidedReview} className="w-full bg-green-600 text-white hover:bg-green-700">הבנתי — לשאלה הבאה</Button>
                      ) : (<>
                      <NextReviewTabs
                        value={nextInterval}
                        customDate={customDate}
                        onChange={setNextInterval}
                        onCustomDate={setCustomDate}
                      />
                      <div className="grid grid-cols-4 gap-2">
                        <Button
                          onClick={() => submit(false, 1)}
                          variant="outline"
                          className="border-2 border-destructive/50 text-destructive"
                        >
                          שכחתי
                        </Button>
                        <Button
                          onClick={() => submit(true, 3)}
                          variant="outline"
                          className="border-2 border-gold/50"
                        >
                          קשה
                        </Button>
                        <Button
                          onClick={() => submit(true, 4)}
                          variant="outline"
                          className="border-2 border-gold"
                        >
                          טוב
                        </Button>
                        <Button
                          onClick={() => submit(true, 5)}
                          className="bg-gradient-navy text-primary-foreground"
                        >
                          קל
                        </Button>
                      </div>
                      </>)}
                      {hasMulti && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRevealed(false);
                            setComboMode("multi");
                          }}
                          className="w-full text-xs"
                        >
                          נסה גם את הבחירה המרובה ↩
                        </Button>
                      )}
                    </>
                  )}
                </div>
              );
            }

            // multi mode
            return (
              <div
                className={cn(
                  "space-y-3",
                  isMobile && "h-full min-h-0 flex flex-col",
                )}
                dir="rtl"
              >
                {/* Reuse the same theme-aware rendering as normal mode */}
                {(() => {
                  const isGrid =
                    quizTheme === "millionaire" ||
                    quizTheme === "colorful" ||
                    (quizTheme === "custom" &&
                      customQuizTheme.optionsLayout === "grid");
                  const wrapperCls =
                    quizTheme === "millionaire"
                      ? "grid grid-cols-2 gap-3 p-4 rounded-2xl bg-[#061022]"
                      : quizTheme === "colorful"
                        ? "grid grid-cols-2 gap-3"
                        : quizTheme === "dark"
                          ? "space-y-2 p-3 rounded-2xl bg-gray-900"
                          : quizTheme === "custom" &&
                              customQuizTheme.optionsLayout === "grid"
                            ? cn(
                                "grid grid-cols-2 gap-3",
                                customQuizTheme.optionWrapperBg &&
                                  "p-3 rounded-2xl",
                              )
                            : quizTheme === "custom" &&
                                customQuizTheme.optionWrapperBg
                              ? "space-y-2 p-3 rounded-2xl"
                              : "space-y-2";
                  const wrapperStyle: React.CSSProperties =
                    quizTheme === "custom" && customQuizTheme.optionWrapperBg
                      ? { backgroundColor: customQuizTheme.optionWrapperBg }
                      : {};
                  const mobileWrapperCls =
                    isMobile && isGrid
                      ? "flex-1 min-h-0 auto-rows-fr"
                      : isMobile
                        ? "flex-1 min-h-0 flex flex-col [&>div]:flex-1 [&>div]:min-h-[64px]"
                        : "";
                  return (
                    <div
                      className={cn(wrapperCls, mobileWrapperCls)}
                      style={wrapperStyle}
                    >
                      {card.options!.map((opt, i) => {
                        const isSelected = selected.includes(i);
                        const isCorrect = card.correctIndices!.includes(i);
                        const showResult = revealed;
                        const handleClick = () => {
                          if (guidedMistakeReview) {
                            if (isCorrect) advanceGuidedReview();
                            return;
                          }
                          if (revealed) return;
                          if (quizAnswerMode === "instant") {
                            const correct =
                              card.correctIndices!.length === 1 &&
                              card.correctIndices!.includes(i);
                            setSelected([i]);
                            setRevealed(true);
                            setInstantPendingSubmit({
                              correct,
                              quality: correct ? 5 : 1,
                            });
                            return;
                          }
                          setSelected((arr) =>
                            isSelected
                              ? arr.filter((x) => x !== i)
                              : [...arr, i],
                          );
                        };
                        let btnCls = "";
                        let btnStyle: React.CSSProperties = {};
                        let optTextStyle: React.CSSProperties = {};
                        let letterEl: React.ReactNode = null;
                        if (quizTheme === "classic") {
                          btnCls = cn(
                            "w-full p-4 rounded-xl border-2 text-right transition-all flex items-center gap-3",
                            !showResult &&
                              isSelected &&
                              "border-navy bg-secondary",
                            !showResult &&
                              !isSelected &&
                              "border-gold/40 bg-card hover:bg-secondary/50",
                            showResult &&
                              isCorrect &&
                              "border-green-500 bg-green-50 dark:bg-green-950/30",
                            showResult &&
                              !isCorrect &&
                              isSelected &&
                              "border-destructive bg-destructive/10",
                            showResult &&
                              !isCorrect &&
                              !isSelected &&
                              "border-gold/20 opacity-60",
                          );
                          letterEl = (
                            <span
                              className={cn(
                                "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold",
                                !showResult && isSelected
                                  ? "bg-navy text-primary-foreground"
                                  : "bg-gold/20 text-navy",
                                showResult && isCorrect
                                  ? "bg-green-500 text-white"
                                  : "",
                                showResult && !isCorrect && isSelected
                                  ? "bg-destructive text-white"
                                  : "",
                                showResult && !isCorrect && !isSelected
                                  ? "bg-gold/20 text-navy opacity-60"
                                  : "",
                              )}
                            >
                              {HEB_LETTERS[i]}
                            </span>
                          );
                        } else if (quizTheme === "millionaire") {
                          btnCls = cn(
                            "relative p-4 rounded-[2rem] border-2 text-right transition-all min-h-[80px] flex flex-col items-end justify-center gap-2 overflow-hidden",
                            !showResult &&
                              !isSelected &&
                              "border-yellow-600/60 bg-gradient-to-b from-[#0d2040] to-[#0a1628] text-white hover:border-yellow-400 hover:shadow-[0_0_12px_rgba(234,179,8,0.3)]",
                            !showResult &&
                              isSelected &&
                              "border-yellow-300 bg-gradient-to-b from-[#1a3a60] to-[#0d2040] text-yellow-200 shadow-[0_0_16px_rgba(234,179,8,0.4)]",
                            showResult &&
                              isCorrect &&
                              "border-green-400 bg-gradient-to-b from-green-800 to-green-900 text-white",
                            showResult &&
                              !isCorrect &&
                              isSelected &&
                              "border-red-500 bg-gradient-to-b from-red-900 to-red-950 text-white",
                            showResult &&
                              !isCorrect &&
                              !isSelected &&
                              "border-yellow-600/20 bg-gradient-to-b from-[#0d2040] to-[#0a1628] opacity-50 text-white",
                          );
                          letterEl = (
                            <span
                              className={cn(
                                "flex-shrink-0 h-6 min-w-[1.5rem] px-1.5 rounded-full flex items-center justify-center text-xs font-bold border",
                                !showResult &&
                                  !isSelected &&
                                  "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
                                !showResult &&
                                  isSelected &&
                                  "bg-yellow-400/30 text-yellow-200 border-yellow-300/60",
                                showResult &&
                                  isCorrect &&
                                  "bg-green-500/30 text-green-200 border-green-400",
                                showResult &&
                                  !isCorrect &&
                                  isSelected &&
                                  "bg-red-500/30 text-red-200 border-red-400",
                                showResult &&
                                  !isCorrect &&
                                  !isSelected &&
                                  "bg-yellow-500/10 text-yellow-600/50 border-yellow-600/20",
                              )}
                            >
                              {HEB_LETTERS[i]}
                            </span>
                          );
                        } else if (quizTheme === "navy") {
                          btnCls = cn(
                            "w-full py-4 px-5 rounded-xl border-2 text-right transition-all flex items-center gap-3 font-semibold",
                            !showResult &&
                              !isSelected &&
                              "border-navy/30 bg-white dark:bg-card text-navy dark:text-foreground hover:border-navy hover:bg-navy/5",
                            !showResult &&
                              isSelected &&
                              "border-navy bg-navy text-white",
                            showResult &&
                              isCorrect &&
                              "border-green-600 bg-green-600 text-white",
                            showResult &&
                              !isCorrect &&
                              isSelected &&
                              "border-red-500 bg-red-500 text-white",
                            showResult &&
                              !isCorrect &&
                              !isSelected &&
                              "border-gray-200 bg-gray-50 dark:bg-card opacity-60",
                          );
                          letterEl = (
                            <span
                              className={cn(
                                "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border",
                                !showResult &&
                                  !isSelected &&
                                  "bg-navy/10 text-navy border-navy/30",
                                !showResult &&
                                  isSelected &&
                                  "bg-white text-navy border-white/60",
                                showResult &&
                                  isCorrect &&
                                  "bg-white text-green-700 border-white",
                                showResult &&
                                  !isCorrect &&
                                  isSelected &&
                                  "bg-white text-red-600 border-white",
                                showResult &&
                                  !isCorrect &&
                                  !isSelected &&
                                  "bg-gray-200/50 text-muted-foreground border-gray-200",
                              )}
                            >
                              {HEB_LETTERS[i]}
                            </span>
                          );
                        } else if (quizTheme === "dark") {
                          btnCls = cn(
                            "w-full p-4 rounded-xl border-2 text-right transition-all flex items-center gap-3",
                            !showResult &&
                              !isSelected &&
                              "border-yellow-600/40 bg-gray-800 text-white hover:border-yellow-400 hover:bg-gray-700",
                            !showResult &&
                              isSelected &&
                              "border-yellow-400 bg-gray-700 text-yellow-200 shadow-[0_0_10px_rgba(234,179,8,0.2)]",
                            showResult &&
                              isCorrect &&
                              "border-green-400 bg-green-900/70 text-green-100",
                            showResult &&
                              !isCorrect &&
                              isSelected &&
                              "border-red-500 bg-red-900/70 text-red-100",
                            showResult &&
                              !isCorrect &&
                              !isSelected &&
                              "border-gray-700 bg-gray-800/50 text-gray-500",
                          );
                          letterEl = (
                            <span
                              className={cn(
                                "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border",
                                !showResult &&
                                  !isSelected &&
                                  "bg-yellow-900/40 text-yellow-400 border-yellow-700/50",
                                !showResult &&
                                  isSelected &&
                                  "bg-yellow-500/30 text-yellow-200 border-yellow-400/50",
                                showResult &&
                                  isCorrect &&
                                  "bg-green-500/30 text-green-200 border-green-400/50",
                                showResult &&
                                  !isCorrect &&
                                  isSelected &&
                                  "bg-red-500/30 text-red-200 border-red-400/50",
                                showResult &&
                                  !isCorrect &&
                                  !isSelected &&
                                  "bg-gray-700 text-gray-500 border-gray-600/50",
                              )}
                            >
                              {HEB_LETTERS[i]}
                            </span>
                          );
                        } else if (quizTheme === "colorful") {
                          const c = COLORFUL_OPTS[i % COLORFUL_OPTS.length];
                          btnCls = cn(
                            "relative p-4 rounded-2xl border-2 text-right transition-all min-h-[80px] flex flex-col items-end justify-center gap-2 font-semibold text-white",
                            !showResult &&
                              !isSelected &&
                              `${c.base} hover:opacity-90`,
                            !showResult && isSelected && c.sel,
                            showResult &&
                              isCorrect &&
                              `${c.base} ring-4 ring-green-300 ring-offset-1`,
                            showResult &&
                              !isCorrect &&
                              isSelected &&
                              `${c.base} opacity-80 ring-4 ring-red-500 ring-offset-1`,
                            showResult &&
                              !isCorrect &&
                              !isSelected &&
                              `${c.base} opacity-40`,
                          );
                          letterEl = null;
                        } else if (quizTheme === "custom") {
                          const oc =
                            customQuizTheme.optionColors[
                              i % customQuizTheme.optionColors.length
                            ];
                          const rad =
                            BORDER_RADIUS_MAP[
                              customQuizTheme.optionsBorderRadius
                            ];
                          btnCls = cn(
                            "p-4 border-2 text-right transition-all flex items-center gap-3 font-medium",
                            !isGrid && "w-full",
                            isGrid &&
                              "min-h-[80px] flex-col items-end justify-center",
                            !showResult && "hover:opacity-90",
                            showResult &&
                              isCorrect &&
                              "ring-4 ring-green-300 ring-offset-1",
                            showResult &&
                              !isCorrect &&
                              isSelected &&
                              "opacity-80 ring-4 ring-red-500 ring-offset-1",
                            showResult &&
                              !isCorrect &&
                              !isSelected &&
                              "opacity-40",
                          );
                          btnStyle = {
                            backgroundColor: oc.bg,
                            color: oc.text,
                            borderColor: oc.border,
                            borderRadius: rad,
                          };
                          optTextStyle = {
                            fontFamily:
                              FONT_FAMILY_MAP[customQuizTheme.answerFontFamily],
                            fontSize:
                              FONT_SIZE_MAP[customQuizTheme.answerFontSize],
                            fontWeight:
                              FONT_WEIGHT_MAP[customQuizTheme.answerFontWeight],
                          };
                          letterEl = (
                            <span
                              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border"
                              style={{
                                backgroundColor: oc.text + "22",
                                color: oc.text,
                                borderColor: oc.text + "55",
                              }}
                            >
                              {HEB_LETTERS[i]}
                            </span>
                          );
                        }
                        // Apply answer typography overlay on top of any theme
                        optTextStyle = {
                          ...optTextStyle,
                          ...typographyToStyle(answerTypography),
                          textAlign: answerTypography.align,
                        };
                        btnStyle = {
                          ...btnStyle,
                          ...typographyToBgStyle(answerTypography),
                        };
                        return (
                          <div key={i} className={cn("flex gap-1.5", isMobile && "min-h-0")}>
                          <button
                            dir="rtl"
                            disabled={revealed && !guidedMistakeReview}
                            onClick={handleClick}
                            className={cn(
                              btnCls,
                              "min-w-0 flex-1",
                              isMobile &&
                                (isGrid ? "h-full min-h-0" : "flex-1 min-h-0"),
                            )}
                            style={btnStyle}
                          >
                            {isGrid ? (
                              <>
                                <span
                                  className="font-medium text-right leading-snug w-full"
                                  style={optTextStyle}
                                >
                                  {opt}
                                </span>
                                <div className="w-full flex justify-between items-center mt-1">
                                  {letterEl ?? <span />}
                                  <span>
                                    {showResult && isCorrect && (
                                      <Check className="h-5 w-5 text-green-300" />
                                    )}
                                    {showResult && !isCorrect && isSelected && (
                                      <X className="h-5 w-5 text-red-300" />
                                    )}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                {letterEl}
                                <span
                                  className="font-medium flex-1 text-right"
                                  style={optTextStyle}
                                >
                                  {opt}
                                </span>
                                <span className="flex-shrink-0 w-5">
                                  {showResult && isCorrect && (
                                    <Check className="h-5 w-5 text-green-600" />
                                  )}
                                  {showResult && !isCorrect && isSelected && (
                                    <X className="h-5 w-5 text-destructive" />
                                  )}
                                </span>
                              </>
                            )}
                          </button>
                          <button type="button" title={`כתוב הערה למנהל על תשובה ${i + 1}`} aria-label={`כתוב הערה למנהל על תשובה ${i + 1}`} onClick={() => { setReportTarget({ kind: "answer", text: opt, index: i }); setReportOpen(true); }} className="flex w-8 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-card text-gold hover:bg-gold/10"><MessageSquareText className="h-3.5 w-3.5" /></button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {!revealed ? (
                  quizAnswerMode === "button" ? (
                    <Button
                      disabled={selected.length === 0}
                      onClick={() => setRevealed(true)}
                      className="w-full bg-gradient-navy text-primary-foreground rounded-xl py-6"
                    >
                      בדוק תשובה
                    </Button>
                  ) : null
                ) : (
                  (() => {
                    const correct =
                      selected.length === card.correctIndices!.length &&
                      selected.every((s) => card.correctIndices!.includes(s));
                    return (
                      <>
                        {quizAnswerMode === "button" && (
                          <NextReviewTabs
                            value={nextInterval}
                            customDate={customDate}
                            onChange={setNextInterval}
                            onCustomDate={setCustomDate}
                          />
                        )}
                        {quizAnswerMode === "button" && (
                          <Button
                            onClick={() => submit(correct, correct ? 5 : 1)}
                            className={cn(
                              "w-full rounded-xl py-6 text-primary-foreground",
                              correct
                                ? "bg-green-600 hover:bg-green-700"
                                : "bg-destructive hover:bg-destructive/90",
                            )}
                          >
                            {correct ? "נכון! המשך" : "לא נכון - המשך"}
                          </Button>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            );
          })()}
      </div>

      <QuizThemeEditorDialog
        key={themeEditorOpen ? "editor-open" : "editor-closed"}
        open={themeEditorOpen}
        value={customQuizTheme}
        onSave={saveCustomTheme}
        savedThemes={savedQuizThemes}
        onSavedThemesChange={saveSavedQuizThemes}
        onPreview={(t) => setCustomQuizTheme(t)}
        onClose={() => setThemeEditorOpen(false)}
      />

      <CardDecksDialog
        card={card ?? null}
        open={deckDialogOpen}
        onOpenChange={setDeckDialogOpen}
      />

      {card && (
        <QuestionReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          cardId={card.id}
          question={card.question}
          target={reportTarget}
        />
      )}

      <Dialog open={editorOpen && !!card} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכה — שאלה ותשובה</DialogTitle>
          </DialogHeader>
          {card && (
            <CardQuickEditor card={card} onClose={() => setEditorOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
