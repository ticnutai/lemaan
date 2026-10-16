import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, ChevronRight, Search } from "lucide-react";
import { SHAS_BAVLI, SEDARIM } from "@/lib/study/shasData";
import { toHebrewNum, amudLetter } from "@/lib/study/shasFormat";
import { cn } from "@/lib/utils";

// ─── Subject metadata ─────────────────────────────────────────────────────────
export type SubjectMeta =
  | { type: "shas"; masechta: string; daf: number; amud: 1 | 2 }
  | { type: "mishna"; masechta: string; perek: number }
  | { type: "torah"; book: string; parasha: string }
  | { type: "free" };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (subject: string, meta: SubjectMeta) => void;
  /** Masechtos in the user's current Shas plan — highlighted prominently */
  planMasechtos?: string[];
}

// ─── Mishna tractates ─────────────────────────────────────────────────────────
const MISHNA_TRACTATES = [
  { name: "ברכות", seder: "זרעים", perakim: 9 },
  { name: "פאה", seder: "זרעים", perakim: 8 },
  { name: "דמאי", seder: "זרעים", perakim: 7 },
  { name: "כלאים", seder: "זרעים", perakim: 9 },
  { name: "שביעית", seder: "זרעים", perakim: 10 },
  { name: "תרומות", seder: "זרעים", perakim: 11 },
  { name: "מעשרות", seder: "זרעים", perakim: 5 },
  { name: "מעשר שני", seder: "זרעים", perakim: 5 },
  { name: "חלה", seder: "זרעים", perakim: 4 },
  { name: "ערלה", seder: "זרעים", perakim: 3 },
  { name: "ביכורים", seder: "זרעים", perakim: 4 },
  { name: "שבת", seder: "מועד", perakim: 24 },
  { name: "עירובין", seder: "מועד", perakim: 10 },
  { name: "פסחים", seder: "מועד", perakim: 10 },
  { name: "שקלים", seder: "מועד", perakim: 8 },
  { name: "יומא", seder: "מועד", perakim: 8 },
  { name: "סוכה", seder: "מועד", perakim: 5 },
  { name: "ביצה", seder: "מועד", perakim: 5 },
  { name: "ראש השנה", seder: "מועד", perakim: 4 },
  { name: "תענית", seder: "מועד", perakim: 4 },
  { name: "מגילה", seder: "מועד", perakim: 4 },
  { name: "מועד קטן", seder: "מועד", perakim: 3 },
  { name: "חגיגה", seder: "מועד", perakim: 3 },
  { name: "יבמות", seder: "נשים", perakim: 16 },
  { name: "כתובות", seder: "נשים", perakim: 13 },
  { name: "נדרים", seder: "נשים", perakim: 11 },
  { name: "נזיר", seder: "נשים", perakim: 9 },
  { name: "סוטה", seder: "נשים", perakim: 9 },
  { name: "גיטין", seder: "נשים", perakim: 9 },
  { name: "קידושין", seder: "נשים", perakim: 4 },
  { name: "בבא קמא", seder: "נזיקין", perakim: 10 },
  { name: "בבא מציעא", seder: "נזיקין", perakim: 10 },
  { name: "בבא בתרא", seder: "נזיקין", perakim: 10 },
  { name: "סנהדרין", seder: "נזיקין", perakim: 11 },
  { name: "מכות", seder: "נזיקין", perakim: 3 },
  { name: "שבועות", seder: "נזיקין", perakim: 8 },
  { name: "עדיות", seder: "נזיקין", perakim: 8 },
  { name: "עבודה זרה", seder: "נזיקין", perakim: 5 },
  { name: "אבות", seder: "נזיקין", perakim: 6 },
  { name: "הוריות", seder: "נזיקין", perakim: 3 },
  { name: "זבחים", seder: "קדשים", perakim: 14 },
  { name: "מנחות", seder: "קדשים", perakim: 13 },
  { name: "חולין", seder: "קדשים", perakim: 12 },
  { name: "בכורות", seder: "קדשים", perakim: 9 },
  { name: "ערכין", seder: "קדשים", perakim: 9 },
  { name: "תמורה", seder: "קדשים", perakim: 7 },
  { name: "כריתות", seder: "קדשים", perakim: 6 },
  { name: "מעילה", seder: "קדשים", perakim: 6 },
  { name: "תמיד", seder: "קדשים", perakim: 7 },
  { name: "מדות", seder: "קדשים", perakim: 5 },
  { name: "קינים", seder: "קדשים", perakim: 3 },
  { name: "כלים", seder: "טהרות", perakim: 30 },
  { name: "אהלות", seder: "טהרות", perakim: 18 },
  { name: "נגעים", seder: "טהרות", perakim: 14 },
  { name: "פרה", seder: "טהרות", perakim: 12 },
  { name: "טהרות", seder: "טהרות", perakim: 10 },
  { name: "מקוואות", seder: "טהרות", perakim: 10 },
  { name: "נדה", seder: "טהרות", perakim: 10 },
  { name: "מכשירין", seder: "טהרות", perakim: 6 },
  { name: "זבים", seder: "טהרות", perakim: 5 },
  { name: "טבול יום", seder: "טהרות", perakim: 4 },
  { name: "ידים", seder: "טהרות", perakim: 4 },
  { name: "עוקצין", seder: "טהרות", perakim: 3 },
];

