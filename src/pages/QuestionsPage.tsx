import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Fuse from "fuse.js";
import {
  ArrowDown, ArrowUp, BookOpen, Check, ChevronLeft, ChevronRight, FileSpreadsheet, FileText,
  HelpCircle, Pencil, Plus, Save, Scroll, Search, Trash2, X,
} from "lucide-react";
import PageBanner from "../components/PageBanner";
import { exportQuestionsDocx, exportQuestionsXlsx } from "../lib/export";
import { db } from "../db";
import { defaultSrs } from "../features/study/srs";
import { buildChildrenMap, collectDescendantIds, selectableCategories } from "../features/study/categoryTree";
import { AMUD_LABELS, SEDARIM, hebrewDaf } from "../features/study/shas";
import { uid, formatDate } from "../lib/utils";
import type { Card, CardType } from "../features/study/types";

const PAGE_SIZE = 30;

const CORPUS_TABS = [
  { name: 'ש"ס', icon: BookOpen },
  { name: "משנה", icon: Scroll },
  { name: "חומש", icon: Scroll },
  { name: 'תנ"ך', icon: BookOpen },
];

/** סוגי השאלה כמו במקור. */
const QUESTION_TYPES: { key: CardType; label: string }[] = [
  { key: "multiple", label: "אמריקאי" },
  { key: "boolean", label: "נכון/לא נכון" },
  { key: "flashcard", label: "כרטיסיה" },
];

interface FormState {
  type: CardType;
  question: string;
  answer: string;
  options: string[];
  correctIndex: number | null;
  boolCorrect: boolean | null;
  tags: string;
}

const emptyForm = (): FormState => ({
  type: "multiple",
  question: "",
  answer: "",
  options: ["", "", "", ""],
  correctIndex: null,
  boolCorrect: null,
  tags: "",
});

