/**
 * Shared building blocks for the insight "workbench" views (a filterable master
 * list beside a full-record detail pane). Kept in one place so the Interactions
 * and Match Reports drilldowns stay visually identical.
 */
export function DetailFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-border pb-3">
      <dt className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}
