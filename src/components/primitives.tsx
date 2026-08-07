import { useState, type ComponentType, type ReactNode } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { TIER_DEFINITIONS } from "@/lib/mock-data";
import type { Tier, DutyLevel } from "@/lib/mock-data";

const DUTY_TONES: Record<DutyLevel, { dot: string; badge: string }> = {
  up_to_date: { dot: "bg-success", badge: "bg-success/15 text-success border-success/30" },
  due_soon: { dot: "bg-warning", badge: "bg-warning/15 text-warning border-warning/30" },
  overdue: { dot: "bg-destructive", badge: "bg-destructive/15 text-destructive border-destructive/40" },
  not_required: { dot: "bg-muted-foreground/50", badge: "bg-muted text-muted-foreground border-border" },
  not_enough_data: { dot: "bg-muted-foreground/50", badge: "bg-muted text-muted-foreground border-border" },
};

export function TrafficLight({ level, size = 10 }: { level: DutyLevel; size?: number }) {
  return <span className={cn("inline-block rounded-full shrink-0 ring-2 ring-background", DUTY_TONES[level].dot)} style={{ width: size, height: size }} aria-label={`duty ${level}`} />;
}

export function DutyBadge({ level, label }: { level: DutyLevel; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap", DUTY_TONES[level].badge)}>
      <TrafficLight level={level} size={6} />
      {label}
    </span>
  );
}

export function PageHeader({ title, description, action, breadcrumbs }: { title: string; description?: string; action?: ReactNode; breadcrumbs?: BreadcrumbItem[] }) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs items={breadcrumbs} className="mb-2" />
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold uppercase tracking-[0.02em]">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center flex-wrap gap-1 text-[11px] uppercase tracking-wider font-medium", className)}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={`${item.label}-${idx}`} className="inline-flex items-center gap-1">
            {item.to && !isLast ? (
              <Link to={item.to} className="text-muted-foreground hover:text-foreground transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-foreground" : "text-muted-foreground"} aria-current={isLast ? "page" : undefined}>
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight className="size-3 text-muted-foreground/60" />}
          </span>
        );
      })}
    </nav>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card text-card-foreground", className)}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint, accent, emptyMessage, updatedAt }: { label: string; value: string | number; hint?: string; accent?: "primary" | "warning" | "destructive" | "info"; emptyMessage?: string; updatedAt?: string }) {
  const rail =
    accent === "warning" ? "before:bg-warning"
    : accent === "destructive" ? "before:bg-destructive"
    : accent === "info" ? "before:bg-info"
    : "before:bg-primary";
  const valueTone =
    accent === "warning" ? "text-warning"
    : accent === "destructive" ? "text-destructive"
    : accent === "info" ? "text-info"
    : "text-primary";
  const glow =
    accent === "warning" ? "shadow-[0_0_18px_-6px_var(--warning)]"
    : accent === "destructive" ? "shadow-[0_0_18px_-6px_var(--destructive)]"
    : accent === "info" ? "shadow-[0_0_18px_-6px_var(--info)]"
    : "shadow-[0_0_18px_-6px_var(--primary)]";
  const isEmpty = typeof value === "number" && value === 0 && emptyMessage;
  return (
    <div
      className={cn(
        "command-panel p-4 relative overflow-hidden text-card-foreground",
        "before:content-[''] before:absolute before:left-0 before:top-0 before:h-full before:w-[2px]",
        rail,
        glow,
      )}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">{label}</div>
      <div className={cn("mt-1.5 text-3xl font-bold tabular-nums font-mono leading-none", isEmpty ? "text-muted-foreground/60 text-base font-normal" : valueTone)}>
        {isEmpty ? emptyMessage : value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-2">{hint}</div>}
      {updatedAt && <div className="text-[10px] text-muted-foreground/70 mt-3 font-mono tabular-nums">Updated {updatedAt}</div>}
    </div>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  const styles: Record<Tier, string> = {
    "Tier 1": "bg-warning/15 text-warning border-warning/40",
    "Tier 2": "bg-info/15 text-info border-info/30",
    "Tier 3": "bg-primary/15 text-primary border-primary/30",
    "Tier 4": "bg-muted text-muted-foreground border-border",
    "Academy": "bg-tier-3/20 text-tier-3 border-tier-3/40",
    "Free Agent": "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap", styles[tier])}>
      {tier}
    </span>
  );
}
export const StatusBadge = TierBadge;

export function TierLevelBadge({ level }: { level: 1 | 2 | 3 | 4 }) {
  const styles: Record<1 | 2 | 3 | 4, string> = {
    1: "bg-warning/15 text-warning border-warning/40",
    2: "bg-info/15 text-info border-info/30",
    3: "bg-primary/15 text-primary border-primary/30",
    4: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap tabular-nums", styles[level])}>
      Tier {level}
    </span>
  );
}

export function TierLegend() {
  return (
    <Card className="p-4">
      <SectionTitle>Tier Legend</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TIER_DEFINITIONS.map((t) => (
          <div key={t.level} className="p-3 rounded-md border border-border bg-background/50">
            <div className="flex items-center gap-2 mb-1">
              <TierLevelBadge level={t.level} />
              <span className="text-xs font-medium text-foreground">{t.label}</span>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{t.summary}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "success" | "warning" | "destructive" | "info" }) {
  const t: Record<string, string> = {
    muted: "bg-muted text-muted-foreground border-border",
    success: "bg-success/15 text-success border-success/30",
    warning: "bg-warning/15 text-warning border-warning/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/40",
    info: "bg-info/15 text-info border-info/30",
  };
  return <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border", t[tone])}>{children}</span>;
}

export function Avatar({ initials, size = 28, imageUrl, alt }: { initials: string; size?: number; imageUrl?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={alt ?? initials}
        loading="lazy"
        onError={() => setFailed(true)}
        className="rounded-full object-cover bg-accent shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-accent text-accent-foreground grid place-items-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-label={alt ?? initials}
    >
      {initials}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function ProgressBar({ value, tone = "primary" }: { value: number; tone?: "primary" | "warning" | "info" }) {
  const c = tone === "warning" ? "bg-warning" : tone === "info" ? "bg-info" : "bg-primary";
  return (
    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-12 px-6 text-center", className)}>
      <div className="size-12 rounded-full bg-muted grid place-items-center">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

