// גשר: ההרשאות של הקוד המקורי לפי האתר שלנו — כל משתמש עושה הכל בנתונים שלו,
// והאפשרויות שמסומנות במקור "רק למנהל" מוצגות רק למנהל שלנו.
import { useSession } from "../../db/useSession";
import { useIsAdmin } from "../../db/useIsAdmin";

export type PermissionModule = "decks" | "cards" | "goals" | "shas" | "analytics" | "users" | "roles" | "settings";
export type PermissionAction = "view" | "create" | "edit" | "delete" | "manage";

export function usePermissions() {
  const session = useSession();
  const isAdmin = useIsAdmin(session);
  const can = (m: PermissionModule, _a: PermissionAction) => isAdmin || (m !== "users" && m !== "roles");
  return {
    isAdmin,
    viewerIsAdmin: isAdmin,
    matrix: {} as Record<string, boolean>,
    roles: [] as { id: string; name: string }[],
    loading: false,
    accessKind: (isAdmin ? "admin" : session ? "registered" : "offline") as string,
    previewRoleId: undefined as string | undefined,
    can,
    presentationIsAdmin: isAdmin,
    presentationRoles: [] as { id: string; name: string }[],
    canPresent: can,
    reload: async () => {},
  };
}

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
