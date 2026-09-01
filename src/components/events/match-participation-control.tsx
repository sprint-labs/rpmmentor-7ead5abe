import {
  MATCH_PARTICIPATION_STATUS_LABEL,
  MATCH_PARTICIPATION_STATUSES,
  type MatchParticipationStatus,
} from "@/lib/events/participation";

const ACTIVE_STYLE: Record<MatchParticipationStatus, string> = {
  not_confirmed: "border-warning/50 bg-warning/10 text-warning",
  played: "border-success/50 bg-success/10 text-success",
  did_not_play: "border-border bg-muted text-muted-foreground",
};

/** One-click, per-goalkeeper participation confirmation for a Match event. */
export function MatchParticipationControl({
  status,
  disabled = false,
  onChange,
  label = "Participation",
}: {
  status: MatchParticipationStatus;
  disabled?: boolean;
  onChange: (status: MatchParticipationStatus) => void;
  label?: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-1.5" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      <span aria-hidden="true" className="text-[11px] text-muted-foreground">
        {label}
      </span>
      <div className="inline-flex flex-wrap gap-1" role="group" aria-label={label}>
        {MATCH_PARTICIPATION_STATUSES.map((value) => {
          const selected = status === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(value)}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 ${
                selected
                  ? ACTIVE_STYLE[value]
                  : "border-border bg-background text-muted-foreground hover:bg-accent/50"
              }`}
            >
              {MATCH_PARTICIPATION_STATUS_LABEL[value]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