// ─── Torah parashiyot ─────────────────────────────────────────────────────────
const TORAH_DATA = [
  { book: "בראשית", parashiyot: ["בראשית", "נח", "לך לך", "וירא", "חיי שרה", "תולדות", "ויצא", "וישלח", "וישב", "מקץ", "ויגש", "ויחי"] },
  { book: "שמות", parashiyot: ["שמות", "וארא", "בא", "בשלח", "יתרו", "משפטים", "תרומה", "תצוה", "כי תשא", "ויקהל", "פקודי"] },
  { book: "ויקרא", parashiyot: ["ויקרא", "צו", "שמיני", "תזריע", "מצורע", "אחרי מות", "קדושים", "אמור", "בהר", "בחוקותי"] },
  { book: "במדבר", parashiyot: ["במדבר", "נשא", "בהעלותך", "שלח", "קורח", "חקת", "בלק", "פינחס", "מטות", "מסעי"] },
  { book: "דברים", parashiyot: ["דברים", "ואתחנן", "עקב", "ראה", "שופטים", "כי תצא", "כי תבוא", "נצבים", "וילך", "האזינו", "וזאת הברכה"] },
];

// ─── Free-text suggestions ────────────────────────────────────────────────────
const FREE_SUGGESTIONS = [
  "הלכות שבת", "הלכות תפילה", "הלכות כשרות", "הלכות מועדים",
  "הלכות ברכות", "נ\"ך", "תהלים", "פרקי אבות", "חסידות",
];

type Category = "shas" | "mishna" | "torah" | "free";
type Step = "main" | "step2";

