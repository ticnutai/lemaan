import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen, ChevronLeft, ChevronRight, ListChecks, Play, Plus, Save, Scroll, Timer, Trash2, X,
} from "lucide-react";
import { db } from "../db";
import PageBanner from "../components/PageBanner";
import { cardsForDeck, matchesFilter } from "../features/study/deckCards";
import { AMUD_LABELS, AMUD_SHORT, SEDARIM, hebrewDaf } from "../features/study/shas";
import { uid } from "../lib/utils";
import type { Deck } from "../features/study/types";

const CORPUS_TABS = [
  { name: 'ש"ס', icon: BookOpen },
  { name: "משנה", icon: Scroll },
  { name: "חומש", icon: Scroll },
  { name: 'תנ"ך', icon: BookOpen },
];

type Filter = { masechta: string; daf?: string; amud?: string };

const filterLabel = (f: Filter) => {
  const d = f.daf ? parseInt(f.daf, 10) : NaN;
  if (f.daf && f.amud) return `${f.masechta} ${hebrewDaf(d)} ${AMUD_SHORT[f.amud] ?? ""}`;
  if (f.daf) return `${f.masechta} דף ${hebrewDaf(d)}`;
  return `${f.masechta} (כל המסכת)`;
};

const sameFilter = (a: Filter, b: Filter) => a.masechta === b.masechta && a.daf === b.daf && a.amud === b.amud;

/**
 * בניית מבחנים — כמו במקור: בוחרים תוכן בעץ (מסכת/דף/עמוד, בחירה מרובה),
 * נותנים שם ו"הוסף מבחן". פאנל המבחנים מציג את כל המבחנים עם מונים,
 * תרגול חופשי, חזרה ממוקדת ותרגול טעויות.
 */
