/**
 * usePrompt — async text-input dialog hook.
 * Replaces synchronous window.prompt(), which is NOT supported in Electron
 * (Chromium blocks it there, so the call silently returns without a dialog).
 *
 * Usage:
 *   const { prompt, dialog } = usePrompt();
 *   // In an async handler:
 *   const value = await prompt("להזנת אזור ההגדרות יש להזין סיסמה:", { password: true });
 *   if (value === null) return; // cancelled
 *   // In JSX:
 *   {dialog}
 */
import { useState, useCallback, useRef, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

interface PromptOptions {
  password?: boolean;
  defaultValue?: string;
  title?: string;
  placeholder?: string;
}

interface PendingPrompt {
  message: string;
  options: PromptOptions;
  resolve: (value: string | null) => void;
}

export function usePrompt() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = useCallback(
    (message: string, options: PromptOptions = {}): Promise<string | null> => {
      return new Promise((resolve) => {
        setValue(options.defaultValue ?? "");
        setPending({ message, options, resolve });
      });
    },
    [],
  );

  useEffect(() => {
    if (pending) {
      // Focus after the dialog mounts
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [pending]);

  const finish = (result: string | null) => {
    pending?.resolve(result);
    setPending(null);
    setValue("");
  };

  const dialog = (
    <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open) finish(null); }}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.options.title ?? "הזנה"}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); finish(value); }}
        >
          <Input
            ref={inputRef}
            type={pending?.options.password ? "password" : "text"}
            value={value}
            placeholder={pending?.options.placeholder}
            onChange={(e) => setValue(e.target.value)}
            dir="rtl"
            autoComplete="off"
          />
          <AlertDialogFooter className="gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel type="button" onClick={() => finish(null)}>ביטול</AlertDialogCancel>
            <AlertDialogAction type="submit" onClick={(e) => { e.preventDefault(); finish(value); }}>
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { prompt, dialog };
}