export function SubjectPickerDialog({ open, onOpenChange, onSelect, planMasechtos = [] }: Props) {
  const [category, setCategory] = useState<Category>("shas");
  const [step, setStep] = useState<Step>("main");

  // Shas state
  const [shasSelectedMasechta, setShasSelectedMasechta] = useState<string | null>(null);
  const [shasSelectedDaf, setShasSelectedDaf] = useState<number | null>(null);
  const [shasSelectedAmud, setShasSelectedAmud] = useState<1 | 2>(1);

  // Mishna state
  const [mishnaSelectedMasechta, setMishnaSelectedMasechta] = useState<string | null>(null);
  const [mishnaSelectedPerek, setMishnaSelectedPerek] = useState<number | null>(null);

  // Torah state
  const [torahSelectedBook, setTorahSelectedBook] = useState<string | null>(null);
  const [torahSelectedParasha, setTorahSelectedParasha] = useState<string | null>(null);

  // Free text
  const [freeText, setFreeText] = useState("");

  // Shared search
  const [search, setSearch] = useState("");

  const reset = () => {
    setCategory("shas");
    setStep("main");
    setShasSelectedMasechta(null);
    setShasSelectedDaf(null);
    setShasSelectedAmud(1);
    setMishnaSelectedMasechta(null);
    setMishnaSelectedPerek(null);
    setTorahSelectedBook(null);
    setTorahSelectedParasha(null);
    setFreeText("");
    setSearch("");
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleCategoryChange = (c: Category) => {
    setCategory(c);
    setStep("main");
    setSearch("");
  };

  // ─── Shas Bavli ────────────────────────────────────────────────────────────
  const planSet = useMemo(() => new Set(planMasechtos), [planMasechtos]);

  const filteredShas = useMemo(() => {
    const q = search.trim();
    if (!q) return SHAS_BAVLI;
    return SHAS_BAVLI.filter((m) => m.name.includes(q));
  }, [search]);

  const shasGrouped = useMemo(() => {
    return SEDARIM.map((seder) => {
      const all = filteredShas.filter((m) => m.seder === seder);
      const inPlan = all.filter((m) => planSet.has(m.name));
      const notInPlan = all.filter((m) => !planSet.has(m.name));
      return { seder, items: [...inPlan, ...notInPlan] };
    }).filter((g) => g.items.length > 0);
  }, [filteredShas, planSet]);

  const shasData = useMemo(
    () => SHAS_BAVLI.find((m) => m.name === shasSelectedMasechta),
    [shasSelectedMasechta],
  );

  const handleSelectShasMasechta = (name: string) => {
    setShasSelectedMasechta(name);
    setShasSelectedDaf(null);
    setShasSelectedAmud(1);
    setStep("step2");
    setSearch("");
  };

  const handleConfirmShas = () => {
    if (!shasSelectedMasechta || !shasSelectedDaf) return;
    const subject = `${shasSelectedMasechta} דף ${toHebrewNum(shasSelectedDaf)}' עמוד ${amudLetter(shasSelectedAmud)}`;
    onSelect(subject, { type: "shas", masechta: shasSelectedMasechta, daf: shasSelectedDaf, amud: shasSelectedAmud });
    handleClose(false);
  };

  // ─── Mishna ────────────────────────────────────────────────────────────────
  const filteredMishna = useMemo(() => {
    const q = search.trim();
    if (!q) return MISHNA_TRACTATES;
    return MISHNA_TRACTATES.filter((m) => m.name.includes(q));
  }, [search]);

  const mishnaGrouped = useMemo(() => {
    return SEDARIM.map((seder) => {
      const items = filteredMishna.filter((m) => m.seder === seder);
      return { seder, items };
    }).filter((g) => g.items.length > 0);
  }, [filteredMishna]);

  const mishnaData = useMemo(
    () => MISHNA_TRACTATES.find((m) => m.name === mishnaSelectedMasechta),
    [mishnaSelectedMasechta],
  );

  const handleSelectMishnaMasechta = (name: string) => {
    setMishnaSelectedMasechta(name);
    setMishnaSelectedPerek(null);
    setStep("step2");
    setSearch("");
  };

  const handleConfirmMishna = () => {
    if (!mishnaSelectedMasechta || !mishnaSelectedPerek) return;
    const subject = `משנה ${mishnaSelectedMasechta} פרק ${toHebrewNum(mishnaSelectedPerek)}'`;
    onSelect(subject, { type: "mishna", masechta: mishnaSelectedMasechta, perek: mishnaSelectedPerek });
    handleClose(false);
  };

  // ─── Torah ─────────────────────────────────────────────────────────────────
  const handleConfirmTorah = () => {
    if (!torahSelectedBook || !torahSelectedParasha) return;
    const subject = `פרשת ${torahSelectedParasha}`;
    onSelect(subject, { type: "torah", book: torahSelectedBook, parasha: torahSelectedParasha });
    handleClose(false);
  };

  // ─── Free text ─────────────────────────────────────────────────────────────
  const handleConfirmFree = () => {
    if (!freeText.trim()) return;
    onSelect(freeText.trim(), { type: "free" });
    handleClose(false);
  };

  // ─── Dialog title ──────────────────────────────────────────────────────────
  const title =
    step === "step2"
      ? category === "shas"
        ? `${shasSelectedMasechta} — בחר דף`
        : category === "mishna"
          ? `משנה ${mishnaSelectedMasechta} — בחר פרק`
          : category === "torah"
            ? `${torahSelectedBook} — בחר פרשה`
            : "בחר נושא"
      : "בחר נושא ללימוד";

  const canGoBack = step === "step2";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto gold-frame" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-right flex items-center gap-2">
            {canGoBack && (
              <button
                onClick={() => {
                  setStep("main");
                  setTorahSelectedBook(null);
                  setTorahSelectedParasha(null);
                  setSearch("");
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            <BookOpen className="h-4 w-4 text-gold" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Category tabs — always shown on step "main" */}
        {step === "main" && (
          <div className="flex gap-1.5 justify-end flex-wrap">
            {(
              [
                { id: "shas" as Category, label: 'ש"ס בבלי' },
                { id: "mishna" as Category, label: "משנה" },
                { id: "torah" as Category, label: "תורה" },
                { id: "free" as Category, label: "כללי" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleCategoryChange(id)}
                className={cn(
                  "px-3 py-1 rounded-full border-2 text-xs font-semibold transition-colors",
                  category === id
                    ? "border-gold bg-gold/20 text-gold"
                    : "border-gold/30 text-muted-foreground hover:border-gold/60",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ─── Shas Bavli: masechta picker ─── */}
        {category === "shas" && step === "main" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute right-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חפש מסכת..."
                className="pr-8 text-right border-2 border-gold/40"
                autoFocus
              />
            </div>

            {planMasechtos.length > 0 && !search && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-gold">התוכנית שלך</p>
                <div className="flex flex-wrap gap-1.5">
                  {planMasechtos.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleSelectShasMasechta(name)}
                      className="px-2.5 py-1 rounded-lg border-2 border-gold bg-gold/10 text-sm font-semibold text-navy dark:text-gold hover:bg-gold/20 transition-colors"
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="border-t border-gold/20 my-2" />
              </div>
            )}

            <div className="space-y-3">
              {shasGrouped.map(({ seder, items }) => (
                <div key={seder}>
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1 text-right">
                    סדר {seder}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {items.map((m) => (
                      <button
                        key={m.name}
                        onClick={() => handleSelectShasMasechta(m.name)}
                        className={cn(
                          "px-2 py-1 rounded-lg border text-xs font-medium transition-colors",
                          planSet.has(m.name)
                            ? "border-gold/60 bg-gold/5 text-foreground hover:bg-gold/15"
                            : "border-gold/25 text-muted-foreground hover:border-gold/50 hover:text-foreground",
                        )}
                      >
                        {m.name}
                        {planSet.has(m.name) && <span className="mr-1 text-[9px] text-gold">★</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Shas Bavli: daf picker ─── */}
        {category === "shas" && step === "step2" && shasSelectedMasechta && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {([1, 2] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setShasSelectedAmud(a)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg border-2 text-sm font-semibold transition-colors",
                    shasSelectedAmud === a
                      ? "border-gold bg-gold/20 text-gold"
                      : "border-gold/30 text-muted-foreground hover:border-gold/60",
                  )}
                >
                  עמוד {amudLetter(a)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-8 gap-1 max-h-[360px] overflow-y-auto">
              {Array.from({ length: (shasData?.pages ?? 0) - 1 }, (_, i) => i + 2).map((daf) => (
                <button
                  key={daf}
                  onClick={() => setShasSelectedDaf(daf)}
                  className={cn(
                    "rounded-lg border text-xs py-1.5 font-medium transition-colors",
                    shasSelectedDaf === daf
                      ? "border-gold bg-gradient-navy text-primary-foreground font-bold"
                      : "border-gold/25 hover:border-gold/60 hover:bg-gold/10",
                  )}
                >
                  {toHebrewNum(daf)}'
                </button>
              ))}
            </div>
            {shasSelectedDaf && (
              <div className="flex flex-row-reverse items-center justify-between border-t border-gold/20 pt-3">
                <Button onClick={handleConfirmShas} className="bg-gradient-navy text-primary-foreground rounded-xl">
                  בחר
                </Button>
                <p className="text-sm font-semibold text-right">
                  {shasSelectedMasechta} דף {toHebrewNum(shasSelectedDaf)}' עמוד {amudLetter(shasSelectedAmud)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── Mishna: masechta picker ─── */}
        {category === "mishna" && step === "main" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute right-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חפש מסכת..."
                className="pr-8 text-right border-2 border-gold/40"
                autoFocus
              />
            </div>
            <div className="space-y-3">
              {mishnaGrouped.map(({ seder, items }) => (
                <div key={seder}>
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1 text-right">
                    סדר {seder}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {items.map((m) => (
                      <button
                        key={m.name}
                        onClick={() => handleSelectMishnaMasechta(m.name)}
                        className="px-2 py-1 rounded-lg border border-gold/25 text-xs font-medium text-muted-foreground hover:border-gold/50 hover:text-foreground transition-colors"
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Mishna: perek picker ─── */}
        {category === "mishna" && step === "step2" && mishnaSelectedMasechta && (
          <div className="space-y-4">
            <div className="grid grid-cols-8 gap-1 max-h-[400px] overflow-y-auto">
              {Array.from({ length: mishnaData?.perakim ?? 0 }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setMishnaSelectedPerek(p)}
                  className={cn(
                    "rounded-lg border text-xs py-1.5 font-medium transition-colors",
                    mishnaSelectedPerek === p
                      ? "border-gold bg-gradient-navy text-primary-foreground font-bold"
                      : "border-gold/25 hover:border-gold/60 hover:bg-gold/10",
                  )}
                >
                  {toHebrewNum(p)}'
                </button>
              ))}
            </div>
            {mishnaSelectedPerek && (
              <div className="flex flex-row-reverse items-center justify-between border-t border-gold/20 pt-3">
                <Button onClick={handleConfirmMishna} className="bg-gradient-navy text-primary-foreground rounded-xl">
                  בחר
                </Button>
                <p className="text-sm font-semibold text-right">
                  משנה {mishnaSelectedMasechta} פרק {toHebrewNum(mishnaSelectedPerek)}'
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── Torah: book picker ─── */}
        {category === "torah" && step === "main" && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {TORAH_DATA.map(({ book }) => (
              <button
                key={book}
                onClick={() => { setTorahSelectedBook(book); setTorahSelectedParasha(null); setStep("step2"); }}
                className="rounded-xl border-2 border-gold/40 p-3 text-sm font-semibold text-center hover:border-gold hover:bg-gold/10 transition-colors"
              >
                {book}
              </button>
            ))}
          </div>
        )}

        {/* ─── Torah: parasha picker ─── */}
        {category === "torah" && step === "step2" && torahSelectedBook && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {TORAH_DATA.find((b) => b.book === torahSelectedBook)?.parashiyot.map((p) => (
                <button
                  key={p}
                  onClick={() => setTorahSelectedParasha(p)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-colors",
                    torahSelectedParasha === p
                      ? "border-gold bg-gradient-navy text-primary-foreground"
                      : "border-gold/30 hover:border-gold/60 hover:bg-gold/10",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            {torahSelectedParasha && (
              <div className="flex flex-row-reverse items-center justify-between border-t border-gold/20 pt-3">
                <Button onClick={handleConfirmTorah} className="bg-gradient-navy text-primary-foreground rounded-xl">
                  בחר
                </Button>
                <p className="text-sm font-semibold text-right">פרשת {torahSelectedParasha}</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Free text ─── */}
        {category === "free" && step === "main" && (
          <div className="space-y-3">
            <Input
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="הלכות / גמרא / שיעור / ..."
              className="border-2 border-gold/40 text-right"
              dir="rtl"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirmFree(); }}
            />
            {!freeText && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground text-right">הצעות נושאים:</p>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {FREE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setFreeText(s)}
                      className="px-2.5 py-1 rounded-lg border border-gold/30 text-xs text-muted-foreground hover:border-gold/60 hover:text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {freeText && (
              <div className="flex flex-row-reverse items-center justify-between border-t border-gold/20 pt-3">
                <Button onClick={handleConfirmFree} className="bg-gradient-navy text-primary-foreground rounded-xl">
                  בחר
                </Button>
                <p className="text-sm font-semibold text-right">{freeText}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
