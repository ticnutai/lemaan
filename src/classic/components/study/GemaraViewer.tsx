import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, BookOpen, Loader2, Settings2, ChevronRight, ChevronLeft, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { fetchSefariaDaf, sefariaUrl, isSefariaSupported, masechtaSlug } from "@/lib/study/sefaria";
import { toGematria } from "@/lib/study/shasGen";
import { supabase } from "@/integrations/supabase/client";
import { useStudy } from "@/lib/study/store";
import { cn } from "@/lib/utils";

type Source = "pdf" | "text";

interface Props {
  masechta: string;
  daf: number;
  amud: 1 | 2;
  className?: string;
  isActive?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  onTogglePin?: () => void;
  isPinned?: boolean;
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

// Desktop (Electron) ships the full Shas text locally and is offline-first, so
// it defaults to the bundled TEXT (always available). The PDF scan lives in
// cloud storage and is used online only \u2014 the user can still toggle to it.
const IS_ELECTRON =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");
const DEFAULT_SOURCE: Source = IS_ELECTRON ? "text" : "pdf";

export function GemaraViewer({ masechta, daf, amud, className, isActive = true, onPrev, onNext, canPrev, canNext, onTogglePin, isPinned }: Props) {
  const { state, setUiPref } = useStudy();
  const [source, setSource] = useState<Source>(DEFAULT_SOURCE);
  const [pdfCheck, setPdfCheck] = useState<{ url: string; exists: boolean } | null>(null);
  const [text, setText] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const pdfPath = `${masechtaSlug(masechta)}/${daf}_${amud}.pdf`;
  const pdfUrl = useMemo(
    () => supabase.storage.from("gemara-pages").getPublicUrl(pdfPath).data.publicUrl,
    [pdfPath],
  );
  // Never reuse a successful check from the previous daf during navigation.
  const pdfExists = pdfCheck?.url === pdfUrl ? pdfCheck.exists : null;

  // בדוק קיום PDF
  useEffect(() => {
    if (!isActive) return;
    let cancel = false;
    setPdfCheck(null);
    fetch(pdfUrl, { method: "HEAD" })
      .then((r) => {
        const isPdf = r.ok && r.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/pdf";
        if (!cancel) setPdfCheck({ url: pdfUrl, exists: Boolean(isPdf) });
      })
      .catch(() => { if (!cancel) setPdfCheck({ url: pdfUrl, exists: false }); });
    return () => { cancel = true; };
  }, [pdfUrl, isActive]);

  // אם PDF לא קיים — עבור אוטומטית לטקסט
  useEffect(() => {
    if (pdfExists === false && source === "pdf") setSource("text");
  }, [pdfExists, source]);

  // טען טקסט מ-Sefaria
  useEffect(() => {
    if (!isActive) return;
    if (source !== "text") return;
    if (!isSefariaSupported(masechta)) {
      setError("המסכת לא נתמכת ב-Sefaria");
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
    fetchSefariaDaf(masechta, daf, amud)
      .then((t) => { if (!cancel) setText(t); })
      .catch((e: Error) => {
        if (cancel) return;
        // Network failure (offline / server unreachable) → friendly message
        // instead of a raw "Failed to fetch". Daf text needs the internet.
        const msg = (e?.message ?? "").toLowerCase();
        const isNetwork = msg.includes("failed to fetch") || msg.includes("fetch")
          || msg.includes("network") || msg.includes("timeout") || msg.includes("load failed")
          || (typeof navigator !== "undefined" && !navigator.onLine);
        setError(isNetwork
          ? "טקסט הדף זמין רק עם חיבור לאינטרנט. במצב אופליין ניתן להמשיך לתרגל מהשאלות והחזרות המובנות."
          : "לא ניתן לטעון את טקסט הדף כרגע. נסה שוב מאוחר יותר.");
      })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [source, masechta, daf, amud, isActive]);

  const amudLabel = amud === 1 ? 'ע"א' : 'ע"ב';
  const dafLabel = `${toGematria(daf)}'`;

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

  useEffect(() => {
    setFontSizeDraft(fontSize);
  }, [fontSize]);

  useEffect(() => {
    setLineHeightDraft(lineHeight);
  }, [lineHeight]);

  return (
    <div className={cn("flex flex-col h-full bg-card border-2 border-gold/30 rounded-xl overflow-hidden", className)} dir="rtl">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gold/30 bg-gold/5">
        <div className="flex items-center gap-1">
          {onPrev && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="עמוד קודם"
              onClick={onPrev}
              disabled={!canPrev}
            >
              <ChevronRight className="h-4 w-4 text-gold" />
            </Button>
          )}
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BookOpen className="h-4 w-4 text-gold" />
            {masechta} · דף {dafLabel} · {amudLabel}
          </div>
          {onNext && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="עמוד הבא"
              onClick={onNext}
              disabled={!canNext}
            >
              <ChevronLeft className="h-4 w-4 text-gold" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onTogglePin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={isPinned ? "הסר הצמדה" : "הצמד עמוד זה"}
              onClick={onTogglePin}
            >
              {isPinned ? <PinOff className="h-4 w-4 text-gold" /> : <Pin className="h-4 w-4 text-gold" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="הגדרות תצוגה"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4 text-gold" />
          </Button>
          <ToggleGroup type="single" value={source} onValueChange={(v) => v && setSource(v as Source)} size="sm">
            <ToggleGroupItem value="pdf" disabled={pdfExists === false} className="h-7 px-2 text-xs">
              PDF{pdfExists === false ? " (אין)" : ""}
            </ToggleGroupItem>
            <ToggleGroupItem value="text" className="h-7 px-2 text-xs">
              <FileText className="h-3 w-3" /> טקסט
            </ToggleGroupItem>
          </ToggleGroup>
          <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="פתח ב-Sefaria">
            <a href={sefariaUrl(masechta, daf, amud)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {!isActive ? null : (
          <>
        {source === "pdf" && pdfExists === null && (
          <div role="status" className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> טוען דף…
          </div>
        )}
        {source === "pdf" && pdfExists === true && (
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title={`גמרא ${masechta} ${dafLabel}${amudLabel}`}
          />
        )}
        {source === "text" && (
          <div className="h-full overflow-y-auto p-4">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> טוען דף…
              </div>
            )}
            {error && <div className="text-sm text-destructive py-4 text-center">{error}</div>}
            {!loading && !error && displayedText && (
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
                {displayedText.length === 0 && <div className="text-sm text-muted-foreground">אין טקסט זמין</div>}
                {displayedText.map((p, i) => (
                  <p key={i} className="text-justify">{p}</p>
                ))}
              </div>
            )}
          </div>
        )}
          </>
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
                  <p className="text-sm text-muted-foreground">אין טקסט לתצוגה מקדימה</p>
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
    </div>
  );
}
