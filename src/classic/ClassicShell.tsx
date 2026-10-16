// מעטפת לפריסה המקורית: כיוון ימין-לשמאל, רמזים והודעות קופצות — כמו ב-App.tsx של האתר הבסיסי.
import type { ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

export default function ClassicShell({ children }: { children: ReactNode }) {
  return (
    <DirectionProvider dir="rtl">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <div className="classic-layout" dir="rtl">{children}</div>
      </TooltipProvider>
    </DirectionProvider>
  );
}
