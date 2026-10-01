import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, LogOut, Sparkles, UserPlus } from "lucide-react";
import { supabase } from "../db/supabase";
import { useSession } from "../db/useSession";

/** כפתור גוגל עם הלוגו הצבעוני. */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

/**
 * עמוד הכניסה — כל האפשרויות במקום אחד: Google, אימייל+סיסמה והרשמה.
 * אין כאן מידע רגיש, לכן הדרישה היחידה היא 6 תווים (מגבלת השרת).
 */
export default function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

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
      setMsg(`שגיאה: ${raw || "נסה שוב"}`);
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
      navigate("/");
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      setMsg(
        raw.includes("Invalid login credentials") ? "אימייל או סיסמה שגויים" :
        raw.includes("already registered") ? "האימייל כבר רשום — נסה להתחבר" :
        raw.includes("at least 6") || raw.includes("6 characters") ? "הסיסמה צריכה להיות באורך 6 תווים לפחות" :
        `שגיאה: ${raw || "נסה שוב"}`
      );
    } finally {
      setBusy(false);
    }
  };

  // מחובר כבר — מצב חשבון
  if (session) {
    return (
      <div className="max-w-md mx-auto space-y-5 animate-fade-in text-center pt-8">
        <div className="h-16 w-16 mx-auto rounded-full bg-gradient-gold shadow-gold flex items-center justify-center text-navy font-display text-2xl font-bold">
          {(session.user.email ?? "?")[0].toUpperCase()}
        </div>
        <h2 className="font-display text-2xl font-bold">מחובר לחשבון</h2>
        <p className="text-sm text-muted-foreground" dir="ltr">{session.user.email}</p>
        <p className="text-xs text-muted-foreground">
          הסנכרון קשור לחשבון: התחבר באותו חשבון בכל מכשיר והנתונים יגיעו אוטומטית.
        </p>
        <div className="flex justify-center gap-2">
          <button className="btn-primary" onClick={() => navigate("/")}>לדף הבית</button>
          <button className="btn-outline" disabled={busy} onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4" /> התנתקות
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-5 animate-fade-in pt-4">
      <div className="text-center space-y-1.5">
        <div className="h-14 w-14 mx-auto rounded-full bg-gradient-gold shadow-gold flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-navy" />
        </div>
        <h2 className="font-display text-2xl font-bold">{mode === "login" ? "כניסה לחשבון" : "יצירת חשבון"}</h2>
        <p className="text-sm text-muted-foreground">
          אופציונלי — האפליקציה עובדת גם בלי חשבון. חשבון מסנכרן אוטומטית בין המכשירים.
        </p>
      </div>

      <div className="gold-frame bg-card p-5 space-y-4">
        <button className="btn-outline w-full h-11 justify-center" disabled={busy} onClick={googleLogin}>
          <GoogleIcon /> המשך עם Google
        </button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex-1 border-t" /> או באימייל <span className="flex-1 border-t" />
        </div>

        <div className="space-y-2.5">
          <input
            className="input h-11"
            type="email"
            dir="ltr"
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input h-11"
            type="password"
            dir="ltr"
            placeholder="סיסמה (6 תווים ומעלה, כל צירוף)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email && password && submit()}
          />
          <button className="btn-primary w-full h-11 justify-center" disabled={busy || !email || !password} onClick={submit}>
            {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {mode === "login" ? "התחברות" : "הרשמה"}
          </button>
        </div>

        {msg && <p className="text-sm font-medium text-center">{msg}</p>}

        <button
          className="btn-ghost w-full h-9 text-sm justify-center"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(""); }}
        >
          {mode === "login" ? "אין לך חשבון? הרשמה" : "יש לך חשבון? התחברות"}
        </button>
      </div>
    </div>
  );
}
