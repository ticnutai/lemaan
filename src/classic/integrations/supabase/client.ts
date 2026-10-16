// גשר: הקוד המקורי פונה לענן של האתר הבסיסי (מסד נתונים אחר). בפריסה המקורית אצלנו כל הנתונים
// באים מהמסד של האתר שלנו (lib/study/store), ולכן כאן "ענן ריק": כל שאילתה מחזירה תשובה ריקה בלי שגיאה,
// ופעולות שדורשות את הענן ההוא (סיווג אוטומטי, שיתוף) מחזירות הודעה שהן לא זמינות כאן.
// דפי הגמרא לצפייה (gemara-pages) ציבוריים — הקישור אליהם נשאר כמו במקור.
const ORIGINAL_STORAGE = "https://elfxevuxhffxskooppca.supabase.co/storage/v1/object/public";
const unavailable = { message: "לא זמין בפריסה הזו" };

type Result = { data: unknown; error: unknown; count?: number | null };

/** שרשרת שאילתה: כל קריאה מחזירה את השרשרת, והמתנה לה מחזירה תוצאה ריקה. */
function query(result: Result = { data: null, error: null, count: 0 }): unknown {
  const chain: Record<string | symbol, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") return (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
      if (prop === "catch" || prop === "finally") return (fn: () => unknown) => Promise.resolve(result).then(fn);
      return () => proxy;
    },
  });
  return proxy;
}

const noSub = { data: { subscription: { unsubscribe() {} } } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = {
  from: () => query(),
  rpc: () => query(),
  channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
  removeChannel: () => {},
  functions: { invoke: async () => ({ data: null, error: unavailable }) },
  storage: {
    from: (bucket: string) => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: `${ORIGINAL_STORAGE}/${bucket}/${path}` } }),
      download: async () => ({ data: null, error: unavailable }),
      upload: async () => ({ data: null, error: unavailable }),
      list: async () => ({ data: [], error: null }),
    }),
  },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => noSub,
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: unavailable }),
    signOut: async () => ({ error: null }),
  },
};
