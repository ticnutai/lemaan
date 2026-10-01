import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchIsAdmin, isFounder } from "./admin";

/**
 * האם המשתמש הנוכחי מנהל: חשבונות המייסד מידית (בלי הבהוב),
 * מנהלים שמונו מהממשק — אחרי אימות מול השרת.
 */
export function useIsAdmin(session: Session | null): boolean {
  const [remoteAdmin, setRemoteAdmin] = useState(false);
  useEffect(() => {
    setRemoteAdmin(false);
    if (!session || isFounder(session)) return;
    let alive = true;
    fetchIsAdmin().then((v) => { if (alive) setRemoteAdmin(v); });
    return () => { alive = false; };
  }, [session]);
  return isFounder(session) || remoteAdmin;
}
