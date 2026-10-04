import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, CheckCircle2, Download, Flame, GraduationCap, Library } from "lucide-react";
import { db } from "../db";
import { importLibrary, type ImportProgress } from "../db/importLibrary";
import StudyPlansSection from "../components/StudyPlansSection";
import ActivityInsights from "../components/ActivityInsights";
import TodayCard from "../components/TodayCard";

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function useStreak(logDays: Set<number> | undefined): number {
  if (!logDays || logDays.size === 0) return 0;
  let streak = 0;
  let day = startOfDay(Date.now());
  // today counts if studied, otherwise start from yesterday
  if (!logDays.has(day)) day -= 86400000;
  while (logDays.has(day)) {
    streak += 1;
    day -= 86400000;
  }
  return streak;
}

export default function Dashboard() {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const totalCards = useLiveQuery(() => db.cards.count(), []);
  // "ממתינות לחזרה" = שאלות שכבר תורגלו והגיע זמן החזרה שלהן; שאלה שעוד לא תורגלה היא "חדשה"
  // (גם לה dueAt בעבר — מיום הייבוא — ולכן הספירה הישנה הראתה את כל המאגר כממתין)
  const queueCounts = useLiveQuery(async () => {
    let due = 0, fresh = 0;
    await db.cards.where("srs.dueAt").belowOrEqual(Date.now()).each((c) => {
      if (c.srs.lastReviewedAt == null) fresh++; else due++;
    });
    return { due, fresh };
  }, []);
  const dueCount = queueCounts?.due;
  const newCount = queueCounts?.fresh;
  const todayLogs = useLiveQuery(() => db.reviewLogs.where("at").aboveOrEqual(startOfDay(Date.now())).toArray(), []);
  const logDays = useLiveQuery(async () => {
    const all = await db.reviewLogs.toArray();
    return new Set(all.map((l) => startOfDay(l.at)));
  }, []);
  const imported = useLiveQuery(async () => (await db.settings.get("library-import-done"))?.value === "1", []);

  const streak = useStreak(logDays);
  const todayCorrect = todayLogs?.filter((l) => l.correct).length ?? 0;

  const runImport = async () => {
    setImporting(true);
    setImportError(null);
    try {
      await importLibrary(setProgress);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "שגיאה בייבוא");
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  // הייבוא האוטומטי רץ ברמת האפליקציה (useAutoImport ב-Layout) בכל עמוד.

  const dedication = useLiveQuery(async () => (await db.settings.get("dedication"))?.value ?? "", []);

  const stats = [
    { label: "שאלות במאגר", value: totalCards ?? "…", icon: Library, gold: false },
    { label: "ממתינות לחזרה", value: dueCount ?? "…", icon: CalendarClock, gold: true, sub: newCount ? `${newCount.toLocaleString()} חדשות שעוד לא תורגלו` : undefined },
    { label: "חזרות היום", value: todayLogs?.length ?? "…", icon: CheckCircle2, gold: false },
    { label: "רצף ימים", value: streak, icon: Flame, gold: true },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <header className="text-center py-6">
        <h2 className="font-display text-5xl font-extrabold text-gold leading-tight drop-shadow-sm">
          לְמַעַן תִּהְיֶה תּוֹרַת ה' בְּפִיךָ
        </h2>
        <p className="text-2xl font-bold mt-3">מערכת לימוד וחזרות</p>
        <p className="text-muted-foreground mt-1">עקוב אחר ההתקדמות שלך וקבל תובנות מתקדמות</p>
        {dedication && <p className="mt-3 text-sm font-medium text-gold" data-testid="dedication">{dedication}</p>}
      </header>

      <TodayCard />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, gold, sub }) => (
          <div key={label} className="card-panel flex items-center gap-4">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center ${gold ? "bg-gradient-gold shadow-gold" : "bg-gradient-navy"}`}>
              <Icon className={`h-5 w-5 ${gold ? "text-navy" : "text-primary-foreground"}`} />
            </div>
            <div>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
              {sub && <div className="text-[11px] text-muted-foreground/80" data-testid="new-count">{sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {imported === false && (
        <div className="card-panel gold-frame space-y-3">
          <h3 className="font-semibold text-lg">טוען את מאגר השאלות…</h3>
          <p className="text-sm text-muted-foreground">
            כ־22,700 שאלות (ש"ס, תנ"ך, נביאים וכתובים וטור) נטענות כעת פעם אחת ונשמרות מקומית במכשיר.
          </p>
          {importError && <p className="text-sm text-destructive">{importError}</p>}
          <button className="btn-gold" onClick={runImport} disabled={importing}>
            <Download className="h-4 w-4" />
            {importing
              ? progress
                ? `מייבא… ${progress.done}/${progress.total}`
                : "מייבא…"
              : "ייבוא המאגר"}
          </button>
        </div>
      )}

      <div className="card-panel bg-gradient-navy text-primary-foreground flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl font-bold">חזרה יומית</h3>
          <p className="text-sm opacity-80 mt-1">
            {dueCount
              ? `${dueCount.toLocaleString()} שאלות ממתינות לחזרה`
              : newCount
                ? `אין שאלות לחזרה כרגע · ${newCount.toLocaleString()} שאלות חדשות מחכות לתרגול ראשון`
                : "אין שאלות ממתינות — כל הכבוד!"}
            {todayLogs?.length ? ` · ענית נכון על ${todayCorrect} מתוך ${todayLogs.length} היום` : ""}
          </p>
        </div>
        <Link to="/study" className="btn-gold">
          <GraduationCap className="h-4 w-4" />
          התחל חזרה
        </Link>
      </div>

      {/* רכיבי "כללי" מהמערכת המקורית: תוכניות לימוד, סיכום שבועי ומפת חום */}
      <StudyPlansSection />
      <ActivityInsights />
    </div>
  );
}
