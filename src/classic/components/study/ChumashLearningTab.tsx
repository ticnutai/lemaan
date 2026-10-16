import { TORAH_VERSES } from "@/lib/study/torahVerses";
import { useScrollToSelectedQuestions } from "@/hooks/useScrollToSelectedQuestions";
import { PanelsTopLeft } from "lucide-react";
import { LearningStepNavigator } from "./LearningStepNavigator";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, ListChecks, GraduationCap, ArrowRightLeft, Maximize2, Minimize2, PanelRightOpen, X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStudy } from "@/lib/study/store";
import { CHUMASH_CHAPTERS, CHUMASH_EN, chumashSefariaUrl } from "@/lib/study/sefariaExt";
import { filterCardsByCategoryChain } from "@/lib/study/categoryCards";
import { SefariaTextViewer } from "./SefariaTextViewer";
import { StudySession } from "./StudySession";
import { ProgressShortcut } from "./ProgressShortcut";
import { QuestionTypographyControl, useQuestionTypographyPreferences } from "./QuestionTypographyControl";
import { CardDecksDialog } from "./CardDecksDialog";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import type { Card as StudyCardType } from "@/lib/study/types";

const STORAGE_KEY = "chumash-learning-state";
const SFARIM = ["בראשית", "שמות", "ויקרא", "במדבר", "דברים"] as const;

type LayoutMode = "stacked" | "split" | "text-only" | "cards-only";
type PracticeMode = "inline" | "fullscreen";

