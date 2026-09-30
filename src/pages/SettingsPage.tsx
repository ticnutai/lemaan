import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Brain, Download, Settings, Upload } from "lucide-react";
import { db, setSetting } from "../db";
import type { SrsAlgorithm } from "../features/study/srs";

export default function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const algorithm = useLiveQuery(async () => ((await db.settings.get("srs-algo"))?.value ?? "sm2") as SrsAlgorithm, []);

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
      <h2 className="font-display text-3xl font-bold flex items-center gap-3">
        <Settings className="h-7 w-7 text-gold" /> הגדרות
      </h2>

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

      <div className="card-panel border-destructive/50 space-y-3">
        <h3 className="font-semibold flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /> אזור מסוכן</h3>
        <button className="btn bg-destructive text-destructive-foreground hover:opacity-90" onClick={resetAll}>
          מחיקת כל הנתונים
        </button>
      </div>
    </div>
  );
}
