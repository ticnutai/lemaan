// לשונית התרגול בפריסה המקורית — DafLearningTab כמו שהוא באתר הבסיסי.
import { DafLearningTab } from "@/components/study/DafLearningTab";
import ClassicShell from "../ClassicShell";

export default function ClassicStudy() {
  return (
    <ClassicShell>
      <DafLearningTab isVisible />
    </ClassicShell>
  );
}
