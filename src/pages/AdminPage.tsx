import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3, Check, Download, Eye, Library, MessageSquare, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Users, X,
} from "lucide-react";
import PageBanner from "../components/PageBanner";
import { supabase } from "../db/supabase";
import { db } from "../db";
import {
  FOUNDER_EMAILS, TOGGLABLE_TABS, type TabsConfig, adminUserAction, defaultTabsConfig,
  fetchTabsConfig, listAdmins, saveTabsConfig, setAdminRole,
} from "../db/admin";
import { useIsAdmin } from "../db/useIsAdmin";
import { useSession } from "../db/useSession";
import { defaultSrs } from "../features/study/srs";
import type { Card } from "../features/study/types";

interface ProfileRow { user_id: string; email: string | null; display_name: string | null; platform: string | null; created_at: string; last_seen_at: string }
interface UsageRow { user_id: string; email: string | null; kind: string; platform: string | null; at: string }
interface NoteRow { id: string; email: string | null; card_id: string | null; question: string | null; note: string; status: string; created_at: string }
interface SharedRow { id: string; email: string | null; card: Partial<Card>; status: string; created_at: string }

type Tab = "users" | "reports" | "notes" | "shared" | "display";

const fmtDate = (s: string) => new Date(s).toLocaleString("he-IL", { day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * מרכז ניהול רזה — נגיש רק לחשבונות המנהל (קבוע בקוד, בלי מטריצת הרשאות).
 * הנתונים מוגנים גם בשרת (RLS: רק מייל מנהל קורא את הטבלאות).
 */
export default function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("users");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [shared, setShared] = useState<SharedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const admin = useIsAdmin(session);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [userForm, setUserForm] = useState<{ userId: string | null; name: string; email: string; password: string } | null>(null);
  const [userBusy, setUserBusy] = useState(false);
  const [tabsCfg, setTabsCfg] = useState<TabsConfig>(defaultTabsConfig());
  const [tabsSaved, setTabsSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    setMsg("");
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [p, u, n, s] = await Promise.all([
        supabase.from("lemaan_profiles").select("*").order("last_seen_at", { ascending: false }),
        supabase.from("lemaan_usage").select("*").gte("at", since).order("at", { ascending: false }).limit(5000),
        supabase.from("lemaan_notes").select("*").order("created_at", { ascending: false }).limit(300),
        supabase.from("lemaan_shared_questions").select("*").order("created_at", { ascending: false }).limit(300),
      ]);
      setProfiles((p.data as ProfileRow[]) ?? []);
      try { setAdminEmails(await listAdmins()); } catch { /* ייכשל רק אם אינו מנהל */ }
      setTabsCfg(await fetchTabsConfig());
      setUsage((u.data as UsageRow[]) ?? []);
      setNotes((n.data as NoteRow[]) ?? []);
      setShared((s.data as SharedRow[]) ?? []);
      if (p.error) setMsg(`שגיאה: ${p.error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (admin) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  /** סיכומי שימוש פר-משתמש מתוך 30 הימים האחרונים. */
  const usagePerUser = useMemo(() => {
    const map = new Map<string, { email: string; opens: number; days: Set<string>; platforms: Set<string>; last: string }>();
    for (const u of usage) {
      const key = u.user_id;
      let e = map.get(key);
      if (!e) map.set(key, (e = { email: u.email ?? key.slice(0, 8), opens: 0, days: new Set(), platforms: new Set(), last: u.at }));
      e.opens++;
      e.days.add(u.at.slice(0, 10));
      if (u.platform) e.platforms.add(u.platform);
      if (u.at > e.last) e.last = u.at;
    }
    return [...map.values()].sort((a, b) => b.opens - a.opens);
  }, [usage]);

  const dailyActivity = useMemo(() => {
    const perDay = new Map<string, Set<string>>();
    for (const u of usage) {
      const d = u.at.slice(0, 10);
      if (!perDay.has(d)) perDay.set(d, new Set());
      perDay.get(d)!.add(u.user_id);
    }
    return [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [usage]);

  const resolveNote = async (note: NoteRow, status: "accepted" | "rejected") => {
    await supabase.from("lemaan_notes").update({ status, resolved_at: new Date().toISOString() }).eq("id", note.id);
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, status } : n)));
  };

  /** הוספת שאלה מהתור למאגר המקומי של המנהל (אם אינה שלו ממילא). */
  const importToLocal = async (row: SharedRow) => {
    const c = row.card;
    const mine = row.email && session?.user.email === row.email;
    if (mine || !c.question || (await db.cards.get(`shared-${row.id}`))) return;
    await db.cards.put({
      id: `shared-${row.id}`,
      type: (c.type as Card["type"]) ?? "flashcard",
      question: c.question,
      answer: c.answer ?? "",
      options: c.options ?? [],
      correctIndices: c.correctIndices ?? [],
      correct: null, categoryId: null, deckIds: [], tags: c.tags ?? [],
      masechta: c.masechta ?? null, daf: c.daf ?? null, amud: c.amud ?? null,
      createdAt: Date.now(), updatedAt: Date.now(),
      srs: defaultSrs(), stats: { totalReviews: 0, correct: 0, incorrect: 0 },
    });
  };

  /** אשר לכולם — מופץ אוטומטית לכל מכשיר מחובר. */
  const approveShared = async (row: SharedRow) => {
    await supabase.from("lemaan_shared_questions").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", row.id);
    await importToLocal(row);
    setShared((prev) => prev.map((s) => (s.id === row.id ? { ...s, status: "approved" } : s)));
  };

  /** הוסף רק אליי — נכנסת למאגר של המנהל בלבד, בלי הפצה. */
  const adminOnlyShared = async (row: SharedRow) => {
    await supabase.from("lemaan_shared_questions").update({ status: "admin_only" }).eq("id", row.id);
    await importToLocal(row);
    setShared((prev) => prev.map((s) => (s.id === row.id ? { ...s, status: "admin_only" } : s)));
  };

  const rejectShared = async (row: SharedRow) => {
    await supabase.from("lemaan_shared_questions").update({ status: "rejected" }).eq("id", row.id);
    setShared((prev) => prev.map((s) => (s.id === row.id ? { ...s, status: "rejected" } : s)));
  };

  const exportUsersCsv = () => {
    const csv = ["אימייל,שם,פלטפורמה,נרשם,נראה לאחרונה",
      ...profiles.map((p) => `${p.email ?? ""},${p.display_name ?? ""},${p.platform ?? ""},${fmtDate(p.created_at)},${fmtDate(p.last_seen_at)}`),
    ].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "משתמשים-למען.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!session) {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 pt-10 animate-fade-in">
        <ShieldCheck className="h-10 w-10 mx-auto text-gold" />
        <h2 className="font-display text-2xl font-bold">מרכז ניהול</h2>
        <p className="text-muted-foreground">נדרשת כניסה לחשבון מנהל.</p>
        <Link to="/login" className="btn-primary inline-flex">כניסה לחשבון</Link>
      </div>
    );
  }
  if (!admin) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 pt-10 animate-fade-in">
        <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-2xl font-bold">אין הרשאת ניהול</h2>
        <p className="text-muted-foreground text-sm">האזור פתוח לחשבון המנהל בלבד; הלימוד עצמו פתוח לכולם בכל האפליקציה.</p>
      </div>
    );
  }

  const pendingNotes = notes.filter((n) => n.status === "pending");
  const pendingShared = shared.filter((s) => s.status === "pending");

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <PageBanner icon={ShieldCheck} title="מרכז ניהול" subtitle="משתמשים, דוחות, הערות ושאלות מוצעות — בלי מטריצות הרשאה." />

      <div className="card-panel p-1.5 flex gap-1.5 flex-wrap">
        {([
          { id: "users", label: "משתמשים", icon: Users, badge: profiles.length },
          { id: "reports", label: "דוחות", icon: BarChart3, badge: 0 },
          { id: "notes", label: "הערות על שאלות", icon: MessageSquare, badge: pendingNotes.length },
          { id: "shared", label: "שאלות משתמשים", icon: Library, badge: pendingShared.length },
          { id: "display", label: "תצוגה", icon: Eye, badge: 0 },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "flex-1 h-10 rounded-lg bg-gradient-navy text-primary-foreground font-bold flex items-center justify-center gap-1.5 text-sm"
                : "flex-1 h-10 rounded-lg hover:bg-secondary font-medium flex items-center justify-center gap-1.5 text-sm transition-colors"
            }
          >
            <t.icon className="h-4 w-4" /> {t.label}
            {t.badge > 0 && <span className="text-xs rounded-full bg-gold/25 text-gold font-bold px-1.5">{t.badge}</span>}
          </button>
        ))}
        <button className="btn-outline h-10 w-10 p-0" title="רענון" onClick={load}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {msg && <p className="text-sm text-destructive">{msg}</p>}

      {/* ---- משתמשים ---- */}
      {tab === "users" && (
        <div className="gold-frame bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-bold text-lg">רשימת משתמשים ({profiles.length})</h3>
            <div className="flex gap-2">
              <button className="btn-gold h-9" onClick={() => setUserForm({ userId: null, name: "", email: "", password: "" })}>
                <Plus className="h-4 w-4" /> הוסף משתמש
              </button>
              <button className="btn-outline h-9" onClick={exportUsersCsv}><Download className="h-4 w-4" /> CSV</button>
            </div>
          </div>

          {userForm && (
            <div className="card-panel gold-frame space-y-2.5 animate-slide-in-down">
              <h4 className="font-semibold">{userForm.userId ? "עריכת משתמש" : "משתמש חדש"}</h4>
              <div className="grid md:grid-cols-3 gap-2">
                <input className="input" placeholder="שם (אופציונלי)" value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                <input className="input" dir="ltr" type="email" placeholder="אימייל"
                  value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                <input className="input" dir="ltr" type="text"
                  placeholder={userForm.userId ? "סיסמה חדשה (ריק = ללא שינוי)" : "סיסמה (6+ תווים)"}
                  value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">
                המשתמש ייכנס עם האימייל והסיסמה שקבעת — בלי צורך בהרשמה או באימות מייל.
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-primary h-9"
                  disabled={userBusy || !userForm.email.trim() || (!userForm.userId && userForm.password.length < 6)}
                  onClick={async () => {
                    setUserBusy(true);
                    setMsg("");
                    const res = await adminUserAction({
                      action: userForm.userId ? "update" : "create",
                      userId: userForm.userId ?? undefined,
                      email: userForm.email.trim(),
                      password: userForm.password || undefined,
                      name: userForm.name.trim() || undefined,
                    });
                    setUserBusy(false);
                    if (res.error) setMsg(`שגיאה: ${res.error}`);
                    else { setUserForm(null); await load(); }
                  }}
                >
                  {userForm.userId ? "שמור שינויים" : "צור משתמש"}
                </button>
                <button className="btn-outline h-9" onClick={() => setUserForm(null)}>ביטול</button>
              </div>
            </div>
          )}
          {profiles.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">{loading ? "טוען…" : "עדיין אין משתמשים רשומים (הרשימה מתמלאת מכניסות לאפליקציה)."}</p>
          ) : (
            <div className="space-y-2">
              {profiles.map((p) => {
                const u = usagePerUser.find((x) => x.email === (p.email ?? p.user_id.slice(0, 8)));
                return (
                  <div key={p.user_id} className="card-panel py-2.5 flex items-center gap-3 flex-wrap">
                    <span className="h-9 w-9 rounded-full bg-gradient-gold text-navy font-bold flex items-center justify-center shrink-0">
                      {(p.email ?? "?")[0].toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-40">
                      <p className="font-medium" dir="ltr">{p.email ?? p.user_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.display_name ? `${p.display_name} · ` : ""}{p.platform ?? "web"} · נרשם {fmtDate(p.created_at)}
                      </p>
                    </div>
                    <div className="text-xs text-left text-muted-foreground">
                      <p>כניסות (30 י'): <b className="text-foreground">{u?.opens ?? 0}</b> · ימים: <b className="text-foreground">{u?.days.size ?? 0}</b></p>
                      <p>נראה לאחרונה: {fmtDate(p.last_seen_at)}</p>
                    </div>
                    {(() => {
                      const email = p.email ?? "";
                      const founder = FOUNDER_EMAILS.includes(email);
                      const isAdm = founder || adminEmails.includes(email);
                      const toggle = async () => {
                        try {
                          await setAdminRole(email, !isAdm, session?.user.email ?? "");
                          setAdminEmails((prev) => (!isAdm ? [...prev, email] : prev.filter((e) => e !== email)));
                        } catch (e) {
                          setMsg(e instanceof Error ? e.message : "שגיאה");
                        }
                      };
                      return (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-xs font-bold rounded-full px-2 py-0.5 border ${isAdm ? "bg-gradient-gold text-navy border-transparent" : "text-muted-foreground"}`}>
                            {founder ? "מנהל ראשי" : isAdm ? "מנהל" : "רגיל"}
                          </span>
                          {!founder && email && (
                            <button className="btn-outline h-7 px-2 text-xs" onClick={toggle}>
                              {isAdm ? "הסר ניהול" : "הפוך למנהל"}
                            </button>
                          )}
                          {!isAdm && email && (
                            <button
                              className="btn-outline h-7 px-2 text-xs"
                              title="החלפת פרופיל תצוגה"
                              onClick={async () => {
                                const cur = tabsCfg.assignments[email] ?? "full";
                                const next: "full" | "basic" = cur === "full" ? "basic" : "full";
                                const cfg = { ...tabsCfg, assignments: { ...tabsCfg.assignments, [email]: next } };
                                try { await saveTabsConfig(cfg); setTabsCfg(cfg); } catch (e) { setMsg(e instanceof Error ? e.message : "שגיאה"); }
                              }}
                            >
                              {(tabsCfg.assignments[email] ?? "full") === "full" ? "מלא" : "מצומצם"}
                            </button>
                          )}
                          <button className="btn-ghost h-7 w-7 p-0" title="עריכת שם / מייל / סיסמה"
                            onClick={() => setUserForm({ userId: p.user_id, name: p.display_name ?? "", email, password: "" })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {!founder && (
                            <button className="btn-ghost h-7 w-7 p-0 text-destructive" title="מחיקת המשתמש"
                              onClick={async () => {
                                if (!confirm(`למחוק את ${email || p.user_id}? החשבון יימחק לצמיתות (הנתונים המקומיים במכשיר שלו יישארו).`)) return;
                                const res = await adminUserAction({ action: "delete", userId: p.user_id });
                                if (res.error) setMsg(`שגיאה: ${res.error}`);
                                else await load();
                              }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- דוחות ---- */}
      {tab === "reports" && (
        <div className="space-y-3">
          <div className="gold-frame bg-card p-4 space-y-3">
            <h3 className="font-bold text-lg">ניתוח שימוש — 30 הימים האחרונים</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">משתמשים פעילים</p><p className="font-bold text-gold text-lg">{usagePerUser.length}</p></div>
              <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">כניסות</p><p className="font-bold text-lg">{usage.length}</p></div>
              <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">ימים עם פעילות</p><p className="font-bold text-lg">{dailyActivity.length}</p></div>
              <div className="rounded-lg bg-secondary py-2.5"><p className="text-xs text-muted-foreground">משתמשים רשומים</p><p className="font-bold text-lg">{profiles.length}</p></div>
            </div>
            {dailyActivity.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1.5">משתמשים פעילים בכל יום</p>
                <div className="flex items-end gap-1 h-20 overflow-x-auto">
                  {dailyActivity.map(([day, users]) => (
                    <div key={day} className="flex flex-col items-center gap-0.5 shrink-0" title={`${day}: ${users.size}`}>
                      <span className="text-[9px] text-gold font-bold">{users.size}</span>
                      <div className="w-5 bg-gradient-gold rounded-t" style={{ height: `${Math.min(56, users.size * 14)}px` }} />
                      <span className="text-[8px] text-muted-foreground">{day.slice(8, 10)}.{day.slice(5, 7)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="gold-frame bg-card p-4 space-y-2">
            <h3 className="font-bold">פירוט לפי משתמש</h3>
            {usagePerUser.map((u) => (
              <div key={u.email} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5 gap-2 flex-wrap">
                <span dir="ltr" className="font-medium">{u.email}</span>
                <span className="text-muted-foreground text-xs">
                  {u.opens} כניסות · {u.days.size} ימים · {[...u.platforms].join("/") || "web"} · אחרונה {fmtDate(u.last)}
                </span>
              </div>
            ))}
            {usagePerUser.length === 0 && <p className="text-muted-foreground text-sm">אין נתוני שימוש עדיין.</p>}
          </div>
        </div>
      )}

      {/* ---- הערות על שאלות ---- */}
      {tab === "notes" && (
        <div className="gold-frame bg-card p-4 space-y-3">
          <h3 className="font-bold text-lg">הערות על שאלות ותשובות</h3>
          <p className="text-sm text-muted-foreground">דיווחים שנשלחו מכפתור "הערה" בתרגול. קבלה פותחת את השאלה לעריכה.</p>
          {notes.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">אין הערות.</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className={`card-panel py-3 space-y-1.5 ${n.status !== "pending" ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span dir="ltr">{n.email}</span>
                    <span>{fmtDate(n.created_at)} · {n.status === "pending" ? "ממתינה" : n.status === "accepted" ? "התקבלה" : "נדחתה"}</span>
                  </div>
                  {n.question && <p className="text-sm font-medium">{n.question}</p>}
                  <p className="text-sm bg-secondary rounded-md px-2.5 py-1.5">{n.note}</p>
                  {n.status === "pending" && (
                    <div className="flex gap-2">
                      <Link
                        to={`/questions?q=${encodeURIComponent((n.question ?? "").slice(0, 40))}`}
                        className="btn-primary h-8 text-xs"
                        onClick={() => resolveNote(n, "accepted")}
                      >
                        <Check className="h-3.5 w-3.5" /> קבל ופתח לעריכה
                      </Link>
                      <button className="btn-outline h-8 text-xs" onClick={() => resolveNote(n, "rejected")}>
                        <X className="h-3.5 w-3.5" /> דחה
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- שאלות משתמשים ---- */}
      {tab === "shared" && (
        <div className="gold-frame bg-card p-4 space-y-3">
          <h3 className="font-bold text-lg">שאלות ממתינות להחלטה</h3>
          <p className="text-sm text-muted-foreground">
            כל שאלה חדשה — של כל משתמש, כולל המנהל — מגיעה לכאן. "אשר לכולם" מפיץ לכל מכשיר; "הוסף רק אליי" מכניס רק למאגר שלך; היוצר תמיד שומר עותק אצלו.
          </p>
          {shared.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">אין שאלות מוצעות.</p>
          ) : (
            <div className="space-y-2">
              {shared.map((s) => (
                <div key={s.id} className={`card-panel py-3 space-y-1.5 ${s.status !== "pending" ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span dir="ltr">{s.email}</span>
                    <span>
                      {s.card.masechta ? `${s.card.masechta}${s.card.daf ? ` · דף ${s.card.daf}` : ""} · ` : ""}
                      {fmtDate(s.created_at)} · {
                        s.status === "pending" ? "ממתינה" :
                        s.status === "approved" ? "אושרה לכולם" :
                        s.status === "admin_only" ? "נוספה רק למנהל" : "נדחתה"
                      }
                    </span>
                  </div>
                  <p className="text-sm font-medium">{s.card.question}</p>
                  {(s.card.options?.length ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">{s.card.options!.join(" · ")}</p>
                  )}
                  {s.status === "pending" && (
                    <div className="flex gap-2 flex-wrap">
                      <button className="btn h-8 text-xs bg-gradient-gold text-navy shadow-gold hover:opacity-90" onClick={() => approveShared(s)}>
                        <Check className="h-3.5 w-3.5" /> אשר לכולם
                      </button>
                      <button className="btn-primary h-8 text-xs" onClick={() => adminOnlyShared(s)}>
                        <Check className="h-3.5 w-3.5" /> הוסף רק אליי
                      </button>
                      <button className="btn-outline h-8 text-xs" onClick={() => rejectShared(s)}>
                        <X className="h-3.5 w-3.5" /> דחה
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* ---- תצוגה: שני פרופילי טאבים ללומדים ---- */}
      {tab === "display" && (
        <div className="gold-frame bg-card p-4 space-y-4">
          <div>
            <h3 className="font-bold text-lg">אילו טאבים לומדים רואים</h3>
            <p className="text-sm text-muted-foreground">
              שני פרופילים בלבד — מלא ומצומצם; משייכים לומד לפרופיל ברשימת המשתמשים. מנהלים רואים תמיד הכל, "בית" מוצג תמיד.
            </p>
          </div>

          {(["full", "basic"] as const).map((prof) => (
            <div key={prof} className="space-y-1.5">
              <p className="font-semibold text-sm">{prof === "full" ? "🟡 פרופיל מלא (ברירת מחדל)" : "🔵 פרופיל מצומצם"}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {TOGGLABLE_TABS.map((t) => {
                  const on = tabsCfg[prof].includes(t.to);
                  return (
                    <label key={t.to} className={`card-panel py-2 px-3 flex items-center gap-2 cursor-pointer ${on ? "" : "opacity-50"}`}>
                      <input
                        type="checkbox"
                        className="accent-[hsl(var(--gold))] h-4 w-4"
                        checked={on}
                        onChange={(e) =>
                          setTabsCfg((c) => ({
                            ...c,
                            [prof]: e.target.checked ? [...c[prof], t.to] : c[prof].filter((x) => x !== t.to),
                          }))
                        }
                      />
                      <span className="font-medium text-sm">{t.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 text-sm">
            אורחים (ללא חשבון) רואים:
            <select
              className="input w-40 h-9"
              value={tabsCfg.guest}
              onChange={(e) => setTabsCfg((c) => ({ ...c, guest: e.target.value as "full" | "basic" }))}
            >
              <option value="full">פרופיל מלא</option>
              <option value="basic">פרופיל מצומצם</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-primary h-10"
              onClick={async () => {
                try {
                  await saveTabsConfig(tabsCfg);
                  setTabsSaved(true);
                  setTimeout(() => setTabsSaved(false), 2500);
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "שגיאה בשמירה");
                }
              }}
            >
              שמור תצוגה
            </button>
            {tabsSaved && <span className="text-sm text-gold font-medium animate-fade-in">✓ נשמר — ייכנס לתוקף אצל הלומדים בטעינה הבאה</span>}
          </div>
        </div>
      )}
    </div>
  );
}
