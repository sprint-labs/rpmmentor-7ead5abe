import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isRecentMatch, matchLabel, type MatchEventLike } from "@/lib/match-clips";
import { cn } from "@/lib/utils";

/** Command items need a non-empty value; this one stands for "no match". */
const NO_MATCH_VALUE = "__no_match__";

export interface MatchPickerProps<E extends MatchEventLike> {
  /** Pickable matches, newest first — see `pickableMatches`. */
  matches: readonly E[];
  /** Selected `calendar_events.id`, or null for "No match yet". */
  value: string | null;
  onValueChange: (eventId: string | null) => void;
  /** YYYY-MM-DD, used to split the list into the last fortnight and earlier. */
  today: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  ariaLabel?: string;
  className?: string;
}

/**
 * Searchable picker over calendar Matches, with "No match yet" first so a clip
 * for a fixture nobody imported is never blocked on admin.
 */
export function MatchPicker<E extends MatchEventLike>({
  matches,
  value,
  onValueChange,
  today,
  disabled = false,
  loading = false,
  error = null,
  ariaLabel = "Match",
  className,
}: MatchPickerProps<E>) {
  const [open, setOpen] = useState(false);
  const errorId = useId();
  const selected = matches.find((event) => event.id === value) ?? null;
  const unavailable = disabled || loading;
  const { recent, earlier } = useMemo(() => {
    const recentMatches: E[] = [];
    const earlierMatches: E[] = [];
    for (const event of matches) {
      (isRecentMatch(event, today) ? recentMatches : earlierMatches).push(event);
    }
    return { recent: recentMatches, earlier: earlierMatches };
  }, [matches, today]);

  const triggerText = loading
    ? "Loading matches…"
    : selected
      ? matchLabel(selected)
      : "No match yet";

  const choose = (eventId: string | null) => {
    onValueChange(eventId);
    setOpen(false);
  };

  const renderGroup = (heading: string, events: readonly E[]) =>
    events.length > 0 && (
      <CommandGroup heading={heading}>
        {events.map((event) => {
          const label = matchLabel(event);
          return (
            <CommandItem
              key={event.id}
              value={event.id}
              keywords={[label]}
              onSelect={() => choose(event.id)}
            >
              <Check
                aria-hidden="true"
                className={cn("size-4 shrink-0", value === event.id ? "opacity-100" : "opacity-0")}
              />
              <span className="truncate">{label}</span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    );

  return (
    <div className={cn("space-y-1", className)}>
      <Popover open={open} onOpenChange={(next) => !unavailable && setOpen(next)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            disabled={unavailable}
            className={cn(
              "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-input/60 px-3 text-left text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
              error && "border-destructive focus:ring-destructive/40",
            )}
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {triggerText}
            </span>
            {loading ? (
              <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin opacity-60" />
            ) : (
              <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 opacity-50" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
        >
          <Command label={`Search ${ariaLabel}`}>
            <CommandInput
              aria-label={`Search ${ariaLabel}`}
              placeholder="Search opponent, club or goalkeeper…"
            />
            <CommandList>
              <CommandEmpty>No matches found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={NO_MATCH_VALUE}
                  keywords={["No match yet"]}
                  onSelect={() => choose(null)}
                >
                  <Check
                    aria-hidden="true"
                    className={cn("size-4 shrink-0", value === null ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">No match yet</span>
                </CommandItem>
              </CommandGroup>
              {renderGroup("Last 14 days", recent)}
              {renderGroup("Earlier", earlier)}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <p id={errorId} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
