import { useEffect, useState } from "react";
import { LogIn, LogOut, UserPlus, UserRound } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../db/supabase";

export default function AccountSection() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const googleLogin = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      setMsg(raw.includes("not enabled") || raw.includes("provider")
        ? "כניסת Google עדיין לא הוגדרה בשרת — השתמש באימייל וסיסמה בינתיים"
        : `שגיאה: ${raw || "נסה שוב"}`);
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { error } =
        mode === "signup"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMsg(mode === "signup" ? "החשבון נוצר והתחברת!" : "התחברת בהצלחה!");
      setEmail("");
      setPassword("");
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      setMsg(
        raw.includes("Invalid login credentials") ? "אימייל או סיסמה שגויים" :
        raw.includes("already registered") ? "האימייל כבר רשום — נסה להתחבר" :
        raw.includes("at least 6") ? "הסיסמה צריכה להיות באורך 6 תווים לפחות" :
        `שגיאה: ${raw || "נסה שוב"}`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-panel space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <UserRound className="h-4 w-4 text-gold" /> חשבון
      </h3>

      {session ? (
        <div className="space-y-2">
          <p className="text-sm">
            מחובר בתור <span className="font-medium">{session.user.email}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            הסנכרון קשור לחשבון: התחבר באותו חשבון בכל מכשיר — "העלאה לענן" ו"משיכה מהענן" יגיעו אוטומטית לאותם נתונים, בלי קוד ידני.
          </p>
          <button className="btn-outline h-9" disabled={busy} onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4" /> התנתקות
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            אופציונלי — האפליקציה עובדת גם בלי חשבון. חשבון הופך את הסנכרון בין מכשירים לאוטומטי.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className="input w-60"
              type="email"
              dir="ltr"
              placeholder="אימייל"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="input w-44"
              type="password"
              dir="ltr"
              placeholder="סיסמה (6+ תווים)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email && password && submit()}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary h-9" disabled={busy || !email || !password} onClick={submit}>
              {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {mode === "login" ? "התחברות" : "הרשמה"}
            </button>
            <button className="btn-outline h-9" disabled={busy} onClick={googleLogin}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              כניסה עם Google
            </button>
            <button
              className="btn-ghost h-9 text-xs"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "אין לך חשבון? הרשמה" : "יש לך חשבון? התחברות"}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-sm font-medium">{msg}</p>}
    </div>
  );
}
