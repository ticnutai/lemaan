import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, BookOpen, Pencil, Check as CheckIcon, X as XIcon, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStudy } from "@/lib/study/store";
import type { Card as StudyCardType } from "@/lib/study/types";
import { toast } from "@/hooks/use-toast";

const CardEditor = lazy(() => import("./CardEditor").then((m) => ({ default: m.CardEditor })));
const DeckCreateDialog = lazy(() => import("./DeckCreateDialog").then((m) => ({ default: m.DeckCreateDialog })));
const StudyPlansCard = lazy(() => import("./StudyPlansCard").then((m) => ({ default: m.StudyPlansCard })));
const CardQuickEditor = lazy(() => import("./CardQuickEditor").then((m) => ({ default: m.CardQuickEditor })));

type DialogTab = "existing" | "new-questions" | "edit" | "new-deck" | "reviews";

interface Props {
  cards: StudyCardType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkCardDecksDialog({ cards, open, onOpenChange }: Props) {
  const { state, setCardDecks, renameDeck, deleteCard } = useStudy();
  const [activeTab, setActiveTab] = useState<DialogTab>("existing");
  const [contentReady, setContentReady] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string>>(new Set());
  const [deckCreateOpen, setDeckCreateOpen] = useState(false);
  const [newQuestionBaseCardIds, setNewQuestionBaseCardIds] = useState<Set<string>>(new Set());
  // Inline deck rename state
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [editingDeckName, setEditingDeckName] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Ref so we can read latest state.cards without making it a useEffect dependency.
  // This prevents the dialog from resetting every time a background sync updates state.cards.
  const stateCardsRef = useRef(state.cards);
  stateCardsRef.current = state.cards;

  useEffect(() => {
    if (!open) return;
    setContentReady(false);
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setContentReady(true));
    });

