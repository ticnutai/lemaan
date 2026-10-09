-- מיון שאלות לעמוד א'/ב' — טבלה משותפת לכל המכשירים ולכל הלומדים.
-- כל שורה: מזהה שאלה + העמוד שלה ("1" = עמוד א', "2" = עמוד ב', ריק = לא ממוינת).
-- קריאה: כולם (גם בלי חשבון), כדי שהמיון יגיע לכל מכשיר.
-- כתיבה: מנהלים בלבד (אותה בדיקת מנהל שכבר קיימת: lemaan_am_i_admin).
-- בטוח להרצה חוזרת.

CREATE TABLE IF NOT EXISTS public.lemaan_card_amud (
  card_id    text PRIMARY KEY,
  amud       text NULL CHECK (amud IN ('1', '2')),
  updated_by text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lemaan_card_amud_updated_at_idx
  ON public.lemaan_card_amud (updated_at);

ALTER TABLE public.lemaan_card_amud ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lemaan_card_amud_read ON public.lemaan_card_amud;
CREATE POLICY lemaan_card_amud_read ON public.lemaan_card_amud
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS lemaan_card_amud_insert ON public.lemaan_card_amud;
CREATE POLICY lemaan_card_amud_insert ON public.lemaan_card_amud
  FOR INSERT TO authenticated
  WITH CHECK (public.lemaan_am_i_admin());

DROP POLICY IF EXISTS lemaan_card_amud_update ON public.lemaan_card_amud;
CREATE POLICY lemaan_card_amud_update ON public.lemaan_card_amud
  FOR UPDATE TO authenticated
  USING (public.lemaan_am_i_admin())
  WITH CHECK (public.lemaan_am_i_admin());

GRANT SELECT ON public.lemaan_card_amud TO anon, authenticated;
GRANT INSERT, UPDATE ON public.lemaan_card_amud TO authenticated;
