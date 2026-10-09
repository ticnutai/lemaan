import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { flushAmudSorts, pullAmudSorts } from "../db/amudSort";
import { useStudySession } from "../features/study/activeSession";
import { useTheme } from "../theme/ThemeProvider";
import { useAutoImport } from "../db/useAutoImport";
import { useSession } from "../db/useSession";
import { fetchTabsConfig, logAppOpen, pullApprovedQuestions, tabsForUser } from "../db/admin";
import { useIsAdmin } from "../db/useIsAdmin";
import { CalendarDays, FolderTree, GraduationCap, HelpCircle, Home, Landmark, LineChart, Menu, Moon, Settings, LayoutGrid, ShieldCheck, Sparkles, Sun, Target, Timer, UserRound, X } from "lucide-react";
import { cn } from "../lib/utils";

const nav = [
  { to: "/", label: "בית", icon: Home },
  { to: "/study", label: "תרגול", icon: GraduationCap },
  { to: "/calendar", label: "חזרות", icon: CalendarDays },
  { to: "/quiz", label: "בניית מבחנים", icon: Timer },
  { to: "/shas", label: 'הש"ס', icon: Landmark },
  { to: "/shas-board", label: 'לוח הש"ס', icon: LayoutGrid },
  { to: "/goals", label: "יעדים", icon: Target },
  { to: "/questions", label: "בניית שאלות", icon: HelpCircle },
  { to: "/categories", label: "קטגוריות", icon: FolderTree },
  { to: "/stats", label: "התקדמות", icon: LineChart },
  { to: "/settings", label: "הגדרות", icon: Settings },
];

