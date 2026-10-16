import { useEffect, useState } from "react";
import { MessageSquareText, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type ReportTarget = { kind: "question" } | { kind: "answer"; text: string; index: number };

export function QuestionReportDialog({
  open,
  onOpenChange,
  cardId,
  question,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
  question: string;
  target: ReportTarget;
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { if (!open) setNote(""); }, [open]);

  const send = async () => {
    if (!note.trim()) {
      toast({ title: "צריך לכתוב הערה לפני השליחה", variant: "destructive" });
      return;
    }
    setSending(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      toast({ title: "לא ניתן לשלוח", description: "יש להתחבר למשתמש רשום.", variant: "destructive" });
      setSending(false);
      return;
    }
    const targetText = target.kind === "question"
      ? "דיווח על נוסח השאלה"
      : `דיווח על תשובה ${target.index + 1}: ${target.text}`;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cardId);
    const { error } = await supabase.from("source_change_notes").insert({
      user_id: userId,
      source_user_id: userId,
      original_card_id: isUuid ? cardId : null,
      original_question: question,
      note: `[${targetText}]\n${note.trim()}`,
      target_kind: target.kind,
      target_text: target.kind === "answer" ? target.text : null,
      target_index: target.kind === "answer" ? target.index : null,
      status: "open",
    });
    setSending(false);
    if (error) {
      toast({ title: "שליחת ההערה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "ההערה נשלחה למנהל", description: "תודה שעזרת לשפר את השאלות." });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-gold" />הערה למנהל</DialogTitle>
          <DialogDescription className="text-right">
            {target.kind === "question" ? "מה אינו מדויק בשאלה?" : `מה אינו מדויק בתשובה „${target.text}”?`}
          </DialogDescription>
        </DialogHeader>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="כתוב כאן את ההערה..." className="min-h-28 text-right" autoFocus />
        <Button type="button" onClick={send} disabled={sending || !note.trim()} className="gap-2 bg-gradient-navy text-primary-foreground">
          <Send className="h-4 w-4" />{sending ? "שולח..." : "שלח למנהל"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
