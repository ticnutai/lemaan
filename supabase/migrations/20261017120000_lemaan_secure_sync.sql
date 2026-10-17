-- סנכרון מאובטח ומדורג לאתר "למען".
--
-- 1. הטבלה הישנה lemaan_sync (גיבוי מלא אחד לכל קוד) הייתה פתוחה לקריאה לכל מי שמחזיק במפתח הציבורי
--    של האתר — כל הגיבויים של כל הלומדים. כאן היא נסגרת לגמרי לגישה ישירה; קריאה של גיבוי ישן אפשרית
--    רק דרך פונקציה שמקבלת את הקוד המדויק ומחזירה רק אותו (כדי להעביר גיבויים ישנים לשיטה החדשה).
-- 2. טבלה חדשה lemaan_user_items: כל פריט אישי בשורה נפרדת (התקדמות בשאלה, תשובה ביומן, הגדרה...),
--    עם זמן שינוי. רק הפריטים שהשתנו נשלחים, ושני מכשירים מתמזגים בלי לאבד מידע.
--    אין גישה ישירה לטבלה — רק דרך שתי פונקציות (משיכה ושליחה) שבודקות הרשאה:
--      * קוד שהוא מזהה של חשבון רשום — רק כשהחשבון הזה מחובר;
--      * קוד אקראי (מכשיר בלי חשבון) — מי שמחזיק בקוד (36 תווים אקראיים, לא ניתן לנחש).

-- ───────────── 1. סגירת הטבלה הישנה ─────────────
alter table public.lemaan_sync enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'lemaan_sync' loop
    execute format('drop policy %I on public.lemaan_sync', p.policyname);
  end loop;
end $$;

revoke all on public.lemaan_sync from anon, authenticated;

-- מי רשאי לגשת לנתונים של קוד מסוים
create or replace function public.lemaan_sync_allowed(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_code is null or length(p_code) < 32 then false
    when exists (select 1 from auth.users u where u.id::text = p_code) then auth.uid()::text = p_code
    else true
  end;
$$;

revoke all on function public.lemaan_sync_allowed(text) from public;

-- גיבוי ישן לפי קוד (רק לשורה של הקוד הזה) — להעברה חד־פעמית לשיטה החדשה
create or replace function public.lemaan_sync_legacy_pull(p_code text)
returns table (payload text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.lemaan_sync_allowed(p_code) then
    raise exception 'אין הרשאה' using errcode = '42501';
  end if;
  return query select s.payload::text, s.updated_at from public.lemaan_sync s where s.sync_code = p_code;
end;
$$;

revoke all on function public.lemaan_sync_legacy_pull(text) from public;
grant execute on function public.lemaan_sync_legacy_pull(text) to anon, authenticated;

-- ───────────── 2. הטבלה החדשה ─────────────
create table if not exists public.lemaan_user_items (
  owner      text        not null,
  kind       text        not null,
  item_id    text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  changed_at bigint      not null,                         -- זמן השינוי במכשיר (מילישניות) — מי שחדש יותר מנצח
  updated_at timestamptz not null default clock_timestamp(), -- זמן ההגעה לשרת — סמן למשיכה הבאה
  primary key (owner, kind, item_id)
);

create index if not exists lemaan_user_items_owner_updated on public.lemaan_user_items (owner, updated_at);

alter table public.lemaan_user_items enable row level security;
revoke all on public.lemaan_user_items from anon, authenticated;

-- משיכה: כל מה שהגיע לשרת אחרי הסמן (בחלקים של עד 2000)
create or replace function public.lemaan_sync_pull(p_code text, p_since timestamptz)
returns table (kind text, item_id text, data jsonb, deleted boolean, changed_at bigint, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.lemaan_sync_allowed(p_code) then
    raise exception 'אין הרשאה' using errcode = '42501';
  end if;
  return query
    select i.kind, i.item_id, i.data, i.deleted, i.changed_at, i.updated_at
    from public.lemaan_user_items i
    where i.owner = p_code and i.updated_at > coalesce(p_since, 'epoch'::timestamptz)
    order by i.updated_at
    limit 2000;
end;
$$;

revoke all on function public.lemaan_sync_pull(text, timestamptz) from public;
grant execute on function public.lemaan_sync_pull(text, timestamptz) to anon, authenticated;

-- שליחה: מערך פריטים [{kind, item_id, data, deleted, changed_at}]. פריט נשמר רק אם הוא חדש יותר
-- ממה שכבר בשרת (כך מכשיר עם שינוי ישן לא דורס שינוי חדש ממכשיר אחר).
create or replace function public.lemaan_sync_push(p_code text, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.lemaan_sync_allowed(p_code) then
    raise exception 'אין הרשאה' using errcode = '42501';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'יותר מדי פריטים בבת אחת' using errcode = '22023';
  end if;
  insert into public.lemaan_user_items as t (owner, kind, item_id, data, deleted, changed_at, updated_at)
  select p_code, x.kind, x.item_id, x.data, coalesce(x.deleted, false), x.changed_at, clock_timestamp()
  from jsonb_to_recordset(p_items) as x(kind text, item_id text, data jsonb, deleted boolean, changed_at bigint)
  where x.kind is not null and x.item_id is not null and x.changed_at is not null
  on conflict (owner, kind, item_id) do update
    set data = excluded.data, deleted = excluded.deleted, changed_at = excluded.changed_at, updated_at = clock_timestamp()
    where t.changed_at < excluded.changed_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.lemaan_sync_push(text, jsonb) from public;
grant execute on function public.lemaan_sync_push(text, jsonb) to anon, authenticated;