export default function QuizPage() {
  const [corpus, setCorpus] = useState('ש"ס');
  const [seder, setSeder] = useState<string | null>(null);
  const [masechta, setMasechta] = useState<string | null>(null);
  const [daf, setDaf] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [name, setName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const decks = useLiveQuery(() => db.decks.toArray(), []);
  const allCards = useLiveQuery(() => db.cards.toArray(), []);

  /** מוני שאלות לפי מסכת/דף/עמוד. */
  const counts = useMemo(() => {
    const byMasechta = new Map<string, Map<number, { a: number; b: number; none: number }>>();
    if (!allCards) return byMasechta;
    for (const c of allCards) {
      if (!c.masechta) continue;
      const dafNum = parseInt(c.daf ?? "", 10);
      if (!Number.isFinite(dafNum)) continue;
      let dafMap = byMasechta.get(c.masechta);
      if (!dafMap) byMasechta.set(c.masechta, (dafMap = new Map()));
      let entry = dafMap.get(dafNum);
      if (!entry) dafMap.set(dafNum, (entry = { a: 0, b: 0, none: 0 }));
      if (c.amud === "1") entry.a++;
      else if (c.amud === "2") entry.b++;
      else entry.none++;
    }
    return byMasechta;
  }, [allCards]);

  const masechtaTotal = (m: string) => {
    let n = 0;
    for (const e of counts.get(m)?.values() ?? []) n += e.a + e.b + e.none;
    return n;
  };

  /** כמה שאלות ייכללו במבחן לפי הבחירות הנוכחיות. */
  const selectedCount = useMemo(() => {
    if (!allCards || filters.length === 0) return 0;
    const seen = new Set<string>();
    for (const c of allCards) {
      for (const f of filters) {
        if (matchesFilter(c, f)) { seen.add(c.id); break; }
      }
    }
    return seen.size;
  }, [allCards, filters]);

  const toggleFilter = (f: Filter) => {
    setFilters((prev) => {
      const without = prev.filter((x) => !sameFilter(x, f));
      return without.length === prev.length ? [...prev, f] : without;
    });
  };
  const isSelected = (f: Filter) => filters.some((x) => sameFilter(x, f));

  const deckStats = useMemo(() => {
    const map = new Map<string, { total: number; due: number; wrong: number }>();
    if (!decks || !categories || !allCards) return map;
    const now = Date.now();
    for (const d of decks) {
      const cards = cardsForDeck(d, allCards, categories);
      map.set(d.id, {
        total: cards.length,
        due: cards.filter((c) => c.srs.dueAt <= now).length,
        wrong: cards.filter((c) => c.stats.incorrect > c.stats.correct && c.stats.totalReviews > 0).length,
      });
    }
    return map;
  }, [decks, categories, allCards]);

  const addDeck = async () => {
    if (!name.trim() || filters.length === 0) return;
    const deck: Deck = {
      id: uid(),
      name: name.trim(),
      color: null,
      categoryIds: [],
      includeSubCategories: true,
      filters,
      createdAt: Date.now(),
    };
    await db.decks.add(deck);
    setName("");
    setFilters([]);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  const removeDeck = async (id: string) => {
    if (!confirm("למחוק את המבחן? (השאלות עצמן נשארות במאגר)")) return;
    await db.decks.delete(id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fade-in">
      <PageBanner icon={Timer} title="בניית מבחנים" subtitle="בחר את המיקום בעץ והוסף מסכת, דף או עמוד אל מסגרת המבחן." />

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
          לא נמצאו עדיין שאלות בתחום {corpus} — מבחנים אפשר לבנות בינתיים מש"ס.
        </div>
      ) : (
        <div className="gold-frame bg-card p-4 space-y-4">
          <div>
            <h3 className="font-bold text-lg">בחירת תוכן למבחן</h3>
            <p className="text-sm text-muted-foreground">בחירה מרובה: כל לחיצה מוסיפה (או מסירה) מסכת, דף או עמוד מהמבחן.</p>
          </div>

          {/* דרילדאון עם בחירה מרובה */}
          {!seder && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {SEDARIM.map((s) => {
                const withContent = s.masechtot.filter((m) => masechtaTotal(m) > 0).length;
                return (
                  <button
                    key={s.name}
                    disabled={withContent === 0}
                    onClick={() => setSeder(s.name)}
                    className="card-panel py-3 text-center hover:border-gold transition-colors disabled:opacity-40"
                  >
                    <div className="font-bold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{withContent} מסכתות</div>
                  </button>
                );
              })}
            </div>
          )}

          {seder && !masechta && (
            <div className="space-y-2 animate-slide-in-down">
              <button className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1" onClick={() => setSeder(null)}>
                <ChevronRight className="h-4 w-4" /> חזרה לסדרים
              </button>
              <p className="text-sm font-bold">סדר {seder} — לחיצה על שם המסכת מוסיפה את כולה; החץ נכנס לדפים</p>
              <div className="grid md:grid-cols-2 gap-2">
                {SEDARIM.find((s) => s.name === seder)?.masechtot.map((m) => {
                  const n = masechtaTotal(m);
                  const f: Filter = { masechta: m };
                  return (
                    <div key={m} className={`card-panel py-2 px-3 flex items-center justify-between gap-2 ${isSelected(f) ? "border-gold shadow-gold" : ""}`}>
                      <button className="font-medium flex-1 text-right disabled:opacity-40" disabled={n === 0} onClick={() => toggleFilter(f)}>
                        {m}
                        <span className="text-xs text-muted-foreground mr-2">{n} שאלות</span>
                        {isSelected(f) && <span className="text-xs text-gold font-bold mr-2">✓ במבחן</span>}
                      </button>
                      <button className="btn-ghost h-8 px-2 text-gold disabled:opacity-40" disabled={n === 0} onClick={() => setMasechta(m)} title="בחירת דפים">
                        בחר דף <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {masechta && daf === null && (
            <div className="space-y-2 animate-slide-in-down">
              <button className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1" onClick={() => setMasechta(null)}>
                <ChevronRight className="h-4 w-4" /> חזרה למסכתות
              </button>
              <p className="text-sm font-bold">{masechta} — לחיצה מוסיפה דף שלם; חץ נכנס לעמודים</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-72 overflow-y-auto pr-1">
                {[...(counts.get(masechta)?.entries() ?? [])]
                  .sort((x, y) => x[0] - y[0])
                  .map(([d, e]) => {
                    const f: Filter = { masechta, daf: String(d) };
                    return (
                      <div key={d} className={`card-panel py-1.5 px-1.5 flex items-center justify-between gap-1 ${isSelected(f) ? "border-gold shadow-gold" : ""}`}>
                        <button className="flex-1 text-center font-bold" onClick={() => toggleFilter(f)}>
                          {hebrewDaf(d)}
                          <span className="block text-[10px] text-gold font-normal">{e.a + e.b + e.none}{isSelected(f) ? " ✓" : ""}</span>
                        </button>
                        <button className="btn-ghost h-7 w-6 p-0 text-gold" onClick={() => setDaf(d)} title="בחירת עמוד">
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {masechta && daf !== null && (() => {
            const e = counts.get(masechta)?.get(daf) ?? { a: 0, b: 0, none: 0 };
            return (
              <div className="space-y-2 animate-slide-in-down">
                <button className="text-sm text-muted-foreground hover:text-gold flex items-center gap-1" onClick={() => setDaf(null)}>
                  <ChevronRight className="h-4 w-4" /> חזרה לדפים
                </button>
                <p className="text-sm font-bold">{masechta}, דף {hebrewDaf(daf)} — בחר עמודים למבחן</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["1", "2"] as const).map((a) => {
                    const f: Filter = { masechta, daf: String(daf), amud: a };
                    // שאלות בלי תיוג עמוד שייכות לשני העמודים — כמו במקור
                    const n = (a === "1" ? e.a : e.b) + e.none;
                    return (
                      <button
                        key={a}
                        disabled={n === 0}
                        onClick={() => toggleFilter(f)}
                        className={
                          isSelected(f)
                            ? "rounded-lg bg-gradient-navy text-primary-foreground py-4 text-center font-bold shadow-elegant"
                            : "card-panel py-4 text-center font-bold hover:border-gold transition-colors disabled:opacity-40"
                        }
                      >
                        {AMUD_LABELS[a]}
                        <span className={`block text-xs font-normal mt-0.5 ${isSelected(f) ? "opacity-80" : "text-muted-foreground"}`}>
                          {n} שאלות{isSelected(f) ? " · ✓ במבחן" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* מסגרת המבחן: הבחירות + שם + הוספה */}
          <div className="rounded-lg border-2 border-dashed border-gold/50 bg-secondary/40 p-4 space-y-3">
            {filters.length === 0 ? (
              <p className="text-center text-muted-foreground py-3">
                <Plus className="h-5 w-5 mx-auto text-gold mb-1" />
                בחר כאן מסכת, דף או עמוד — <b>0 שאלות ייכללו במבחן</b>
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {filters.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-card border border-gold/50 px-2.5 py-1 text-sm">
                      {filterLabel(f)}
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => toggleFilter(f)}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-sm font-medium text-gold">{selectedCount} שאלות ייכללו במבחן (כפולות נספרות פעם אחת)</p>
              </>
            )}
            <div className="flex gap-2 items-center flex-wrap">
              <input
                className="input flex-1 min-w-48"
                placeholder='שם המבחן — לדוגמה: מבחן חזרה מסכת שבת'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="btn-primary h-11" disabled={!name.trim() || filters.length === 0} onClick={addDeck}>
                <Save className="h-4 w-4" /> הוסף מבחן
              </button>
              {savedFlash && <span className="text-sm text-gold font-medium animate-fade-in">✓ המבחן נוצר</span>}
            </div>
          </div>
        </div>
      )}

      {/* ---- פאנל המבחנים ---- */}
      <div className="gold-frame bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-gold" /> מבחנים
          </h3>
          <span className="text-sm text-muted-foreground">{decks?.length ?? 0} מבחנים</span>
        </div>

        {(decks ?? []).length === 0 ? (
          <p className="text-center text-muted-foreground py-6">עדיין אין מבחנים — בחר תוכן למעלה ולחץ "הוסף מבחן".</p>
        ) : (
          <div className="space-y-2">
            {(decks ?? []).map((d) => {
              const s = deckStats.get(d.id) ?? { total: 0, due: 0, wrong: 0 };
              return (
                <div key={d.id} className="rounded-lg bg-gradient-navy text-primary-foreground px-4 py-3 shadow-elegant flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-40">
                    <p className="font-bold">{d.name}</p>
                    <p className="text-xs opacity-80">{s.total} כרטיסים · {s.due} לחזרה</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link to={`/study?deck=${d.id}`} className="btn h-9 rounded-full bg-gradient-gold text-navy font-bold px-3 hover:opacity-90">
                      <Play className="h-3.5 w-3.5" /> תרגול חופשי
                    </Link>
                    <span className="rounded-full border border-primary-foreground/30 px-2.5 py-1 text-xs opacity-90">
                      חזרה ממוקדת ({s.due})
                    </span>
                    <span className="rounded-full border border-primary-foreground/30 px-2.5 py-1 text-xs opacity-90">
                      תרגול טעויות ({s.wrong})
                    </span>
                    <button className="btn-ghost h-8 w-8 p-0 text-primary-foreground/70 hover:text-destructive" title="מחיקת המבחן" onClick={() => removeDeck(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
