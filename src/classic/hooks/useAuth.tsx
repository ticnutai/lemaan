// גשר: החשבון של האתר שלנו, בצורה שהקוד המקורי מצפה לה (user / session / loading).
import type { Session, User } from "@supabase/supabase-js";
import { useSession } from "../../db/useSession";

export function useAuth(): { user: User | null; session: Session | null; loading: boolean; isGuest: boolean } {
  const session = useSession();
  return { user: session?.user ?? null, session, loading: false, isGuest: !session };
}
