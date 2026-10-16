import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useStudy } from "@/lib/study/store";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { toHebrewNum } from "@/lib/study/shasFormat";

interface SefariaTextViewerProps {
  /** Sefaria ref, למשל: "Mishnah_Berakhot.1.1" או "Genesis.1" */
  sefariaRef: string;
  /** קישור גלוי למשתמש (לפתיחה בלשונית חדשה) */
  externalUrl: string;
  title: string;
  className?: string;
  columns?: 1 | 2;
  breadcrumbItems?: string[];
  lineLabel?: string;
  lineStartIndex?: number;
}

const API = "https://www.sefaria.org/api/v3/texts";
const cache = new Map<string, string[]>();

function decodeHtmlEntities(input: string): string {
  if (typeof document === "undefined") {
    return input
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }
  const textarea = document.createElement("textarea");
  textarea.innerHTML = input;
  return textarea.value;
}

function normalizeSefariaLine(line: string): string {
  const decoded = decodeHtmlEntities(line);
  return decoded
    .replace(/\u00A0/g, " ")
    .replace(/\u200e|\u200f/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s*([,.;:!?])\s*/g, "$1 ")
    .replace(/\s+([\u05BE\u05C0\u05C3])/g, "$1")
    .replace(/\s+$/g, "")
    .trim();
}

const FONT_FAMILY_VALUE: Record<"heebo" | "assistant" | "frank" | "arial" | "david", string> = {
  heebo: "Heebo, Assistant, system-ui, sans-serif",
  assistant: "Assistant, Heebo, system-ui, sans-serif",
  frank: "Frank Ruhl Libre, Times New Roman, serif",
  arial: "Arial, Heebo, sans-serif",
  david: "David, David Libre, Times New Roman, serif",
};

const CANTILLATION_RE = /[\u0591-\u05AF]/g;
const VOWELS_RE = /[\u05B0-\u05BC\u05BD\u05BF\u05C1\u05C2\u05C7]/g;