export default function QuestionsPage() {
  // ---- דרילדאון סיווג (כמו במקור: הטופס נפתח רק אחרי בחירת עמוד) ----
  const [corpus, setCorpus] = useState('ש"ס');
  const [seder, setSeder] = useState<string | null>(null);
  const [masechta, setMasechta] = useState<string | null>(null);
  const [daf, setDaf] = useState<number | null>(null);
  const [amud, setAmud] = useState<"1" | "2" | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [savedFlash, setSavedFlash] = useState(false);

  // ---- רשימה/חיפוש (קיים) ----
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<{ id: string; question: string; answer: string; categoryId: string } | null>(null);

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const options = useMemo(() => (categories ? selectableCategories(categories) : []), [categories]);
  const cards = useLiveQuery(async () => {
    if (categoryFilter && categories) {
      const ids = collectDescendantIds(categoryFilter, buildChildrenMap(categories));
      return db.cards.where("categoryId").anyOf([...ids]).toArray();
    }
    return db.cards.toArray();
  }, [categoryFilter, categories]);

  const fuse = useMemo(
    () => (cards ? new Fuse(cards, { keys: ["question", "answer", "masechta"], threshold: 0.35, ignoreLocation: true }) : null),
    [cards]
  );
  const filtered = useMemo(() => {
    if (!cards) return [];
    if (!search.trim() || !fuse) return cards;
    return fuse.search(search.trim()).map((r) => r.item);
  }, [cards, search, fuse]);
  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE);
  const exportTitle = categoryFilter
    ? `שאלות-${options.find((c) => c.id === categoryFilter)?.name ?? ""}`
    : "שאלות-למען";

  /** איתור קטגוריה לפי המסכת+דף שנבחרו (אם קיימת בעץ). */
  const resolveCategoryId = (): string | null => {
    if (!categories || !masechta) return null;
    if (daf !== null) {
      const byDaf = categories.find((c) => c.name === `${masechta} · ${hebrewDaf(daf)}.`);
      if (byDaf) return byDaf.id;
    }
    return categories.find((c) => c.name === masechta)?.id ?? null;
  };

  const classificationDone = masechta !== null && daf !== null && amud !== null;

  const formValid =
    form.question.trim() &&
    (form.type === "flashcard"
      ? form.answer.trim()
      : form.type === "boolean"
        ? form.boolCorrect !== null
        : form.options.filter((o) => o.trim()).length >= 2 && form.correctIndex !== null && form.options[form.correctIndex]?.trim());

  const saveNew = async (thenAnother: boolean) => {
    if (!classificationDone || !formValid || !masechta || daf === null) return;
    const now = Date.now();
    const opts = form.type === "multiple" ? form.options.filter((o) => o.trim()) : [];
    // אינדקס התשובה הנכונה אחרי סינון ריקות
    let correctIdx: number[] = [];
    if (form.type === "multiple" && form.correctIndex !== null) {
      const target = form.options[form.correctIndex];
      correctIdx = [opts.indexOf(target)].filter((i) => i >= 0);
    }
    const card: Card = {
      id: uid(),
      type: form.type,
      question: form.question.trim(),
      answer: form.answer.trim(),
      options: form.type === "boolean" ? ["נכון", "לא נכון"] : opts,
      correctIndices: form.type === "boolean" ? [form.boolCorrect ? 0 : 1] : correctIdx,
      correct: form.type === "boolean" ? form.boolCorrect : null,
      categoryId: resolveCategoryId(),
      deckIds: [],
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      masechta,
      daf: String(daf),
      amud,
      createdAt: now,
      updatedAt: now,
      srs: defaultSrs(),
      stats: { totalReviews: 0, correct: 0, incorrect: 0 },
    };
    await db.cards.add(card);
    setForm(thenAnother ? { ...emptyForm(), type: form.type } : emptyForm());
    if (!thenAnother) setAmud(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  const saveEdit = async () => {
    if (!editor || !editor.question.trim()) return;
    await db.cards.update(editor.id, {
      question: editor.question.trim(),
      answer: editor.answer.trim(),
      categoryId: editor.categoryId || null,
      updatedAt: Date.now(),
    });
    setEditor(null);
  };

  const remove = async (id: string) => {
    if (!confirm("למחוק את השאלה?")) return;
    await db.cards.delete(id);
  };

  const setOption = (i: number, v: string) => {
    const next = [...form.options];
    next[i] = v;
    setForm({ ...form, options: next });
  };
  const moveOption = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= form.options.length) return;
    const next = [...form.options];
    [next[i], next[j]] = [next[j], next[i]];
    let correctIndex = form.correctIndex;
    if (correctIndex === i) correctIndex = j;
    else if (correctIndex === j) correctIndex = i;
    setForm({ ...form, options: next, correctIndex });
  };
  const removeOption = (i: number) => {
    if (form.options.length <= 2) return;
    const next = form.options.filter((_, k) => k !== i);
    let correctIndex = form.correctIndex;
    if (correctIndex === i) correctIndex = null;
    else if (correctIndex !== null && correctIndex > i) correctIndex--;
    setForm({ ...form, options: next, correctIndex });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fade-in">
      <PageBanner icon={HelpCircle} title="בניית שאלות" subtitle="בחר קטגוריה או עמוד; הטופס למטה יקבל את הסיווג אוטומטית." />

      {/* טאבי תחום */}
      <div className="card-panel p-2 flex gap-2">
        {CORPUS_TABS.map((tab) => (
          <button
            key={tab.name}
            onClick={() => setCorpus(tab.name)}
            className={
              corpus === tab.name
                ? "flex-1 h-11 rounded-lg bg-gradient-navy text-primary-foreground font-bold flex items-center justify-center gap-2 shadow-elegant"
                : "flex-1 h-11 rounded-lg text-foreground/80 font-medium flex items-center justify-center gap-2 hover:bg-secondary transition-colors"
            }
          >
            <tab.icon className="h-4 w-4" />
            {tab.name}
          </button>
        ))}
      </div>

      {corpus !== 'ש"ס' ? (
        <div className="card-panel border-dashed text-center text-muted-foreground py-10">
          תחום {corpus} עדיין ללא עץ סיווג — שאלות אפשר להוסיף בינתיים דרך ש"ס.
        </div>
      ) : (
        <div className="gold-frame bg-card p-4 space-y-4">
          <div>
            <h3 className="font-bold text-lg">בחירת סיווג לשאלה</h3>
            <p className="text-sm text-muted-foreground">בחר סדר, מסכת, דף ועמוד — טופס הוספת השאלה יופיע לאחר השלמת הסיווג.</p>
          </div>

          {/* שלב 1: סדר */}
          {!seder && (
            <div className="space-y-2">
              <p className="text-sm font-bold flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-gradient-navy text-primary-foreground text-xs flex items-center justify-center">1</span>
                בחר סדר
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {SEDARIM.map((s) => (
                  <button key={s.name} onClick={() => setSeder(s.name)} className="card-panel py-2.5 font-medium hover:border-gold transition-colors">
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* שלב 2: מסכת */}
          {seder && !masechta && (
            <div className="space-y-2 animate-slide-in-down">
              <button className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1" onClick={() => setSeder(null)}>
                <ChevronRight className="h-4 w-4" /> חזרה לסדרים
              </button>
              <p className="text-sm font-bold">בחר מסכת — סדר {seder}</p>
              <div className="grid md:grid-cols-2 gap-2">
                {SEDARIM.find((s) => s.name === seder)?.masechtot.map((m) => (
                  <button key={m} onClick={() => setMasechta(m)} className="card-panel py-2.5 px-3 flex items-center justify-between hover:border-gold transition-colors">
                    <span className="font-medium">{m}</span>
                    <span className="text-xs text-gold flex items-center">בחר דף <ChevronLeft className="h-3.5 w-3.5" /></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* שלב 3: דף */}
          {masechta && daf === null && (
            <div className="space-y-2 animate-slide-in-down">
              <button className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1" onClick={() => setMasechta(null)}>
                <ChevronRight className="h-4 w-4" /> חזרה למסכתות
              </button>
              <p className="text-sm font-bold flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-gradient-navy text-primary-foreground text-xs flex items-center justify-center">2</span>
                בחר דפים — {masechta}
              </p>
              <div className="grid grid-cols-4 md:grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
                {Array.from({ length: 175 }, (_, i) => i + 2).map((d) => (
                  <button key={d} onClick={() => setDaf(d)} className="card-panel py-2 text-center font-medium hover:border-gold transition-colors">
                    דף {hebrewDaf(d)}.
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* שלב 4: עמוד */}
          {masechta && daf !== null && (
            <div className="space-y-2 animate-slide-in-down">
              <button className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1" onClick={() => { setDaf(null); setAmud(null); }}>
                <ChevronRight className="h-4 w-4" /> חזרה לדפים
              </button>
              <p className="text-sm font-bold flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-gradient-navy text-primary-foreground text-xs flex items-center justify-center">3</span>
                בחר עמוד — דף {hebrewDaf(daf)}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["1", "2"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmud(a)}
                    className={
                      amud === a
                        ? "rounded-lg bg-gradient-navy text-primary-foreground py-4 text-center font-bold shadow-elegant"
                        : "card-panel py-4 text-center font-bold hover:border-gold transition-colors"
                    }
                  >
                    {AMUD_LABELS[a]}
                    {amud === a && <span className="block text-xs font-normal opacity-80 mt-0.5"><Check className="h-3.5 w-3.5 inline" /> נבחר לסיווג</span>}
                    {amud !== a && <span className="block text-xs font-normal text-muted-foreground mt-0.5">בחר עמוד</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- טופס הוספת שאלה — נפתח אחרי השלמת הסיווג ---- */}
      {corpus === 'ש"ס' && (
        classificationDone ? (
          <div className="gold-frame bg-card p-4 space-y-4 animate-slide-in-down">
            <div>
              <h3 className="font-bold text-lg">הוספת שאלה</h3>
              <p className="text-sm text-muted-foreground">
                הסיווג שנבחר: {masechta} · דף {hebrewDaf(daf!)} · {AMUD_LABELS[amud!]}
              </p>
            </div>
            <div className="rounded-lg bg-gold/10 border border-gold/40 px-3 py-2.5 text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-gold shrink-0" />
              השאלה תסווג אוטומטית לעמוד זה — {masechta} · דף {hebrewDaf(daf!)} · {AMUD_LABELS[amud!]}
            </div>

            {/* סוג שאלה */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">סוג שאלה</p>
              <div className="grid grid-cols-3 gap-2">
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setForm({ ...form, type: t.key })}
                    className={
                      form.type === t.key
                        ? "h-10 rounded-lg bg-gradient-navy text-primary-foreground font-bold"
                        : "h-10 rounded-lg border bg-card hover:border-gold transition-colors"
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">לחיצה על סוג אחר מחליפה את הסוג הנוכחי ואינה שומרת או מוסיפה שאלה.</p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">שאלה</p>
              <textarea
                className="input min-h-20"
                placeholder="כתוב את השאלה..."
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
              />
            </div>

            {/* אמריקאי: אפשרויות עם סימון נכונה וסידור */}
            {form.type === "multiple" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">אפשרויות אמריקאיות (חצים לסידור)</p>
                  {form.correctIndex === null && (
                    <span className="text-xs rounded-full bg-gold/15 border border-gold/40 text-gold px-2 py-0.5">נא לסמן תשובה נכונה</span>
                  )}
                </div>
                {form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="correct"
                      className="accent-[hsl(var(--gold))] h-4 w-4 shrink-0"
                      checked={form.correctIndex === i}
                      onChange={() => setForm({ ...form, correctIndex: i })}
                      title="סמן כתשובה נכונה"
                    />
                    <input
                      className="input flex-1"
                      placeholder={`אפשרות ${i + 1}`}
                      value={opt}
                      onChange={(e) => setOption(i, e.target.value)}
                    />
                    <div className="flex flex-col">
                      <button className="text-muted-foreground hover:text-gold disabled:opacity-30" disabled={i === 0} onClick={() => moveOption(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button className="text-muted-foreground hover:text-gold disabled:opacity-30" disabled={i === form.options.length - 1} onClick={() => moveOption(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                    <button className="text-muted-foreground hover:text-destructive disabled:opacity-30" disabled={form.options.length <= 2} onClick={() => removeOption(i)}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-end">
                  <button className="btn-outline h-9" onClick={() => setForm({ ...form, options: [...form.options, ""] })}>
                    <Plus className="h-4 w-4" /> הוסף אפשרות
                  </button>
                </div>
              </div>
            )}

            {/* נכון/לא נכון */}
            {form.type === "boolean" && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">התשובה הנכונה</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setForm({ ...form, boolCorrect: true })}
                    className={form.boolCorrect === true ? "h-10 rounded-lg bg-gradient-gold text-navy font-bold shadow-gold" : "h-10 rounded-lg border bg-card hover:border-gold"}
                  >נכון</button>
                  <button
                    onClick={() => setForm({ ...form, boolCorrect: false })}
                    className={form.boolCorrect === false ? "h-10 rounded-lg bg-gradient-gold text-navy font-bold shadow-gold" : "h-10 rounded-lg border bg-card hover:border-gold"}
                  >לא נכון</button>
                </div>
              </div>
            )}

            {/* תשובה/הסבר */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{form.type === "flashcard" ? "תשובה" : "הסבר (אופציונלי)"}</p>
              <textarea
                className="input min-h-16"
                placeholder={form.type === "flashcard" ? "כתוב את התשובה..." : "הסבר שיוצג אחרי המענה..."}
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
              />
            </div>

            {/* אופציונלי: תגיות */}
            <details className="rounded-lg border bg-secondary/40 px-3 py-2">
              <summary className="text-sm font-medium cursor-pointer">אפשרויות אופציונליות — תגיות</summary>
              <input
                className="input mt-2"
                placeholder="תגיות מופרדות בפסיק: הלכה, אגדתא"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </details>

            <div className="flex items-center gap-2 flex-wrap">
              <button className="btn-primary h-11" disabled={!formValid} onClick={() => saveNew(false)}>
                <Save className="h-4 w-4" /> שמור
              </button>
              <button className="btn-outline h-11" disabled={!formValid} onClick={() => saveNew(true)}>
                <Plus className="h-4 w-4" /> הוסף שאלה נוספת לעמוד זה
              </button>
              {savedFlash && <span className="text-sm text-gold font-medium animate-fade-in">✓ השאלה נשמרה</span>}
            </div>
          </div>
        ) : (
          <div className="card-panel border-dashed text-center text-muted-foreground py-8">
            <BookOpen className="h-6 w-6 mx-auto text-gold mb-2" />
            <p className="font-medium text-foreground">בחר מסכת, דף ולאחר מכן עמוד א' או ב'</p>
            <p className="text-sm mt-0.5">טופס הוספת השאלה יופיע רק לאחר השלמת הסיווג.</p>
          </div>
        )
      )}

      {/* ---- חיפוש, רשימה וייצוא (כמו שהיה) ---- */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <h3 className="font-bold">כל השאלות</h3>
        <div className="flex gap-2">
          <button
            className="btn-outline"
            disabled={filtered.length === 0 || filtered.length > 3000}
            title={filtered.length > 3000 ? "סנן לפחות מ־3,000 שאלות לפני ייצוא" : "ייצוא ל-Word"}
            onClick={() => exportQuestionsDocx(filtered, exportTitle)}
          >
            <FileText className="h-4 w-4" /> Word
          </button>
          <button className="btn-outline" disabled={filtered.length === 0} title="ייצוא ל-Excel" onClick={() => exportQuestionsXlsx(filtered, exportTitle)}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            className="input pr-9"
            placeholder="חיפוש בשאלות ובתשובות…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <select className="input w-52" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}>
          <option value="">כל המסכתות</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{c.depth ? "— " : ""}{c.name}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} שאלות</p>

      {editor && (
        <div className="card-panel gold-frame space-y-3 animate-slide-in-down">
          <h3 className="font-semibold">עריכת שאלה</h3>
          <textarea className="input min-h-20" placeholder="שאלה" value={editor.question} onChange={(e) => setEditor({ ...editor, question: e.target.value })} />
          <textarea className="input min-h-20" placeholder="תשובה" value={editor.answer} onChange={(e) => setEditor({ ...editor, answer: e.target.value })} />
          <select className="input" value={editor.categoryId} onChange={(e) => setEditor({ ...editor, categoryId: e.target.value })}>
            <option value="">ללא מסכת</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>{c.depth ? "— " : ""}{c.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={saveEdit}>שמירה</button>
            <button className="btn-outline" onClick={() => setEditor(null)}>ביטול</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {visible.map((card) => (
          <div key={card.id} className="card-panel py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-snug">{card.question}</p>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{card.answer || card.options.join(" · ")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {card.masechta ?? "ללא מסכת"}{card.daf ? ` · דף ${hebrewDaf(parseInt(card.daf, 10)) || card.daf}` : ""}
                {card.amud ? ` · ${AMUD_LABELS[card.amud] ?? ""}` : ""} · חזרה הבאה: {formatDate(card.srs.dueAt)}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button className="btn-ghost h-8 w-8 p-0" title="עריכה"
                onClick={() => setEditor({ id: card.id, question: card.question, answer: card.answer, categoryId: card.categoryId ?? "" })}>
                <Pencil className="h-4 w-4" />
              </button>
              <button className="btn-ghost h-8 w-8 p-0 text-destructive" title="מחיקה" onClick={() => remove(card.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {visible.length < filtered.length && (
        <button className="btn-outline w-full" onClick={() => setPage((p) => p + 1)}>
          טען עוד ({filtered.length - visible.length} נותרו)
        </button>
      )}
    </div>
  );
}
