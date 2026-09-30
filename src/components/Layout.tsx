import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, GraduationCap, Home, ListChecks, Moon, Settings, Sun, Timer, TrendingUp, FolderTree } from "lucide-react";
import { cn } from "../lib/utils";

const nav = [
  { to: "/", label: "בית", icon: Home },
  { to: "/study", label: "חזרה", icon: GraduationCap },
  { to: "/quiz", label: "מבחן", icon: Timer },
  { to: "/questions", label: "שאלות", icon: ListChecks },
  { to: "/categories", label: "מסכתות", icon: FolderTree },
  { to: "/stats", label: "סטטיסטיקות", icon: TrendingUp },
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
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-l bg-card flex flex-col shadow-elegant">
        <div className="p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-gold shadow-gold flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-navy" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold">למען</h1>
              <p className="text-xs text-muted-foreground">חזרה על שאלות ותשובות</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-gradient-navy text-primary-foreground shadow-elegant" : "hover:bg-secondary"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t">
          <button
            className="btn-ghost w-full justify-start"
            onClick={() => setTheme(theme === "royal-navy" ? "midnight-gold" : "royal-navy")}
          >
            {theme === "royal-navy" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {theme === "royal-navy" ? "מצב כהה" : "מצב בהיר"}
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
