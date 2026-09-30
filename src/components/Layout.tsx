import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, FolderTree, GraduationCap, HelpCircle, Home, LineChart, Moon, Settings, Sparkles, Sun, Timer } from "lucide-react";
import { cn } from "../lib/utils";

const nav = [
  { to: "/", label: "בית", icon: Home },
  { to: "/study", label: "תרגול", icon: GraduationCap },
  { to: "/calendar", label: "חזרות", icon: CalendarDays },
  { to: "/quiz", label: "מבחנים", icon: Timer },
  { to: "/questions", label: "בניית שאלות", icon: HelpCircle },
  { to: "/categories", label: "קטגוריות", icon: FolderTree },
  { to: "/stats", label: "התקדמות", icon: LineChart },
  { to: "/settings", label: "הגדרות", icon: Settings },
];

export default function Layout() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") ?? "royal-navy");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "midnight-gold");
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top header bar */}
      <header className="h-14 shrink-0 border-b bg-card flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
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
          title={theme === "royal-navy" ? "מצב כהה" : "מצב בהיר"}
          onClick={() => setTheme(theme === "royal-navy" ? "midnight-gold" : "royal-navy")}
        >
          {theme === "royal-navy" ? <Moon className="h-4 w-4 text-gold" /> : <Sun className="h-4 w-4 text-gold" />}
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Right sidebar: label on the right, icon circle on the left, like the original */}
        <aside className="w-52 shrink-0 border-l bg-card flex flex-col">
          <nav className="flex-1 p-3 space-y-1.5 overflow-auto">
            {nav.map(({ to, label, icon: Icon }) => (
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
        </aside>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
