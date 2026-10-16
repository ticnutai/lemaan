import { BulkCardDecksDialog } from "./BulkCardDecksDialog";
import type { Card as StudyCardType } from "@/lib/study/types";

interface Props {
  card: StudyCardType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CardDecksDialog({ card, open, onOpenChange }: Props) {
  if (!card) return null;
  return <BulkCardDecksDialog cards={[card]} open={open} onOpenChange={onOpenChange} />;
}