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
          <div className="flex gap-2">
            <button className="btn-primary h-9" disabled={busy || !email || !password} onClick={submit}>
              {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {mode === "login" ? "התחברות" : "הרשמה"}
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
