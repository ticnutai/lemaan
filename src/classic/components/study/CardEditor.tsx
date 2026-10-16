import { lazy, Suspense, useState, useMemo, useEffect } from "react";
import { Plus, X, FolderTree, ChevronUp, ChevronDown, Sparkles, Loader2, ListPlus, FolderPlus, Save, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Card as StudyCardType, CardType } from "@/lib/study/types";
import { useStudy } from "@/lib/study/store";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { dafLabel } from "@/lib/study/shasGen";
import { shasCategoryPath } from "@/lib/study/shasClassification";

const RECENT_CATS_KEY = "card-editor:recent-cats";
const MAX_RECENT = 6;
const IS_DEV = import.meta.env.DEV;
const CategoryPickerDialog = lazy(() => import("./CategoryPickerDialog").then((m) => ({ default: m.CategoryPickerDialog })));

const buildCategoryOptions = (categories: { id: string; name: string; parentId: string | null }[]) => {
  const byParent = new Map<string | null, { id: string; name: string; parentId: string | null }[]>();
  for (const c of categories) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }

  const result: { id: string; label: string; name: string }[] = [];
  const walk = (parentId: string | null, parentPath: string) => {
    const children = byParent.get(parentId) ?? [];
    for (const c of children) {
      const path = parentPath ? `${parentPath} / ${c.name}` : c.name;
      result.push({ id: c.id, label: path, name: c.name });
      walk(c.id, path);
    }
  };

  walk(null, "");
  return result;
};

// Helper: union-accessible card type for reading optional fields in state initializers
type AnyCard = StudyCardType & { answer?: string; options?: string[]; correctIndices?: number[]; explanation?: string; masechta?: string; daf?: number; amud?: 1 | 2 };

type AddQuestionTrace = {
  id: string;
  source: string;
  catName: string;
  clickedAt: number;
  unexpectedCategoryDialogAt?: number;
  questionDialogOpenedAt?: number;
  questionDialogPaintAt?: number;
};

type AddQuestionPerfSample = {
  id: string;
  catName: string;
  openedMs: number;
  paintedMs: number;
  categoryDialogAlsoOpened: boolean;
  atIso: string;
};

const ADD_QUESTION_PERF_MAX = 20;

