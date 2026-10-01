import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { supabase } from "../db/supabase";
import { useSession } from "../db/useSession";

/** מצב החשבון בהגדרות — הטופס המלא נמצא בעמוד הכניסה (/login). */
export default function AccountSection() {
  const session = useSession();
  const [busy, setBusy] = useState(false);

  return (
    <div className="card-panel space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <UserRound className="h-4 w-4 text-gold" /> חשבון
      </h3>

      {session ? (
        <div className="space-y-2">
          <p className="text-sm">
            מחובר בתור <span className="font-medium" dir="ltr">{session.user.email}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            הסנכרון קשור לחשבון: התחבר באותו חשבון בכל מכשיר — "העלאה לענן" ו"משיכה מהענן" יגיעו אוטומטית לאותם נתונים, בלי קוד ידני.
          </p>
          <button
            className="btn-outline h-9"
            disabled={busy}
            onClick={async () => { setBusy(true); await supabase.auth.signOut(); setBusy(false); }}
          >
            <LogOut className="h-4 w-4" /> התנתקות
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            אופציונלי — האפליקציה עובדת גם בלי חשבון. חשבון הופך את הסנכרון בין מכשירים לאוטומטי.
          </p>
          <Link to="/login" className="btn-primary h-9 inline-flex">
            <LogIn className="h-4 w-4" /> כניסה / הרשמה
          </Link>
        </div>
      )}
    </div>
  );
}
