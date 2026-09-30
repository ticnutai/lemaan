import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

/** Section header banner like the original app: gold-framed card, title on the right, gold icon square on the left edge. */
export default function PageBanner({ icon: Icon, title, subtitle }: Props) {
  return (
    <div className="gold-frame bg-card px-6 py-5 flex items-center justify-between animate-fade-in">
      <div>
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="h-12 w-12 rounded-xl border-2 border-gold/70 bg-secondary flex items-center justify-center shadow-gold">
        <Icon className="h-6 w-6 text-gold" />
      </div>
    </div>
  );
}
