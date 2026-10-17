import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Brain, Check, Cloud, CloudDownload, CloudUpload, Copy, Download, Heart, LayoutTemplate, Settings, Upload } from "lucide-react";
import { db, setSetting } from "../db";
import { reloadCards } from "../db/cardsStore";
import { connectToCode, getSyncCode, onSyncStatus, syncNow } from "../db/sync";
import PageBanner from "../components/PageBanner";
import ThemeStudio from "../components/ThemeStudio";
import AccountSection from "../components/AccountSection";
import type { SrsAlgorithm } from "../features/study/srs";
import { saveLayoutMode, useLayoutMode, type LayoutMode } from "../features/layoutMode";

/** בחירת הפריסה של עמוד הבית ושל לשונית התרגול: הנוכחית, או המקורית (אחד לאחד כמו באתר הבסיסי). */
function LayoutModeCard() {
  const mode = useLayoutMode();
  const options: { id: LayoutMode; title: string; text: string }[] = [
    { id: "modern", title: "הפריסה הנוכחית", text: "העיצוב והפריסה של האתר הזה" },
    { id: "classic", title: "הפריסה המקורית", text: "אחד לאחד כמו באתר הבסיסי, עם כל הפונקציות שלו" },
  ];
  return (
    <div className="card-panel space-y-3">
      <h3 className="font-semibold flex items-center gap-2"><LayoutTemplate className="h-4 w-4 text-gold" /> פריסה ועיצוב</h3>
      <p className="text-xs text-muted-foreground">משנה את עמוד הבית ואת לשונית התרגול. הנתונים (שאלות, תשובות, התקדמות) משותפים לשתי הפריסות.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="פריסה ועיצוב">
        {options.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={mode === o.id}
            className={`rounded-xl border-2 p-3 text-right transition-colors ${mode === o.id ? "border-gold bg-gold/10" : "border-border hover:border-gold/60"}`}
            onClick={() => void saveLayoutMode(o.id)}
          >
            <div className="font-semibold flex items-center gap-1.5">
              {mode === o.id && <Check className="h-4 w-4 text-gold" />} {o.title}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{o.text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const algorithm = useLiveQuery(async () => ((await db.settings.get("srs-algo"))?.value ?? "sm2") as SrsAlgorithm, []);
  const syncCode = useLiveQuery(async () => (await db.settings.get("sync-code"))?.value as string | undefined, []);
  const dedication = useLiveQuery(async () => (await db.settings.get("dedication"))?.value ?? "", []);
  const [dedDraft, setDedDraft] = useState<string | null>(null);

  // סנכרון מדורג: נשלחים רק פריטים אישיים שהשתנו, ושני מכשירים מתמזגים (שום דבר לא נמחק)
  const [syncState, setSyncState] = useState<{ state: string; at?: number; message?: string }>({ state: "off" });
  useEffect(() => onSyncStatus(setSyncState), []);
  const doSync = async () => {
    setBusy(true);
    setSyncMsg("");
    try {
      await getSyncCode();
      const { sent, received } = await syncNow();
      setSyncMsg(`הנתונים הועלו לענן ומוזגו: נשלחו ${sent.toLocaleString()} פריטים, התקבלו ${received.toLocaleString()}.`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "שגיאה בסנכרון");
    } finally {
      setBusy(false);
    }
  };
  const doConnect = async () => {
    setBusy(true);
    setSyncMsg("");
    try {
      const { received } = await connectToCode(codeInput);
      setSyncMsg(`המכשיר חובר וּמוזג: התקבלו ${received.toLocaleString()} פריטים. שום דבר לא נמחק.`);
      setCodeInput("");
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "שגיאה בחיבור");
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    setBusy(true);
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        cards: await db.cards.toArray(),
        categories: await db.categories.toArray(),
        decks: await db.decks.toArray(),
        reviewLogs: await db.reviewLogs.toArray(),
        goals: await db.goals.toArray(),
        settings: await db.settings.toArray(),
      };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `lemaan-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async (file: File) => {
    setBusy(true);
    try {
      const payload = JSON.parse(await file.text());
      if (!payload.cards || !payload.categories) throw new Error("קובץ גיבוי לא תקין");
      if (!confirm("הגיבוי יחליף את כל הנתונים הקיימים. להמשיך?")) return;
      await db.transaction("rw", db.tables, async () => {
        await Promise.all(db.tables.map((t) => t.clear()));
        await db.cards.bulkPut(payload.cards);
        await db.categories.bulkPut(payload.categories);
        if (payload.decks?.length) await db.decks.bulkPut(payload.decks);
        if (payload.reviewLogs?.length) await db.reviewLogs.bulkPut(payload.reviewLogs.map((l: { id?: number }) => { const { id, ...rest } = l; return rest; }));
        if (payload.goals?.length) await db.goals.bulkPut(payload.goals);
        if (payload.settings?.length) await db.settings.bulkPut(payload.settings);
      });
      alert("הגיבוי שוחזר בהצלחה");
    } catch (e) {
      alert(e instanceof Error ? e.message : "שגיאה בשחזור");
    } finally {
      setBusy(false);
    }
  };

  const resetAll = async () => {
    if (!confirm("למחוק את כל הנתונים? פעולה זו אינה הפיכה (מומלץ לייצא גיבוי קודם).")) return;
    if (!confirm("בטוח לגמרי? הכל יימחק.")) return;
    await db.transaction("rw", db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()));
    });
    await reloadCards(); // הזיכרון המשותף של השאלות
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <PageBanner icon={Settings} title="הגדרות" subtitle="ערכות נושא, אלגוריתם החזרה, גיבוי ושחזור נתונים." />

      <AccountSection />

      <ThemeStudio />

      <LayoutModeCard />

      <div className="card-panel space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Heart className="h-4 w-4 text-gold" /> הקדשה</h3>
        <p className="text-xs text-muted-foreground">שורה שתופיע בעמוד הבית מתחת לכותרת. השאירו ריק כדי לא להציג.</p>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder='למשל: לעילוי נשמת…' aria-label="טקסט ההקדשה"
            value={dedDraft ?? dedication ?? ""} onChange={(e) => setDedDraft(e.target.value)} />
          <button className="btn-primary" disabled={dedDraft === null || dedDraft === dedication}
            onClick={async () => { await setSetting("dedication", (dedDraft ?? "").trim()); setDedDraft(null); }}>שמירה</button>
        </div>
      </div>

      <div className="card-panel space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Brain className="h-4 w-4 text-gold" /> אלגוריתם חזרה מרווחת</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            className={algorithm === "sm2" ? "btn-primary" : "btn-outline"}
            onClick={() => setSetting("srs-algo", "sm2")}
          >
            SM-2 (קלאסי)
          </button>
          <button
            className={algorithm === "fsrs" ? "btn-primary" : "btn-outline"}
            onClick={() => setSetting("srs-algo", "fsrs")}
          >
            FSRS (מתקדם)
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          SM-2 הוא האלגוריתם המוכר של אנקי; FSRS מדויק יותר בחיזוי שכחה ומתאים למי שחוזר בקביעות.
        </p>
      </div>

      <div className="card-panel space-y-3">
        <h3 className="font-semibold">גיבוי ושחזור</h3>
        <p className="text-sm text-muted-foreground">כל הנתונים שמורים מקומית במכשיר. מומלץ לייצא גיבוי מדי פעם.</p>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={exportBackup} disabled={busy}>
            <Download className="h-4 w-4" /> ייצוא גיבוי
          </button>
          <label className="btn-outline cursor-pointer">
            <Upload className="h-4 w-4" /> שחזור מגיבוי
            <input type="file" accept=".json" className="hidden"
              onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
          </label>
        </div>
      </div>

      <div className="card-panel space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Cloud className="h-4 w-4 text-gold" /> סנכרון ענן בין מכשירים</h3>
        <p className="text-sm text-muted-foreground">
          אחרי ההפעלה הסנכרון אוטומטי: רק מה שהשתנה נשלח, ושני מכשירים מתמזגים בלי למחוק כלום.
          כדי לחבר מכשיר נוסף — הדבק בו את קוד הסנכרון (או התחבר לאותו חשבון).
        </p>
        <p className="text-xs text-muted-foreground" data-testid="sync-status">
          {syncState.state === "syncing" ? "מסנכרן…"
            : syncState.state === "error" ? `שגיאה בסנכרון האחרון: ${syncState.message ?? ""}`
            : syncState.state === "idle" && syncState.at ? `סונכרן לאחרונה: ${new Date(syncState.at).toLocaleTimeString("he-IL")}`
            : "הסנכרון האוטומטי עוד לא הופעל במכשיר הזה."}
        </p>
        {syncCode && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">קוד הסנכרון שלך:</span>
            <code className="rounded bg-muted px-2 py-1 select-all" dir="ltr">{syncCode}</code>
            <button className="btn-ghost h-7 w-7 p-0" title="העתקה"
              onClick={() => { navigator.clipboard.writeText(syncCode); setSyncMsg("הקוד הועתק."); }}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn-primary" onClick={doSync} disabled={busy}>
            <CloudUpload className="h-4 w-4" /> סנכרון עכשיו
          </button>
          <input className="input w-72" dir="ltr" placeholder="קוד סנכרון ממכשיר אחר"
            value={codeInput} onChange={(e) => setCodeInput(e.target.value)} aria-label="קוד סנכרון ממכשיר אחר" />
          <button className="btn-outline" onClick={doConnect} disabled={busy || codeInput.trim().length < 32}>
            <CloudDownload className="h-4 w-4" /> חיבור ומיזוג
          </button>
        </div>
        {syncMsg && <p className="text-sm font-medium">{syncMsg}</p>}
      </div>

      <div className="card-panel border-destructive/50 space-y-3">
        <h3 className="font-semibold flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /> אזור מסוכן</h3>
        <button className="btn bg-destructive text-destructive-foreground hover:opacity-90" onClick={resetAll}>
          מחיקת כל הנתונים
        </button>
      </div>
    </div>
  );
}
