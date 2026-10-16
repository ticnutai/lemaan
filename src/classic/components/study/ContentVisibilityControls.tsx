import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { hiddenCardIds, setAdminCardHidden, setPersonalCardHidden, visibilityOwner } from '@/lib/study/contentVisibility';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function ContentVisibilityControls({ cardId }: { cardId?: string }) {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [, render] = useState(0);
  const uid = visibilityOwner(user?.id);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); toast.success('התצוגה עודכנה — השאלה לא נמחקה'); render((n) => n + 1); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'לא ניתן לשמור בענן כרגע'); }
    finally { setBusy(false); }
  };
  const adminChange = async (hidden: boolean) => {
    let targetId: string | null = null;
    if (target.trim()) {
      const { data, error } = await supabase.from('profiles').select('id').eq('username', target.trim().toLowerCase()).single();
      if (error || !data) throw new Error('שם המשתמש לא נמצא');
      targetId = data.id;
    }
    await setAdminCardHidden(cardId!, hidden, targetId);
  };
  return <div className="space-y-2 rounded-lg border p-3" dir="rtl">
    <p className="font-semibold">הסתרת שאלות ללא מחיקה</p>
    {cardId ? <>
      <Button variant="outline" disabled={busy} onClick={() => void run(() => setPersonalCardHidden(uid, cardId, true))}>הסתר רק אצלי</Button>
      {isAdmin && <div className="space-y-2">
        <Input aria-label="משתמש להסתרה" placeholder="שם משתמש מסוים — ריק עבור כולם" value={target} onChange={(e) => setTarget(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void run(() => adminChange(true))}>הסתר {target.trim() ? 'מהמשתמש' : 'מכולם'}</Button>
          <Button disabled={busy} variant="outline" onClick={() => void run(() => adminChange(false))}>בטל הסתרת מנהל</Button>
        </div>
      </div>}
    </> : <>
      <p className="text-sm">שאלות שהסתרת יישארו במאגר. ניתן להציג אותן מחדש; הסתרת מנהל אינה ניתנת לביטול כאן.</p>
      <Button disabled={busy} variant="outline" onClick={() => void run(async () => {
        for (const id of hiddenCardIds(uid, true)) await setPersonalCardHidden(uid, id, false);
      })}>הצג מחדש את השאלות שהסתרתי</Button>
    </>}
  </div>;
}
