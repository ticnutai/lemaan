// גשר: במקור הדף הזה דורש התחברות. אצלנו הנתונים נשמרים במכשיר גם בלי חשבון — ולכן הדף פתוח לכולם.
import type { ReactNode } from "react";

export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default RequireAuth;