async function fetchSefariaText(ref: string): Promise<string[]> {
  if (cache.has(ref)) return cache.get(ref)!;

  // מקומי קודם: אם זה ref של גמרא בבלית (למשל "Berakhot.2a") — נסה את המאגר המקומי
  const { parseBavliRef, fetchLocalAmud, stripTags } = await import("@/lib/study/localShas");
  const bavli = parseBavliRef(ref);
  if (bavli) {
    const local = await fetchLocalAmud(bavli.slug, bavli.daf, bavli.amud);
    if (local && local.gemara.length > 0) {
      const cleaned = local.gemara
        .map((s) => normalizeSefariaLine(stripTags(s)))
        .filter(Boolean);
      cache.set(ref, cleaned);
      return cleaned;
    }
  }

  const url = `${API}/${encodeURIComponent(ref)}?version=hebrew&return_format=text_only`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sefaria fetch failed: ${res.status}`);
  const data = await res.json();
  const versions = (data?.versions ?? []) as Array<{ text: unknown }>;
  const raw: unknown = versions[0]?.text ?? data?.text ?? [];
  const flat: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") flat.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
  };
  walk(raw);
  const cleaned = flat.map((s) => normalizeSefariaLine(s.replace(/<[^>]+>/g, ""))).filter(Boolean);
  cache.set(ref, cleaned);
  return cleaned;
}

/** מציג טקסט מ-Sefaria דרך ה-API שלהם — עם כפתור פתיחה בדף המלא. */
export function SefariaTextViewer({
  sefariaRef,
  externalUrl,
  title,
  className,
  columns = 1,
  breadcrumbItems,
  lineLabel = "פסוק",
  lineStartIndex = 1,
}: SefariaTextViewerProps) {
  const { state, setUiPref } = useStudy();
  const [text, setText] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const prefs = state.uiPrefs?.sefariaReaderPrefs;
  const fontFamily = prefs?.fontFamily ?? "heebo";
  const fontSize = prefs?.fontSize ?? 20;
  const lineHeight = prefs?.lineHeight ?? 2;
  const textAlign = prefs?.textAlign ?? "justify";
  const removeVowels = prefs?.removeVowels ?? prefs?.removeNikkud ?? false;
  const removeCantillation = prefs?.removeCantillation ?? prefs?.removeNikkud ?? false;
  const compactParagraphs = prefs?.compactParagraphs ?? false;
  const boldText = prefs?.boldText ?? false;
  const [fontSizeDraft, setFontSizeDraft] = useState<number>(fontSize);
  const [lineHeightDraft, setLineHeightDraft] = useState<number>(lineHeight);

  const setPrefs = (next: Partial<NonNullable<typeof prefs>>) => {
    setUiPref("sefariaReaderPrefs", {
      ...prefs,
      ...next,
    });
  };

  const displayedText = useMemo(() => {
    if (!text) return null;
    return text.map((line) => {
      let next = line;
      if (removeCantillation) next = next.replace(CANTILLATION_RE, "");
      if (removeVowels) next = next.replace(VOWELS_RE, "");
      return next;
    });
  }, [text, removeVowels, removeCantillation]);

  const previewText = useMemo(() => {
    if (!displayedText) return [];
    return displayedText.slice(0, 3);
  }, [displayedText]);

  const renderedParagraphs = useMemo(() => {
    if (!displayedText) return null;
    if (displayedText.length === 0) {
      return <p className="text-center text-muted-foreground">אין טקסט זמין</p>;
    }
    return displayedText.map((p, i) => (
      <div key={i} className="flex items-start gap-2">
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-full border border-gold/50 bg-gold/15 text-gold font-bold text-[11px] h-5 min-w-5 px-1 mt-1"
          title={`${lineLabel} ${toHebrewNum(lineStartIndex + i)}`}
        >
          {toHebrewNum(lineStartIndex + i)}
        </span>
        <p className="flex-1">{p}</p>
      </div>
    ));
  }, [displayedText, lineLabel, lineStartIndex]);

  useEffect(() => {
    setFontSizeDraft(fontSize);
  }, [fontSize]);

  useEffect(() => {
    setLineHeightDraft(lineHeight);
  }, [lineHeight]);

  const copyCleanText = async () => {
    const source = displayedText ?? [];
    const payload = source.join("\n").replace(/\u00A0/g, " ");
    try {
      await navigator.clipboard.writeText(payload);
      toast({ title: "הועתק", description: "הטקסט הועתק בלי &nbsp; ובלי תווי HTML" });
    } catch {
      toast({ title: "שגיאה בהעתקה", description: "לא ניתן להעתיק כרגע", variant: "destructive" });
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setText(null);
    fetchSefariaText(sefariaRef)
      .then((t) => { if (!cancelled) setText(t); })
      .catch((e) => {
        if (cancelled) return;
        const msg = (e?.message ?? "").toLowerCase();
        const isNetwork = msg.includes("failed to fetch") || msg.includes("fetch")
          || msg.includes("network") || msg.includes("timeout") || msg.includes("load failed")
          || (typeof navigator !== "undefined" && !navigator.onLine);
        setError(isNetwork
          ? "הטקסט זמין רק עם חיבור לאינטרנט. במצב אופליין ניתן להמשיך לתרגל מהשאלות והחזרות המובנות."
          : (e?.message || "שגיאה בטעינה"));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sefariaRef]);

  return (
    <Card className={cn("gold-frame p-0 flex flex-col overflow-hidden", className)} dir="rtl">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gold/30 bg-card shrink-0">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-foreground truncate block">{title}</span>
          {breadcrumbItems && breadcrumbItems.length > 0 && (
            <div className="text-[11px] text-muted-foreground truncate">
              {breadcrumbItems.join(" > ")}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="הגדרות תצוגה"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4 text-gold" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="העתק טקסט נקי" onClick={copyCleanText}>
            <Copy className="h-4 w-4 text-gold" />
          </Button>
          <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="פתח ב-Sefaria">
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 text-gold" />
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 leading-loose text-lg">
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> טוען טקסט…
          </div>
        )}
        {error && (
          <div className="text-center py-12 text-destructive text-sm">
            {error}
            <div className="mt-2">
              <Button asChild variant="outline" size="sm">
                <a href={externalUrl} target="_blank" rel="noopener noreferrer">פתח ב-Sefaria</a>
              </Button>
            </div>
          </div>
        )}
        {displayedText && !loading && (
          <div
            className={cn(
              "text-foreground",
              compactParagraphs ? "space-y-1" : "space-y-3",
            )}
            style={{
              fontFamily: FONT_FAMILY_VALUE[fontFamily],
              fontSize: `${fontSizeDraft}px`,
              lineHeight: lineHeightDraft,
              textAlign,
              fontWeight: boldText ? 700 : 400,
              direction: "rtl",
              unicodeBidi: "plaintext",
              columnCount: columns,
              columnGap: columns > 1 ? "1.5rem" : undefined,
            }}
          >
            {renderedParagraphs}
          </div>
        )}
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen} modal={false}>
        <DialogContent
          showOverlay={false}
          className="w-[min(96vw,900px)] max-w-4xl p-0 gap-0"
          dir="rtl"
        >
          <DialogHeader className="px-4 py-3 border-b border-gold/20">
            <DialogTitle className="text-base">הגדרות תצוגה</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 max-h-[78vh] overflow-y-auto">
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Select value={fontFamily} onValueChange={(v) => setPrefs({ fontFamily: v as "heebo" | "assistant" | "frank" | "arial" | "david" })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="גופן" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="heebo">Heebo</SelectItem>
                    <SelectItem value="assistant">Assistant</SelectItem>
                    <SelectItem value="frank">Frank Ruhl Libre</SelectItem>
                    <SelectItem value="arial">Arial</SelectItem>
                    <SelectItem value="david">David</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={textAlign} onValueChange={(v) => setPrefs({ textAlign: v as "justify" | "right" })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="יישור" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="justify">יישור לשני הצדדים</SelectItem>
                    <SelectItem value="right">יישור לימין</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border border-gold/20 px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>גודל</span>
                  <span>{fontSizeDraft}px</span>
                </div>
                <Slider
                  min={16}
                  max={30}
                  step={1}
                  value={[fontSizeDraft]}
                  onValueChange={(v) => setFontSizeDraft(v[0] ?? 20)}
                  onValueCommit={(v) => setPrefs({ fontSize: v[0] ?? 20 })}
                />
              </div>

              <div className="rounded-md border border-gold/20 px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>ריווח שורות</span>
                  <span>{lineHeightDraft.toFixed(2)}</span>
                </div>
                <Slider
                  min={1.2}
                  max={2.6}
                  step={0.05}
                  value={[lineHeightDraft]}
                  onValueChange={(v) => setLineHeightDraft(Number((v[0] ?? 2).toFixed(2)))}
                  onValueCommit={(v) => setPrefs({ lineHeight: Number((v[0] ?? 2).toFixed(2)) })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border border-gold/20 px-3 py-2">
                  <span className="text-xs">טקסט מודגש</span>
                  <Switch checked={boldText} onCheckedChange={(v) => setPrefs({ boldText: v })} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-gold/20 px-3 py-2">
                  <span className="text-xs">ללא ניקוד</span>
                  <Switch checked={removeVowels} onCheckedChange={(v) => setPrefs({ removeVowels: v })} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-gold/20 px-3 py-2">
                  <span className="text-xs">ללא טעמי מקרא</span>
                  <Switch checked={removeCantillation} onCheckedChange={(v) => setPrefs({ removeCantillation: v })} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-gold/20 px-3 py-2">
                  <span className="text-xs">פסקאות קומפקט</span>
                  <Switch checked={compactParagraphs} onCheckedChange={(v) => setPrefs({ compactParagraphs: v })} />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gold/20 bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground mb-2">תצוגה מקדימה</div>
              <div
                className={cn("text-foreground", compactParagraphs ? "space-y-1" : "space-y-3")}
                style={{
                  fontFamily: FONT_FAMILY_VALUE[fontFamily],
                  fontSize: `${fontSizeDraft}px`,
                  lineHeight: lineHeightDraft,
                  textAlign,
                  fontWeight: boldText ? 700 : 400,
                  direction: "rtl",
                  unicodeBidi: "plaintext",
                }}
              >
                {previewText.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין פסוקים לתצוגה מקדימה</p>
                ) : (
                  previewText.map((p, i) => (
                    <p key={`preview-${i}`}>{p}</p>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
