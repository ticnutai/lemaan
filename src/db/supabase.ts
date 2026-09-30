// לקוח Supabase יחיד לכל האפליקציה (אימות + סנכרון) — אין כפילויות.
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://insvegfuiketekxncsgq.supabase.co";
export const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imluc3ZlZ2Z1aWtldGVreG5jc2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3OTI1NzEsImV4cCI6MjEwNjM2ODU3MX0.wZiIIxrZnVTt0zMEYZhMIkqkNjwDIaEoW-fP2Taw4do";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