    setActiveTab("existing");
    setSelectedCardIds(new Set(cards.map((c) => c.id)));
    setSelectedDeckIds(new Set());
    // Read via ref — no dependency on state.cards so sync polls won't reset the dialog
    setNewQuestionBaseCardIds(new Set(stateCardsRef.current.map((c) => c.id)));
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [open, cards]); // intentionally omit state.cards — use ref instead

  // Capture baseline when switching to new-questions tab
  useEffect(() => {
    if (!open || activeTab !== "new-questions") return;
    setNewQuestionBaseCardIds(new Set(stateCardsRef.current.map((c) => c.id)));
  }, [open, activeTab]); // fixed: was [open, cards] which was incorrect

  const linkedDeckIdsByCard = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const c of cards) {
      out.set(c.id, new Set<string>());
    }
    for (const link of state.cardDecks ?? []) {
      if (!out.has(link.cardId)) continue;
      out.get(link.cardId)?.add(link.deckId);
    }
    return out;
  }, [cards, state.cardDecks]);

  const selectedCount = selectedCardIds.size;

  const toggleCard = useCallback((cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const toggleDeck = useCallback((deckId: string) => {
    setSelectedDeckIds((prev) => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelectedCardIds(new Set(cards.map((c) => c.id))), [cards]);
  const clearAll = useCallback(() => setSelectedCardIds(new Set()), []);

  const deleteSelectedCards = useCallback(() => {
    const ids = Array.from(selectedCardIds);
    for (const id of ids) deleteCard(id);
    setSelectedCardIds(new Set());
    setDeleteConfirmOpen(false);
    toast({
      title: ids.length === 1 ? "השאלה נמחקה" : "השאלות נמחקו",
      description: `${ids.length} ${ids.length === 1 ? "שאלה הוסרה" : "שאלות הוסרו"} מהמערכת.`,
    });
  }, [deleteCard, selectedCardIds]);

  const startEditDeck = useCallback((deckId: string, currentName: string) => {
    setEditingDeckId(deckId);
    setEditingDeckName(currentName);
  }, []);

  const cancelEditDeck = useCallback(() => {
    setEditingDeckId(null);
    setEditingDeckName("");
  }, []);

  const saveEditDeck = useCallback(() => {
    if (!editingDeckId) return;
    const trimmed = editingDeckName.trim();
    if (!trimmed) {
      toast({ title: "שם ריק", description: "יש להזין שם לערכה." });
      return;
    }
    renameDeck(editingDeckId, trimmed);
    toast({ title: "שם הערכה עודכן", description: `הערכה נקראת כעת "${trimmed}".` });
    setEditingDeckId(null);
    setEditingDeckName("");
  }, [editingDeckId, editingDeckName, renameDeck]);

  const applyClassification = () => {
    if (selectedCardIds.size === 0) {
      toast({
        title: "לא נבחרו שאלות",
        description: "בחר לפחות שאלה אחת לפני הסיווג.",
      });
      return;
    }
    if (selectedDeckIds.size === 0) {
      toast({
        title: "לא נבחרו ערכות",
        description: "בחר לפחות ערכה אחת לסיווג.",
      });
      return;
    }

    const selectedCards = cards.filter((c) => selectedCardIds.has(c.id));
    const deckIdsToAdd = Array.from(selectedDeckIds);

    for (const card of selectedCards) {
      const next = new Set(linkedDeckIdsByCard.get(card.id) ?? []);
      for (const deckId of deckIdsToAdd) next.add(deckId);
      if (card.deckId) next.delete(card.deckId);
      setCardDecks(card.id, Array.from(next));
    }

    toast({
      title: "הסיווג עודכן",
      description: `נוספו ${deckIdsToAdd.length} ערכות ל-${selectedCards.length} שאלות נבחרות.`,
    });
    onOpenChange(false);
  };

  const handleNewQuestionClose = () => {
    const created = state.cards.filter((c) => !newQuestionBaseCardIds.has(c.id));
    if (created.length > 0) {
      setSelectedCardIds((prev) => {
        const next = new Set(prev);
        created.forEach((c) => next.add(c.id));
        return next;
      });
      setActiveTab("existing");
      toast({
        title: "שאלה חדשה נוספה",
        description: "השאלה החדשה סומנה אוטומטית ועברת לטאב שאלות קיימות.",
      });
    }
  };

  const handleDeckCreated = (deckId: string) => {
    setSelectedDeckIds((prev) => {
      const next = new Set(prev);
      next.add(deckId);
      return next;
    });
    setDeckCreateOpen(false);
    setActiveTab("existing");
    toast({
      title: "ערכה חדשה נוצרה",
      description: "הערכה סומנה אוטומטית ועברת לטאב שאלות קיימות.",
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className="max-w-4xl gold-frame"
        dir="rtl"
        showOverlay={false}
        trapFocus={false}
        disableOutsidePointerEvents={false}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-right flex items-center gap-2 justify-end">
            <Layers className="h-5 w-5" /> בחירה מהירה וסיווג
          </DialogTitle>
        </DialogHeader>

        {!contentReady ? (
          <div className="py-8 text-center text-sm text-muted-foreground">טוען...</div>
        ) : (
          <>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DialogTab)}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="existing">שאלות קיימות</TabsTrigger>
            <TabsTrigger value="new-questions">שאלות חדשות</TabsTrigger>
            <TabsTrigger value="edit">עריכה</TabsTrigger>
            <TabsTrigger value="new-deck">הוספת ערכה</TabsTrigger>
            <TabsTrigger value="reviews">חזרות</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                בחר שאלות קיימות לסיווג. נבחרו {selectedCount} מתוך {cards.length}.
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-7" onClick={selectAll}>בחר הכל</Button>
                <Button size="sm" variant="outline" className="h-7" onClick={clearAll}>נקה הכל</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={selectedCount === 0}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> מחק נבחרות
                </Button>
              </div>
            </div>

            <div className="max-h-[34vh] overflow-y-auto space-y-1 pr-1">
              {cards.map((card, i) => {
                const checked = selectedCardIds.has(card.id);
                return (
                  <label
                    key={card.id}
                    className="flex items-start gap-2 p-2 rounded-lg border-2 border-gold/30 hover:bg-secondary cursor-pointer"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleCard(card.id)} />
                    <span className="text-xs text-gold font-bold mt-0.5">{i + 1}.</span>
                    <span className="flex-1 text-sm text-right">{card.question}</span>
                  </label>
                );
              })}
              {cards.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">אין שאלות בעמוד הזה</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground text-right">
                בחר ערכות להוספה עבור השאלות הנבחרות.
              </div>
              <div className="max-h-[24vh] overflow-y-auto space-y-1">
                {state.decks.map((d) => {
                  const checked = selectedDeckIds.has(d.id);
                  const isEditing = editingDeckId === d.id;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 p-2 rounded-lg border-2 border-gold/30 hover:bg-secondary"
                    >
                      {isEditing ? (
                        <>
                          <BookOpen className="h-4 w-4 text-navy shrink-0" />
                          <Input
                            value={editingDeckName}
                            onChange={(e) => setEditingDeckName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveEditDeck(); }
                              else if (e.key === "Escape") { e.preventDefault(); cancelEditDeck(); }
                            }}
                            autoFocus
                            className="h-7 flex-1 text-sm text-right"
                            dir="rtl"
                          />
                          <button
                            type="button"
                            title="שמור"
                            className="shrink-0 p-1 rounded text-emerald-600 hover:bg-secondary"
                            onClick={saveEditDeck}
                          >
                            <CheckIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="ביטול"
                            className="shrink-0 p-1 rounded text-muted-foreground hover:bg-secondary"
                            onClick={cancelEditDeck}
                          >
                            <XIcon className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <label className="flex flex-1 items-center gap-2 cursor-pointer min-w-0">
                            <Checkbox checked={checked} onCheckedChange={() => toggleDeck(d.id)} />
                            <BookOpen className="h-4 w-4 text-navy shrink-0" />
                            <span className="flex-1 text-right text-sm truncate">{d.name}</span>
                          </label>
                          <button
                            type="button"
                            title="ערוך שם ערכה"
                            className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                            onClick={() => startEditDeck(d.id, d.name)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
                {state.decks.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">אין ערכות</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="new-questions" className="mt-3">
            <div className="text-xs text-muted-foreground mb-2 text-right">
              יצירת שאלה חדשה באמצעות המערכת הקיימת. לאחר שמירה, תעבור אוטומטית לטאב שאלות קיימות.
            </div>
            <div className="max-h-[58vh] overflow-y-auto rounded-lg border border-gold/30 p-2">
              <Suspense fallback={<div className="text-sm text-muted-foreground p-4 text-center">טוען עורך שאלות...</div>}>
                <CardEditor deckId={null} onClose={handleNewQuestionClose} />
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value="edit" className="space-y-3">
            <EditQuestionsPane cards={cards.filter((c) => selectedCardIds.has(c.id))} fallback={cards} />
          </TabsContent>

          <TabsContent value="new-deck" className="space-y-3">
            <div className="text-xs text-muted-foreground text-right">
              יצירת ערכה חדשה באמצעות הדיאלוג הקיים. לאחר יצירה, הערכה תסומן אוטומטית.
            </div>
            <div className="rounded-lg border border-gold/30 p-4 bg-secondary/20">
              <Button
                className="bg-gradient-navy text-primary-foreground"
                onClick={() => setDeckCreateOpen(true)}
              >
                פתח יצירת ערכה חדשה
              </Button>
              <div className="text-xs text-muted-foreground mt-2">
                הערכות הקיימות: {state.decks.length}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="space-y-3">
            <div className="text-xs text-muted-foreground text-right">
              טאב זה מחובר לקוד הקיים של תוכניות חזרות, כולל "חזרה על מערכות".
            </div>
            <div className="max-h-[58vh] overflow-y-auto rounded-lg border border-gold/30 p-2">
              <Suspense fallback={<div className="text-sm text-muted-foreground p-4 text-center">טוען תוכניות חזרות...</div>}>
                <StudyPlansCard />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>סגור</Button>
          <Button
            className="bg-gradient-navy text-primary-foreground"
            disabled={activeTab !== "existing"}
            onClick={applyClassification}
          >
            סווג את הנבחרות
          </Button>
        </DialogFooter>
          </>
        )}
      </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>למחוק את השאלות מהמערכת?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCount === 1
                ? "השאלה הנבחרת תימחק מכל הערכות והסיווגים. לא ניתן לבטל פעולה זו."
                : `${selectedCount} השאלות הנבחרות יימחקו מכל הערכות והסיווגים. לא ניתן לבטל פעולה זו.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSelectedCards} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Trash2 className="ml-2 h-4 w-4" /> מחק מהמערכת
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {deckCreateOpen && (
        <Suspense fallback={null}>
          <DeckCreateDialog
            open={deckCreateOpen}
            onOpenChange={setDeckCreateOpen}
            onCreated={handleDeckCreated}
          />
        </Suspense>
      )}
    </>
  );
}

function EditQuestionsPane({ cards, fallback }: { cards: StudyCardType[]; fallback: StudyCardType[] }) {
  const list = cards.length > 0 ? cards : fallback;
  const [activeId, setActiveId] = useState<string | null>(list[0]?.id ?? null);
  useEffect(() => {
    if (!list.find((c) => c.id === activeId)) setActiveId(list[0]?.id ?? null);
  }, [list, activeId]);
  const active = list.find((c) => c.id === activeId) ?? null;

  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">אין שאלות לעריכה</p>;
  }

  return (
    <div className="grid grid-cols-12 gap-2">
      <div className="col-span-4 max-h-[58vh] overflow-y-auto space-y-1 pr-1 border-l border-gold/20 pl-2">
        {list.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveId(c.id)}
            className={`w-full text-right text-xs p-2 rounded-lg border-2 ${
              c.id === activeId ? "border-gold bg-gold/10" : "border-gold/20 hover:bg-secondary"
            }`}
          >
            <span className="text-gold font-bold ml-1">{i + 1}.</span>
            <span className="line-clamp-2">{c.question}</span>
          </button>
        ))}
      </div>
      <div className="col-span-8 max-h-[58vh] overflow-y-auto rounded-lg border border-gold/30 p-2">
        {active ? (
          <Suspense fallback={<div className="text-sm text-muted-foreground p-4 text-center">טוען עורך...</div>}>
            <CardQuickEditor key={active.id} card={active} />
          </Suspense>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">בחר שאלה לעריכה</p>
        )}
      </div>
    </div>
  );
}
