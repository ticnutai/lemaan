import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Brain, Cloud, CloudDownload, CloudUpload, Copy, Download, Settings, Upload } from "lucide-react";
import { db, setSetting } from "../db";
import { getSyncCode, pullSnapshot, pushSnapshot } from "../db/sync";
import PageBanner from "../components/PageBanner";
import ThemeStudio from "../components/ThemeStudio";
import AccountSection from "../components/AccountSection";
import type { SrsAlgorithm } from "../features/study/srs";

export default function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const algorithm = useLiveQuery(async () => ((await db.settings.get("srs-algo"))?.value ?? "sm2") as SrsAlgorithm, []);
  const syncCode = useLiveQuery(async () => (await db.settings.get("sync-code"))?.value as string | undefined, []);

  const doPush = async () => {
    setBusy(true);
    setSyncMsg("");
    try {
      await getSyncCode();
      const { sizeKb } = await pushSnapshot();
      setSyncMsg(`הנתונים הועלו לענן (${sizeKb.toLocaleString()}KB).`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "שגיאה בהעלאה");
    } finally {
      setBusy(false);
    }
  };

  const doPull = async () => {
    if (!confirm("משיכה מהענן תחליף את כל הנתונים במכשיר הזה. להמשיך?")) return;
    setBusy(true);
    setSyncMsg("");
    try {
      const { updatedAt } = await pullSnapshot(codeInput || undefined);
      setSyncMsg(`הנתונים נמשכו מהענן (עדכון אחרון: ${new Date(updatedAt).toLocaleString("he-IL")}).`);
      setCodeInput("");
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "שגיאה במשיכה");
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
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <PageBanner icon={Settings} title="הגדרות" subtitle="ערכות נושא, אלגוריתם החזרה, גיבוי ושחזור נתונים." />

      <AccountSection />

      <ThemeStudio />

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
          העלה את הנתונים מהמכשיר הזה, ובמכשיר השני הדבק את קוד הסנכרון ומשוך. המשיכה מחליפה את הנתונים המקומיים.
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
          <button className="btn-primary" onClick={doPush} disabled={busy}>
            <CloudUpload className="h-4 w-4" /> העלאה לענן
          </button>
          <input className="input w-72" dir="ltr" placeholder="קוד סנכרון ממכשיר אחר (רשות)"
            value={codeInput} onChange={(e) => setCodeInput(e.target.value)} />
          <button className="btn-outline" onClick={doPull} disabled={busy}>
            <CloudDownload className="h-4 w-4" /> משיכה מהענן
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