const median = (vals: number[]) => {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const recordAddQuestionPerfSample = (sample: AddQuestionPerfSample) => {
  if (!IS_DEV) return;
  const w = window as Window & { __addQuestionPerfSamples?: AddQuestionPerfSample[] };
  const prev = Array.isArray(w.__addQuestionPerfSamples) ? w.__addQuestionPerfSamples : [];
  const next = [...prev, sample].slice(-ADD_QUESTION_PERF_MAX);
  w.__addQuestionPerfSamples = next;

  const openedVals = next.map((s) => s.openedMs);
  const paintedVals = next.map((s) => s.paintedMs);
  const overlaps = next.filter((s) => s.categoryDialogAlsoOpened).length;

  console.info(
    `[trace][add-question:summary] samples=${next.length} opened(avg=${(
      openedVals.reduce((a, b) => a + b, 0) / openedVals.length
    ).toFixed(1)}ms, median=${median(openedVals).toFixed(1)}ms) painted(avg=${(
      paintedVals.reduce((a, b) => a + b, 0) / paintedVals.length
    ).toFixed(1)}ms, median=${median(paintedVals).toFixed(1)}ms) overlaps=${overlaps}`,
  );
};

interface Props {
  deckId?: string | null; // optional – null means card belongs to categories only
  onClose?: () => void;
  editCard?: StudyCardType; // when provided, edit instead of create
  prefillCategories?: string[]; // pre-select category names when creating a new card
  prefillDaf?: { masechta: string; daf: number; amud: 1 | 2 }; // page context is itself a valid classification
}

export function CardEditor({ deckId, onClose, editCard, prefillCategories, prefillDaf }: Props) {
  const { addCard, updateCard, addCategory, deleteCategory, addDeck, updateDeckCategoryIds, state, forkSourceCard, isCardFromSource } = useStudy();
  const { isAdmin, can } = usePermissions();
  const isEdit = !!editCard;

  // Deck assignment is optional. A deckId passed by an explicit "new question"
  // action preselects that deck; opening the general creation tab still uses null.
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(
    editCard?.deckId ?? deckId ?? null,
  );

  const [type, setType] = useState<CardType>(editCard?.type ?? "flashcard");
  // Create-mode: which question types to generate at once (one card per type).
  // Default: American multiple-choice. In edit-mode this state is ignored (single type).
  const [createTypes, setCreateTypes] = useState<CardType[]>(
    editCard ? [editCard.type] : ["multiple"],
  );
  const [multipleTypeSelection, setMultipleTypeSelection] = useState(false);
  const toggleCreateType = (t: CardType) => {
    setCreateTypes((arr) => {
      if (!multipleTypeSelection) return [t];
      return arr.includes(t)
        ? (arr.length > 1 ? arr.filter((x) => x !== t) : arr) // keep at least one
        : [...arr, t];
    });
  };
  const hasType = (t: CardType) => (isEdit ? type === t : createTypes.includes(t));
  const [question, setQuestion] = useState(editCard?.question ?? "");
  const [answer, setAnswer] = useState(
    editCard && (editCard.type === "flashcard" || editCard.type === "combo") ? (editCard as AnyCard).answer ?? "" : "",
  );
  const [options, setOptions] = useState<string[]>(
    editCard && (editCard.type === "multiple" || editCard.type === "combo")
      ? (editCard as AnyCard).options ?? ["", "", "", ""]
      : ["", "", "", ""],
  );
  const [correctIndices, setCorrectIndices] = useState<number[]>(
    editCard && (editCard.type === "multiple" || editCard.type === "combo")
      ? (editCard as AnyCard).correctIndices ?? []
      : [],
  );
  const [boolCorrect, setBoolCorrect] = useState<"true" | "false">(
    editCard?.type === "boolean" ? (editCard.correct ? "true" : "false") : "true",
  );
  const [explanation, setExplanation] = useState(
    editCard && (editCard.type === "boolean" || editCard.type === "combo") ? (editCard as AnyCard).explanation ?? "" : "",
  );

  // === Daf/Amud assignment ===
  const initMasechta = (editCard as AnyCard | undefined)?.masechta ?? prefillDaf?.masechta ?? "";
  const initDaf = (editCard as AnyCard | undefined)?.daf ?? prefillDaf?.daf;
  const initAmud = ((editCard as AnyCard | undefined)?.amud ?? prefillDaf?.amud ?? 1) as 1 | 2;
  const [masechta, setMasechta] = useState<string>(initMasechta);
  const [daf, setDaf] = useState<number | undefined>(initDaf);
  const [amud, setAmud] = useState<1 | 2>(initAmud);

  // Tags - extract category tags (cat:NAME) separately
  const initialTags = editCard?.tags ?? [];
  const initialCategoryNames = initialTags.filter((t) => t.startsWith("cat:")).map((t) => t.slice(4));
  const initialPlainTags = initialTags.filter((t) => !t.startsWith("cat:"));
  const [tagsInput, setTagsInput] = useState(initialPlainTags.join(", "));
  const [optionalOptionsOpen, setOptionalOptionsOpen] = useState(false);
  const [selectedCategoryNames, setSelectedCategoryNames] = useState<string[]>(
    isEdit ? initialCategoryNames : (prefillCategories ?? initialCategoryNames),
  );
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // === AI category classification ===
  const [aiClassifying, setAiClassifying] = useState(false);

  // Combo: which modes to enable
  const [comboFlashEnabled, setComboFlashEnabled] = useState(
    editCard?.type === "combo" ? !!(editCard as AnyCard).answer : true,
  );
  const [comboMultiEnabled, setComboMultiEnabled] = useState(
    editCard?.type === "combo" ? !!((editCard as AnyCard).options?.length) : true,
  );

  // === Recently used categories (per-user localStorage) ===
  const [recentCats, setRecentCats] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_CATS_KEY);
      return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : [];
    } catch { return []; }
  });
  const pushRecent = (names: string[]) => {
    if (names.length === 0) return;
    setRecentCats((prev) => {
      const next = [...names, ...prev.filter((n) => !names.includes(n))].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_CATS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  // Source-overlay: if editing a card from the source user, we'll fork it
  // and (optionally) send a change-note to the admin/source.
  const editingSourceCard = !!editCard && isCardFromSource(editCard.id);
  const [changeNote, setChangeNote] = useState("");

  const resetQuestionFields = () => {
    setQuestion("");
    setAnswer("");
    setOptions(["", "", "", ""]);
    setCorrectIndices([]);
    setBoolCorrect("true");
    setExplanation("");
  };

  const handleSave = (followUp: "close" | "same-classification" | "new-classification" = "close") => {
    if (!can('cards', isEdit && !editingSourceCard ? 'edit' : 'create')) {
      return toast({ title: 'אין הרשאה לשמירת שאלות בתפקיד הנוכחי', variant: 'destructive' });
    }
    const showMissingField = (description: string) => {
      toast({
        title: "לא ניתן עדיין לשמור את השאלה",
        description,
        variant: "destructive",
      });
    };

    if (!question.trim()) {
      showMissingField("צריך לכתוב את נוסח השאלה.");
      return;
    }
    if (!isEdit && selectedCategoryNames.length === 0 && !prefillDaf) {
      showMissingField("לצורך יצירת שאלה נדרש לבחור לפחות סיווג אחד.");
      return;
    }
    const plainTags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const effectiveCategoryNames = selectedCategoryNames.length > 0
      ? selectedCategoryNames
      : prefillDaf
        ? shasCategoryPath(prefillDaf)
        : [];
    const categoryTags = effectiveCategoryNames.map((n) => `cat:${n}`);
    const tags = [...plainTags, ...categoryTags];
    if (selectedCategoryNames.length) pushRecent(selectedCategoryNames);

    type NewCard = Omit<StudyCardType, "id" | "createdAt" | "srs" | "stats">;
    const dId = selectedDeckId;
    const dafFields: { masechta?: string | null; daf?: number | null; amud?: 1 | 2 | null } = masechta && daf
      ? { masechta, daf, amud }
      : { masechta: null, daf: null, amud: null };

    // ---- EDIT MODE: keep single-card update ----
    if (isEdit && editCard) {
      const save = (card: Record<string, unknown>) => {
        if (editingSourceCard) {
          void forkSourceCard(editCard.id, { patch: card as Partial<StudyCardType>, note: changeNote });
        } else {
          updateCard(editCard.id, card);
        }
        onClose?.();
      };
      if (type === "flashcard") {
        if (!answer.trim()) return;
        save({ deckId: dId, type, question, answer, tags, ...dafFields });
      } else if (type === "multiple") {
        const cleanOpts = options.map((o) => o.trim());
        if (cleanOpts.some((o) => !o) || correctIndices.length === 0) return;
        save({ deckId: dId, type, question, options: cleanOpts, correctIndices, tags, ...dafFields });
      } else if (type === "boolean") {
        save({ deckId: dId, type, question, correct: boolCorrect === "true", explanation, tags, ...dafFields });
      } else {
        // combo (legacy edit)
        if (!comboFlashEnabled && !comboMultiEnabled) return;
        let comboAnswer: string | undefined;
        let comboOptions: string[] | undefined;
        let comboCorrectIndices: number[] | undefined;
        if (comboFlashEnabled) {
          if (!answer.trim()) return;
          comboAnswer = answer;
        }
        if (comboMultiEnabled) {
          const cleanOpts = options.map((o) => o.trim());
          if (cleanOpts.some((o) => !o) || correctIndices.length === 0) return;
          comboOptions = cleanOpts;
          comboCorrectIndices = correctIndices;
        }
        save({ deckId: dId, type, question, tags, explanation, ...dafFields,
          answer: comboAnswer, options: comboOptions, correctIndices: comboCorrectIndices });
      }
      return;
    }

    // ---- CREATE MODE: one card per selected type, sharing question + tags ----
    if (createTypes.length === 0) return;
    const cards: NewCard[] = [];
    if (createTypes.includes("flashcard")) {
      if (!answer.trim()) {
        showMissingField("בשאלת כרטיסייה צריך לכתוב תשובה.");
        return;
      }
      cards.push({ deckId: dId, type: "flashcard", question, answer, tags, ...dafFields } as unknown as NewCard);
    }
    if (createTypes.includes("multiple")) {
      const cleanOpts = options.map((o) => o.trim());
      if (cleanOpts.some((o) => !o)) {
        showMissingField("בשאלה אמריקאית צריך למלא את כל אפשרויות התשובה.");
        return;
      }
      if (correctIndices.length === 0) {
        showMissingField("צריך לסמן בעיגול לפחות תשובה נכונה אחת.");
        return;
      }
      cards.push({ deckId: dId, type: "multiple", question, options: cleanOpts, correctIndices, tags, ...dafFields } as unknown as NewCard);
    }
    if (createTypes.includes("boolean")) {
      cards.push({ deckId: dId, type: "boolean", question, correct: boolCorrect === "true", explanation, tags, ...dafFields } as unknown as NewCard);
    }
    for (const c of cards) addCard(c);
    if (followUp === "same-classification") {
      resetQuestionFields();
      toast({
        title: cards.length > 1 ? `${cards.length} שאלות נוספו` : "השאלה נוספה",
        description: "הסיווג נשמר. אפשר לכתוב עכשיו שאלה נוספת באותו מקום.",
      });
      return;
    }
    if (followUp === "new-classification") {
      resetQuestionFields();
      setSelectedCategoryNames([]);
      setSelectedDeckId(null);
      setTagsInput("");
      setMasechta("");
      setDaf(undefined);
      setAmud(1);
      toast({
        title: cards.length > 1 ? `${cards.length} שאלות נוספו` : "השאלה נוספה",
        description: "הסיווג נוקה. בחר סיווג חדש לשאלה הבאה.",
      });
      return;
    }
    onClose?.();
  };

  const showFlashFields = hasType("flashcard") || (type === "combo" && comboFlashEnabled && isEdit);
  const showMultiFields = hasType("multiple") || (type === "combo" && comboMultiEnabled && isEdit);
  const showBooleanFields = hasType("boolean");
  const selectedDeckName = selectedDeckId
    ? state.decks.find((deck) => deck.id === selectedDeckId)?.name
    : null;

  useEffect(() => {
    const w = window as Window & {
      __cardEditorOpenRequestedAt?: number;
      __addQuestionTrace?: AddQuestionTrace;
    };
    const requestedAt = w.__cardEditorOpenRequestedAt;
    const addQuestionTrace = w.__addQuestionTrace;

    if (IS_DEV && addQuestionTrace && typeof addQuestionTrace.clickedAt === "number") {
      const openedAt = performance.now();
      addQuestionTrace.questionDialogOpenedAt = openedAt;
      console.info(
        `[trace][add-question:${addQuestionTrace.id}] Question dialog opened ${(
          openedAt - addQuestionTrace.clickedAt
        ).toFixed(1)}ms after click`,
        {
          catName: addQuestionTrace.catName,
          categoryDialogAlsoOpened: !!addQuestionTrace.unexpectedCategoryDialogAt,
        },
      );
    }

    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => {
        if (IS_DEV && typeof requestedAt === "number") {
          const dt = performance.now() - requestedAt;
          console.info(`[perf][CardEditor] open-to-paint: ${dt.toFixed(1)}ms`);
          w.__cardEditorOpenRequestedAt = undefined;
        }

        const trace = w.__addQuestionTrace;
        if (IS_DEV && trace && typeof trace.clickedAt === "number") {
          const paintedAt = performance.now();
          trace.questionDialogPaintAt = paintedAt;
          const openedMs = (trace.questionDialogOpenedAt ?? paintedAt) - trace.clickedAt;
          const paintedMs = paintedAt - trace.clickedAt;
          console.info(
            `[trace][add-question:${trace.id}] Question dialog painted ${(
              paintedMs
            ).toFixed(1)}ms after click`,
            {
              catName: trace.catName,
              categoryDialogAlsoOpened: !!trace.unexpectedCategoryDialogAt,
            },
          );
          recordAddQuestionPerfSample({
            id: trace.id,
            catName: trace.catName,
            openedMs,
            paintedMs,
            categoryDialogAlsoOpened: !!trace.unexpectedCategoryDialogAt,
            atIso: new Date().toISOString(),
          });
        }
      });
      void raf2;
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose?.();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [onClose]);

  useEffect(() => {
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;

    if (typeof ric === "function") {
      const id = ric(() => setShowCategoryPicker(true), { timeout: 350 });
      return () => {
        const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (typeof cic === "function") cic(id);
      };
    }

    const t = window.setTimeout(() => setShowCategoryPicker(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div dir="rtl" className="space-y-4">
      {!isEdit && !prefillDaf && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-gold/55 bg-gold/10 px-4 py-3 text-right" role="note">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-card text-gold">
            <FolderTree className="h-5 w-5" />
          </span>
          <div>
            <div className="font-bold text-foreground">לצורך יצירת שאלה נדרש סיווג</div>
            <div className="text-sm text-muted-foreground">בחר לפחות קטגוריה אחת באזור הסיווג לפני שמירת השאלה.</div>
          </div>
        </div>
      )}
      {prefillDaf && !isEdit && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-emerald-500/45 bg-emerald-50 px-4 py-3 text-right text-emerald-950" role="note">
          <BookOpen className="h-5 w-5 shrink-0" />
          <div>
            <div className="font-bold">השאלה תסווג אוטומטית לעמוד זה</div>
            <div className="text-sm">{prefillDaf.masechta} · דף {dafLabel(prefillDaf.daf).replace(".", "")} · עמוד {prefillDaf.amud === 1 ? "א׳" : "ב׳"}</div>
          </div>
        </div>
      )}
      <div
        dir="ltr"
        className={cn("grid gap-4 xl:items-start", !prefillDaf && "xl:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.7fr)]")}
      >
      {/* === Categories — moved to TOP === */}
      {!prefillDaf && <div
        dir="rtl"
        className="space-y-2 rounded-xl border-2 border-gold/40 bg-secondary/20 p-3 xl:col-start-2 xl:row-start-1 xl:sticky xl:top-4 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-2">
          <Label className="flex items-center gap-1.5">
            <FolderTree className="h-4 w-4" /> סיווג <span className="text-destructive" aria-hidden="true">*</span>
            {selectedCategoryNames.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({selectedCategoryNames.length} נבחרו)
              </span>
            )}
          </Label>
          <div className="flex items-center gap-1.5">
            {isAdmin && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={aiClassifying || !question.trim() || (state.categories?.length ?? 0) === 0}
              onClick={async () => {
                const categoryOptions = buildCategoryOptions(state.categories ?? []);
                if (!question.trim() || categoryOptions.length === 0) return;
                setAiClassifying(true);
                try {
                  const paths = categoryOptions.map((c) => c.label || c.name);
                  const { data, error } = await supabase.functions.invoke("classify-category", {
                    body: {
                      question,
                      answer: answer || undefined,
                      categories: paths,
                      maxResults: 2,
                    },
                  });
                  if (error) throw error;
                  const matchPaths: string[] = Array.isArray(data?.matches) ? data.matches : [];
                  if (matchPaths.length === 0) {
                    toast({ title: "לא נמצאה קטגוריה מתאימה", description: "נסה לנסח את השאלה ביתר פירוט." });
                    return;
                  }
                  // Map full paths back to leaf names (selectedCategoryNames stores leaf names)
                  const pathToName = new Map(categoryOptions.map((c) => [c.label || c.name, c.name]));
                  const newNames = matchPaths
                    .map((p) => pathToName.get(p))
                    .filter((n): n is string => !!n);
                  setSelectedCategoryNames((prev) => Array.from(new Set([...prev, ...newNames])));
                  toast({ title: "סווג עם AI", description: `נבחרו: ${matchPaths.join(", ")}` });
                } catch (e) {
                  console.error("classify-category error", e);
                  const msg = (e as { message?: string })?.message || "שגיאה בסיווג";
                  toast({ title: "סיווג נכשל", description: msg, variant: "destructive" });
                } finally {
                  setAiClassifying(false);
                }
              }}
              title="סווג את השאלה לקטגוריה הנכונה לפי תוכנה"
              className="h-7 gap-1 px-2 text-xs border-gold/50 text-navy hover:border-gold hover:bg-gold/10"
            >
              {aiClassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              סווג עם AI
            </Button>
            )}
          </div>
        </div>

        {showCategoryPicker ? (
          <Suspense fallback={<div className="rounded-lg border border-gold/25 bg-card/60 px-3 py-2 text-xs text-muted-foreground text-right">טוען סיווג מתקדם...</div>}>
            <CategoryPickerDialog
              inline
              selected={selectedCategoryNames}
              onConfirm={(names) => setSelectedCategoryNames(names)}
            />
          </Suspense>
        ) : (
          <div className="rounded-lg border border-gold/30 bg-card/60 px-3 py-2 text-xs text-muted-foreground text-right">
            הסיווג מתקדם נטען רק כשפותחים אותו, כדי שהדיאלוג יעלה מיד.
          </div>
        )}
      </div>}

      <div dir="rtl" className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-1">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="block text-right">סוג שאלה</Label>
          {!isEdit && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gold/35 bg-card px-3 py-1.5 text-xs text-navy">
              <Checkbox
                checked={multipleTypeSelection}
                onCheckedChange={(checked) => {
                  const enabled = checked === true;
                  setMultipleTypeSelection(enabled);
                  if (!enabled) {
                    setCreateTypes((current) => [current[current.length - 1] ?? "multiple"]);
                  }
                }}
              />
              בחירת כמה סוגי שאלות
            </label>
          )}
        </div>
        {isEdit ? (
          <Select value={type} onValueChange={(v) => setType(v as CardType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="flashcard">כרטיסיה (שאלה → תשובה)</SelectItem>
              <SelectItem value="multiple">אמריקאית (בחירה מרובה)</SelectItem>
              <SelectItem value="boolean">נכון / לא נכון</SelectItem>
              <SelectItem value="combo">משולבת (אמריקאית + תשובה פתוחה)</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="flex flex-row-reverse gap-1.5" role="group" aria-label="סוגי שאלות">
            {([
              { id: "flashcard" as const, label: "כרטיסיה" },
              { id: "boolean"   as const, label: "נכון/לא נכון" },
              { id: "multiple"  as const, label: "אמריקאי" },
            ]).map(({ id, label }) => {
              const active = createTypes.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleCreateType(id)}
                  aria-pressed={active}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all",
                    active
                      ? "border-navy bg-gradient-navy text-primary-foreground shadow-sm"
                      : "border-gold/40 bg-card text-navy hover:border-gold hover:bg-gold/10",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {!isEdit && multipleTypeSelection && createTypes.length > 1 && (
          <p className="text-xs text-muted-foreground text-right">
            ייווצרו כמה שאלות שונות לאותה שאלה, לפי הסוגים שבחרת.
          </p>
        )}
        {!isEdit && !multipleTypeSelection && (
          <p className="text-xs text-muted-foreground text-right">
            לחיצה על סוג אחר מחליפה את הסוג הנוכחי ואינה שומרת או מוסיפה שאלה.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="block text-right">שאלה</Label>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="כתוב את השאלה..."
          className="border-2 border-gold/40 text-right"
        />
      </div>

      {showFlashFields && (
        <div className="space-y-2 rounded-lg border border-gold/30 bg-secondary/10 p-2">
          <Label className="block text-right text-xs text-muted-foreground">תשובה (כרטיסיה)</Label>
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="כתוב את התשובה..." className="border-2 border-gold/40 text-right" />
        </div>
      )}

      {showMultiFields && (
        <div className="space-y-2 rounded-lg border border-gold/30 bg-secondary/10 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-right">
            <Label className="text-xs text-muted-foreground">אפשרויות אמריקאיות (חצים לסידור)</Label>
            <strong className="rounded-lg border border-gold/60 bg-gold/15 px-3 py-1.5 text-sm font-extrabold text-foreground">
              נא לסמן תשובה נכונה
            </strong>
          </div>
          {options.map((opt, i) => {
            const move = (dir: -1 | 1) => {
              const j = i + dir;
              if (j < 0 || j >= options.length) return;
              setOptions((arr) => {
                const next = arr.slice();
                [next[i], next[j]] = [next[j], next[i]];
                return next;
              });
              setCorrectIndices((arr) =>
                arr.map((x) => (x === i ? j : x === j ? i : x)),
              );
            };
            return (
              <div key={i} className="flex items-center gap-2 flex-row-reverse">
                <Checkbox
                  checked={correctIndices.includes(i)}
                  onCheckedChange={(c) => {
                    setCorrectIndices((arr) => c ? [...arr, i] : arr.filter((x) => x !== i));
                  }}
                />
                <Input
                  value={opt}
                  onChange={(e) => setOptions((arr) => arr.map((o, idx) => idx === i ? e.target.value : o))}
                  placeholder={`אפשרות ${i + 1}`}
                  className="border-2 border-gold/40 text-right"
                />
                <div className="flex flex-col">
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="h-5 w-5"
                    disabled={i === 0}
                    onClick={() => move(-1)}
                    title="העבר למעלה"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="h-5 w-5"
                    disabled={i === options.length - 1}
                    onClick={() => move(1)}
                    title="העבר למטה"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {options.length > 2 && (
                  <Button size="icon" variant="ghost" onClick={() => {
                    setOptions((arr) => arr.filter((_, idx) => idx !== i));
                    setCorrectIndices((arr) => arr.filter((x) => x !== i).map((x) => x > i ? x - 1 : x));
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setOptions((arr) => [...arr, ""])}
            className="border-2 border-gold/40">
            <Plus className="h-3 w-3" /> הוסף אפשרות
          </Button>
        </div>
      )}

      {showBooleanFields && (
        <div className="space-y-3 rounded-lg border border-gold/30 bg-secondary/10 p-2">
          <div className="space-y-2">
          <Label className="block text-right text-xs text-muted-foreground">נכון/לא נכון — התשובה הנכונה</Label>
            <RadioGroup value={boolCorrect} onValueChange={(v) => setBoolCorrect(v as "true" | "false")} className="flex flex-row-reverse gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="true" /> נכון
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="false" /> לא נכון
              </label>
            </RadioGroup>
          </div>
        </div>
      )}

      {(showBooleanFields || (isEdit && type === "combo")) && (
        <div className="space-y-2">
        <Label className="block text-right">הסבר (אופציונלי)</Label>
          <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)}
            className="border-2 border-gold/40 text-right" />
        </div>
      )}

      {/* Categories selector moved to TOP */}

      {editingSourceCard && (
        <div className="space-y-2 rounded-xl border-2 border-gold/50 bg-gold/10 p-3 text-right">
          <div className="text-sm font-semibold text-gold-foreground">
            השאלה הזו הגיעה ממשתמש המקור (לקריאה בלבד).
          </div>
          <div className="text-xs text-muted-foreground">
            השמירה תיצור עותק אישי שלך בענן ולא תשנה את המקור. אפשר להוסיף הערה למנהל על השינוי המוצע.
          </div>
          <Label className="block text-right">הערה למנהל (אופציונלי)</Label>
          <Input
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="למשל: ניסוח לא ברור / תשובה שגויה / הצעה לתיקון"
            className="border-2 border-gold/40 text-right"
          />
        </div>
      )}

      <Collapsible
        open={optionalOptionsOpen}
        onOpenChange={setOptionalOptionsOpen}
        className="rounded-xl border-2 border-gold/40 bg-secondary/20"
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-right hover:bg-gold/10"
            aria-label={optionalOptionsOpen ? "מזער אפשרויות אופציונליות" : "פתח אפשרויות אופציונליות"}
          >
            <div className="min-w-0">
              <div className="font-semibold text-foreground">אפשרויות אופציונליות</div>
              <div className="truncate text-xs font-normal text-muted-foreground">
                {selectedDeckName
                  ? `מערכת: ${selectedDeckName}${tagsInput.trim() ? " · נוספו תגיות" : ""}`
                  : tagsInput.trim()
                    ? "נוספו תגיות · ללא מערכת יעד"
                    : "תגיות ומערכת יעד"}
              </div>
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 transition-transform",
                optionalOptionsOpen && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-4 border-t border-gold/30 px-3 pb-3 pt-4">
          <div className="space-y-2">
            <Label className="block text-right">תגיות (מופרד בפסיקים)</Label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="לדוגמה: היסטוריה, מבחן"
              className="border-2 border-gold/40 text-right"
            />
          </div>

          <div className="space-y-2">
            <Label className="block text-right">מערכת יעד</Label>
            <Select
              value={selectedDeckId ?? "__none__"}
              onValueChange={(value) => setSelectedDeckId(value === "__none__" ? null : value)}
            >
              <SelectTrigger aria-label="מערכת יעד (אופציונלי)" className="border-2 border-gold/40 text-right">
                <SelectValue placeholder="בחר מערכת" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">ללא מערכת — סיווג לפי קטגוריות בלבד</SelectItem>
                {state.decks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>{deck.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground text-right">
              אפשר לשמור את השאלה ללא מערכת או לבחור מערכת שאליה היא תתווסף.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <DialogFooter className="flex-wrap gap-2 sm:justify-start">
        {!isEdit && prefillDaf && (
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave("same-classification")}
            title="שמור את השאלה והשאר את הסיווג לעמוד הנוכחי"
            className="h-12 gap-2 rounded-xl border-2 border-gold/60 px-5 text-base font-bold"
          >
            <ListPlus className="h-4 w-4" />
            הוסף שאלה נוספת לעמוד זה
          </Button>
        )}
        {!isEdit && !prefillDaf && (
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave("new-classification")}
            title="שמור את השאלה, נקה את הסיווג והישאר בטופס"
            className="gap-2 rounded-xl border-2 border-gold/60"
          >
            <FolderPlus className="h-4 w-4" />
            שמור והוסף שאלה בסיווג חדש
          </Button>
        )}
        {!isEdit && !prefillDaf && (
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave("same-classification")}
            title="שמור את השאלה והשאר את הקטגוריות והמערכת שנבחרו"
            className="gap-2 rounded-xl border-2 border-gold/60"
          >
            <ListPlus className="h-4 w-4" />
            שמור והוסף שאלה באותו סיווג
          </Button>
        )}
        <Button
          onClick={() => handleSave("close")}
          className={cn(
            "rounded-xl bg-gradient-navy text-primary-foreground",
            prefillDaf && !isEdit && "h-12 min-w-36 gap-2 px-6 text-base font-bold shadow-elegant ring-2 ring-gold/40",
          )}
        >
          {isEdit ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {isEdit
            ? (editingSourceCard ? "צור עותק ושמור" : "שמור שינויים")
            : prefillDaf
              ? "שמור"
              : "שמור וצא"}
        </Button>
      </DialogFooter>

      </div>
      </div>
    </div>
  );
}