export default function Layout() {
  // ניהול הערכה נמצא ב-ThemeProvider בלבד; הכפתור כאן רק מחליף בהיר/כהה
  const { themeId, setTheme } = useTheme();
  const lastLight = useRef(themeId !== "midnight-gold" ? themeId : "royal-navy");
  if (themeId !== "midnight-gold") lastLight.current = themeId;
  const isDark = themeId === "midnight-gold";
  const { importing, progress } = useAutoImport();
  const session = useSession();
  const admin = useIsAdmin(session);
  // אילו טאבים לומדים רואים — לפי הפרופיל (מלא/מצומצם); מנהל רואה הכל תמיד
  const [visibleTabs, setVisibleTabs] = useState<string[] | null>(null);
  useEffect(() => {
    fetchTabsConfig().then((cfg) => setVisibleTabs(tabsForUser(cfg, session?.user.email)));
  }, [session]);
  // רישום נוכחות ומשיכת שאלות מאושרות — פעם אחת לכל כניסה מחוברת
  useEffect(() => {
    if (!session) return;
    void logAppOpen(session);
    void pullApprovedQuestions();
    void flushAmudSorts(); // מיון לעמודים שנעשה בלי חיבור — נשלח עכשיו
  }, [session]);
  // מיון לעמודים שנעשה במכשירים אחרים — לכל המשתמשים, אחרי שהמאגר נטען
  useEffect(() => {
    if (!importing) void pullAmudSorts();
  }, [importing]);

  // תפריט צדדי בטלפון: נפתח מכפתור בכותרת, נסגר במעבר עמוד
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // תרגול פעיל ופתחת מסך אחר (למשל הגמרא) — כפתור חזרה לאותה שאלה
  const activeQueue = useStudySession((s) => s.queue);
  const activeIndex = useStudySession((s) => s.index);
  const showResume = !!activeQueue && activeIndex < activeQueue.length && location.pathname !== "/study";

  return (
    <div className="min-h-screen flex flex-col">
      {/* פס התקדמות ייבוא — מוצג בכל עמוד בזמן הייבוא הראשוני */}
      {importing && (
        <div className="fixed top-0 inset-x-0 z-50">
          <div className="h-1.5 bg-muted">
            <div
              className="h-full bg-gradient-gold transition-all"
              style={{ width: progress && progress.total ? `${Math.round((progress.done / progress.total) * 100)}%` : "15%" }}
            />
          </div>
          <p className="text-center text-xs bg-card/95 border-b py-1 text-muted-foreground">
            טוען את מאגר השאלות ({progress ? `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}` : "מתחיל"})…
          </p>
        </div>
      )}
      {/* Top header bar */}
      <header className="h-14 shrink-0 border-b bg-card flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <button
            className="md:hidden h-9 w-9 rounded-full border border-gold/60 bg-card flex items-center justify-center hover:bg-secondary"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "סגירת התפריט" : "פתיחת התפריט"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-4 w-4 text-gold" /> : <Menu className="h-4 w-4 text-gold" />}
          </button>
          <div className="h-9 w-9 rounded-full bg-gradient-gold shadow-gold flex items-center justify-center">
            <Sparkles className="h-4.5 w-4 text-navy" />
          </div>
          <div className="leading-tight">
            <span className="font-display text-lg font-bold">למען</span>
            <span className="block text-[11px] text-muted-foreground -mt-0.5">מערכת לימוד וחזרות</span>
          </div>
        </div>
        <button
          className="h-9 w-9 rounded-full border border-gold/60 bg-card flex items-center justify-center hover:bg-secondary transition-colors"
          title={isDark ? "מצב בהיר" : "מצב כהה"}
          onClick={() => setTheme(isDark ? lastLight.current : "midnight-gold")}
        >
          {isDark ? <Sun className="h-4 w-4 text-gold" /> : <Moon className="h-4 w-4 text-gold" />}
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Right sidebar: label on the right, icon circle on the left, like the original */}
        {menuOpen && <div className="md:hidden fixed inset-0 top-14 z-30 bg-black/40" onClick={() => setMenuOpen(false)} aria-hidden />}
        <aside
          className={cn(
            "w-52 shrink-0 border-l bg-card flex-col",
            menuOpen ? "flex fixed top-14 bottom-0 right-0 z-40 shadow-elegant" : "hidden",
            "md:flex md:static md:shadow-none"
          )}
        >
          <nav className="flex-1 p-3 space-y-1.5 overflow-auto">
            {[...nav.filter((n) => admin || n.to === "/" || !visibleTabs || visibleTabs.includes(n.to)),
               ...(admin ? [{ to: "/admin", label: "ניהול", icon: ShieldCheck }] : [])].map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center justify-between gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-medium transition-colors",
                    isActive ? "bg-gradient-navy text-primary-foreground shadow-elegant" : "hover:bg-secondary"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span>{label}</span>
                    <span
                      className={cn(
                        "h-9 w-9 rounded-full flex items-center justify-center border transition-colors",
                        isActive ? "border-gold/60 bg-navy-soft text-gold" : "border-gold/50 bg-card text-navy dark:text-gold"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* כרטיס חשבון בתחתית הסיידבר — כמו במקור */}
          <div className="p-3 border-t">
            <NavLink
              to="/login"
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between gap-2 rounded-xl border p-2 transition-colors",
                  isActive ? "border-gold shadow-gold bg-secondary/60" : "border-gold/40 hover:border-gold hover:bg-secondary"
                )
              }
              title={session ? (admin ? "החשבון שלי · מנהל" : "החשבון שלי · משתמש רגיל") : "כניסה לחשבון"}
            >
              <span className="min-w-0 text-right">
                {session ? (
                  <>
                    <span className="block text-xs font-medium truncate" dir="ltr">{session.user.email}</span>
                    {/* סוג החשבון: מנהל / משתמש רגיל */}
                    {admin ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-gold/20 text-gold px-1.5 py-px text-[10px] font-bold">
                        <ShieldCheck className="h-3 w-3" /> מנהל
                      </span>
                    ) : (
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-secondary text-muted-foreground px-1.5 py-px text-[10px] font-medium">
                        <UserRound className="h-3 w-3" /> משתמש רגיל
                      </span>
                    )}
                  </>
                ) : (
                  <span className="block text-sm font-medium">כניסה לחשבון</span>
                )}
              </span>
              <span className="h-9 w-9 shrink-0 rounded-full bg-gradient-gold shadow-gold flex items-center justify-center text-navy font-bold">
                {session ? (session.user.email ?? "?")[0].toUpperCase() : <UserRound className="h-4 w-4" />}
              </span>
            </NavLink>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-3 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {showResume && (
        <Link
          to="/study"
          className="fixed bottom-4 left-4 z-40 btn-gold rounded-full shadow-gold h-11 px-4"
        >
          <GraduationCap className="h-4 w-4" /> חזרה לתרגול · {activeIndex + 1}/{activeQueue!.length}
        </Link>
      )}
    </div>
  );
}
