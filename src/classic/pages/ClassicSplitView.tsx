// "תצוגת לימוד מלאה" — כמו SplitViewPage של האתר הבסיסי (החזרה היא לתרגול, /study).
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DafLearningTab } from "@/components/study/DafLearningTab";
import ClassicShell from "../ClassicShell";

export default function ClassicSplitView() {
  const navigate = useNavigate();

  return (
    <ClassicShell>
      <div className="min-h-screen bg-background p-3 sm:p-4 lg:p-6 space-y-3" dir="rtl">
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" className="gap-1" onClick={() => navigate("/study")}>
            <ArrowRight className="h-4 w-4" /> חזרה למסך הראשי
          </Button>
          <h1 className="text-sm sm:text-base font-semibold text-foreground">תצוגת לימוד מלאה</h1>
        </div>

        <DafLearningTab isVisible />
      </div>
    </ClassicShell>
  );
}
