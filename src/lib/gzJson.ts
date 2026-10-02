/**
 * טעינת JSON דחוס (.json.gz). שרתים מסוימים (vite dev) מפענחים את ה-gzip בעצמם;
 * אחרים (GitHub Pages, קבצי האפליקציה) מגישים בייטים גולמיים — מזהים לפי חתימת
 * gzip (1f 8b) ומפענחים רק במקרה הצורך.
 */
export async function fetchGzJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`טעינה נכשלה: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text =
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}