interface SavedState {
  sefer?: string;
  perek?: number;
  verse?: number;
  layout?: LayoutMode;
  splitRatio?: number;
  splitReversed?: boolean;
}
function loadSaved(): SavedState {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveSt(s: SavedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
function toGematria(n: number): string {
  if (n <= 0) return "";
  let s = "";
  if (n >= 100) { s += "ק"; n -= 100; }
  if (n === 15) return s + "טו";
  if (n === 16) return s + "טז";
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (t > 0) s += TENS[t];
  if (o > 0) s += ONES[o];
  return s;
}

export function ChumashLearningTab() {
  const { state } = useStudy();
  const questionTypography = useQuestionTypographyPreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const saved = useMemo(() => loadSaved(), []);

  const [sefer, setSefer] = useState<string>(saved.sefer ?? "בראשית");
  const [perek, setPerek] = useState<number>(saved.perek ?? 1);
  const [verse, setVerse] = useState(saved.verse ?? 0);
  const [studyOpen, setStudyOpen] = useState(false);
  const [selectionConfirmed, setSelectionConfirmed] = useState(false);
  const selectedQuestionsRef = useScrollToSelectedQuestions(selectionConfirmed, `${sefer}:${perek}:${verse}`);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(saved.layout ?? "stacked");
  const [splitRatio, setSplitRatioState] = useState<number>(Math.max(20, Math.min(80, saved.splitRatio ?? 60)));
  const [splitReversed, setSplitReversed] = useState<boolean>(!!saved.splitReversed);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("inline");
  const [deckDialogCard, setDeckDialogCard] = useState<StudyCardType | null>(null);
  const isStandaloneSplitPage = location.pathname === "/split-view";

  const handleSplitPageToggle = () => {
    if (isStandaloneSplitPage) {
      navigate("/");
      return;
    }
    navigate("/split-view");
  };

  useEffect(() => {
    saveSt({
      sefer,
      perek,
      verse,
      layout: layoutMode,
      splitRatio,
      splitReversed,
    });
  }, [sefer, perek, verse, layoutMode, splitRatio, splitReversed]);

  const verseCount = TORAH_VERSES.find(book => book.name === sefer)?.chapters[perek - 1] ?? 0;
  const totalChapters = CHUMASH_CHAPTERS[sefer] ?? 1;

  useEffect(() => { if (perek > totalChapters) setPerek(1); }, [sefer, totalChapters, perek]);

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

  const cards = useMemo(() => filterCardsByCategoryChain(
    state.cards,
    state.categories,
    [sefer, `פרק ${toGematria(perek)}`, ...(verse ? [`פסוק ${toGematria(verse)}`] : [])],
  ), [state.cards, state.categories, sefer, perek, verse]);
  const cardIds = useMemo(() => cards.map((c) => c.id), [cards]);
  const closePractice = () => {
    setStudyOpen(false);
    setLayoutMode("stacked");
  };

  const externalUrl = chumashSefariaUrl(sefer, perek);
  const en = CHUMASH_EN[sefer];
  const sefariaRef = en ? `${en}.${perek}` : "";

  const renderTextPanel = () => (
    <div className="min-h-0">
      {en ? (
        <SefariaTextViewer
          sefariaRef={verse ? `${sefariaRef}.${verse}` : sefariaRef}
          externalUrl={externalUrl}
          title={`${sefer} · פרק ${toGematria(perek)}`}
          className="h-full"
          breadcrumbItems={["חומש", sefer, `פרק ${toGematria(perek)}`]}
          lineLabel="פסוק"
          lineStartIndex={verse || 1}
        />
      ) : (
        <Card className="gold-frame p-6 h-full flex items-center justify-center text-muted-foreground text-sm">
          ספר לא נתמך
        </Card>
      )}
    </div>
  );

  const renderCardsPanel = () => (
    <div className="min-h-0">
      <Card className="gold-frame p-4 flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1">
            <ListChecks className="h-4 w-4 text-gold" /> שאלות {verse ? `לפסוק ${toGematria(verse)}` : "לפרק זה"} ({cards.length})
          </h3>
          {cards.length > 0 && (
            <div className="flex items-center gap-1">
              <QuestionTypographyControl preferences={questionTypography} />
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 border-gold/50"
                title={practiceMode === "inline" ? "תרגול בתוך המסגרת" : "תרגול במסך מלא"}
                onClick={() => setPracticeMode((prev) => (prev === "inline" ? "fullscreen" : "inline"))}
              >
                {practiceMode === "inline" ? <PanelRightOpen className="h-4 w-4 text-gold" /> : <Maximize2 className="h-4 w-4 text-gold" />}
              </Button>
              <Button onClick={() => setStudyOpen(true)} size="sm" className="bg-gradient-navy text-primary-foreground">
                <GraduationCap className="h-4 w-4" /> תרגול
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {cards.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              אין שאלות משויכות.<br />
              <span className="text-xs">שייך שאלות לקטגוריית "{sefer} › פרק {toGematria(perek)}".</span>
            </div>
          ) : (
            cards.map((c, i) => (
              <div key={c.id} className="rounded-lg border border-gold/30 bg-card p-3 hover:border-gold/60 transition-colors" style={questionTypography.questionCardStyle}>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gold font-bold shrink-0 mt-0.5">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground" style={questionTypography.questionTextStyle}>{c.question}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    title="הוסף לערכות"
                    onClick={() => setDeckDialogCard(c)}
                  >
                    <Layers className="h-4 w-4 text-gold" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );

  const renderPracticePanel = () => (
    <div className="min-h-0">
      <Card className="gold-frame p-3 flex flex-col h-full" dir="rtl">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-sm font-semibold flex items-center gap-1">
            <GraduationCap className="h-4 w-4 text-gold" /> תרגול · {cards.length} שאלות
          </h3>
          <Button size="sm" variant="ghost" onClick={closePractice} className="h-7 gap-1">
            <X className="h-4 w-4" /> סגור תרגול
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <StudySession
            key={cardIds.join(",")}
            deckId={null}
            mode="practice"
            cardIds={cardIds}
            onExit={closePractice}
            fillHeight
          />
        </div>
      </Card>
    </div>
  );

  const cardsContent = studyOpen && practiceMode === "inline" ? renderPracticePanel() : renderCardsPanel();

  if (studyOpen && practiceMode === "fullscreen" && cardIds.length > 0) {
    return <StudySession deckId={null} mode="practice" cardIds={cardIds} onExit={closePractice} />;
  }

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="gold-frame relative p-3 space-y-3">
        <div className="absolute right-3 top-3 z-10"><ProgressShortcut cardIds={cardIds} label={`${sefer}, פרק ${toGematria(perek)}`} /></div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LearningStepNavigator confirmed={selectionConfirmed} onConfirmedChange={setSelectionConfirmed} steps={[
            { title: "בחר ספר", backLabel: "ספרים", options: SFARIM.map(s => ({ value: s, label: s })), onSelect: v => { setSefer(v); setPerek(1); } },
            { title: "בחר פרק", backLabel: "פרקים", options: Array.from({ length: totalChapters }, (_, i) => ({ value: String(i + 1), label: "פרק " + toGematria(i + 1) })), onSelect: v => { setPerek(Number(v)); setVerse(0); } },
            { title: "בחר פסוק", backLabel: "פסוקים", options: [{ value: "0", label: "כל הפרק" }, ...Array.from({ length: verseCount }, (_, i) => ({ value: String(i + 1), label: "פסוק " + toGematria(i + 1) }))], onSelect: v => setVerse(Number(v)) },
          ]} />

          <Select value={layoutMode} onValueChange={(v) => setLayoutMode(v as LayoutMode)}>
            <SelectTrigger aria-label="פריסת שאלות וטקסט" title="פריסת שאלות וטקסט" className="absolute left-3 top-3 z-10 h-11 w-12 shrink-0 rounded-full border-gold/50 bg-gold/5 text-gold shadow-sm hover:bg-gold/10">
              <PanelsTopLeft className="h-5 w-5 shrink-0" aria-hidden="true" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stacked">שאלות ואחריהן הטקסט</SelectItem>
              <SelectItem value="split">טקסט + שאלות</SelectItem>
              <SelectItem value="text-only">טקסט בלבד</SelectItem>
              <SelectItem value="cards-only">שאלות בלבד</SelectItem>
            </SelectContent>
          </Select>

          {layoutMode === "split" && (
            <div className="col-span-2 lg:col-span-1 rounded-md border border-gold/20 px-3 py-2">
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  className="h-6 w-6 rounded-sm border border-gold/40 text-navy hover:bg-gold/10 transition-colors"
                  title={isStandaloneSplitPage ? "חזור למסך הראשי" : "פתח בעמוד נפרד"}
                  onClick={handleSplitPageToggle}
                >
                  {isStandaloneSplitPage ? <Minimize2 className="h-3.5 w-3.5 mx-auto" /> : <Maximize2 className="h-3.5 w-3.5 mx-auto" />}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={selectionConfirmed ? "flex items-center justify-between gap-2" : "hidden"}>
          <Button onClick={() => { setPerek(Math.max(1, perek - 1)); setVerse(0); }} disabled={perek === 1} variant="outline" size="sm" className="gap-1">
            <ChevronRight className="h-4 w-4" /> הקודם
          </Button>
          <div className="text-sm text-muted-foreground">
            {sefer} · פרק {toGematria(perek)} · <span className="text-gold font-semibold">{cards.length} שאלות</span>
          </div>
          <Button onClick={() => { setPerek(Math.min(totalChapters, perek + 1)); setVerse(0); }} disabled={perek === totalChapters} variant="outline" size="sm" className="gap-1">
            הבא <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <div ref={selectedQuestionsRef} hidden={!selectionConfirmed} style={layoutMode === "stacked" ? undefined : { height: "calc(100vh - 320px)", minHeight: 500 }}>
        {layoutMode === "split" && (
          <>
            <div className="grid grid-cols-1 gap-4 lg:hidden h-full">
              {cardsContent}
              {renderTextPanel()}
            </div>

            <div
              ref={splitContainerRef}
              className={cn(
                "hidden lg:flex h-full min-h-0 relative",
                splitReversed ? "flex-row" : "flex-row-reverse",
              )}
            >
              <div className="h-full min-h-0" style={{ width: `${splitRatio}%` }}>
                {renderTextPanel()}
              </div>

              <div className="relative mx-1 w-2 shrink-0 group/divider">
                <button
                  type="button"
                  className="absolute top-2 left-1/2 z-10 -translate-x-1/2 h-7 w-7 rounded-full border border-gold/40 bg-card/90 text-navy shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover/divider:opacity-100 hover:opacity-100 hover:bg-gold/10"
                  title="החלף צדדים"
                  onClick={() => setSplitReversed((prev) => !prev)}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 mx-auto" />
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
                {cardsContent}
              </div>
            </div>
          </>
        )}

        {layoutMode === "stacked" && <div className="flex flex-col gap-4 min-w-0" data-testid="questions-before-text">
          <section aria-label="שאלות">{cardsContent}</section>
          <section aria-label="טקסט הלימוד">{renderTextPanel()}</section>
        </div>}

        {layoutMode === "text-only" && (
          <div className="grid grid-cols-1 h-full">
            {renderTextPanel()}
          </div>
        )}

        {layoutMode === "cards-only" && (
          <div className="grid grid-cols-1 h-full">
            {cardsContent}
          </div>
        )}
      </div>

      <CardDecksDialog
        card={deckDialogCard}
        open={!!deckDialogCard}
        onOpenChange={(open) => {
          if (!open) setDeckDialogCard(null);
        }}
      />
    </div>
  );
}
