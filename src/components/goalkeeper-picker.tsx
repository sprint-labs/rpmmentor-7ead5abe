import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PlayerRosterRow } from "@/lib/players.functions";
import { cn } from "@/lib/utils";

export interface GoalkeeperPickerProps {
  /** Canonical rows read from `public.players`. */
  players: readonly PlayerRosterRow[];
  /** Selected canonical `players.id`, or null when no goalkeeper is linked. */
  value: string | null | undefined;
  /** Returns both the stable id and row so callers can populate `current_club`. */
  onValueChange: (playerId: string | null, player: PlayerRosterRow | null) => void;
  /** Required pickers do not show the clear action unless explicitly enabled. */
  required?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  ariaLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
}

/**
 * Searchable canonical goalkeeper selector shared by upload and interaction forms.
 * Result rows deliberately render the player's name only; club is presented by
 * the consuming form in its separate locked Club field.
 */
export function GoalkeeperPicker({
  players,
  value,
  onValueChange,
  required = false,
  clearable = !required,
  disabled = false,
  loading = false,
  error = null,
  ariaLabel = "Goalkeeper",
  placeholder = "Select a goalkeeper…",
  searchPlaceholder = "Search goalkeepers…",
  emptyMessage = "No goalkeepers found.",
  className,
}: GoalkeeperPickerProps) {
  const [open, setOpen] = useState(false);
  const errorId = useId();
  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [players],
  );
  const selected = sortedPlayers.find((player) => player.id === value) ?? null;
  const unavailable = disabled || loading || Boolean(error);

  const triggerText = loading ? "Loading goalkeepers…" : (selected?.full_name ?? placeholder);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex min-w-0 gap-2">
        <Popover open={open} onOpenChange={(next) => !unavailable && setOpen(next)}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-label={ariaLabel}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-required={required}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              disabled={unavailable}
              className={cn(
                "flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-border bg-input/60 px-3 text-left text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
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
            className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0"
          >
            <Command label={`Search ${ariaLabel}`}>
              <CommandInput aria-label={`Search ${ariaLabel}`} placeholder={searchPlaceholder} />
              <CommandList>
                <CommandEmpty>{emptyMessage}</CommandEmpty>
                <CommandGroup>
                  {sortedPlayers.map((player) => (
                    <CommandItem
                      key={player.id}
                      value={player.id}
                      keywords={[player.full_name]}
                      onSelect={() => {
                        onValueChange(player.id, player);
                        setOpen(false);
                      }}
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(
                          "size-4",
                          selected?.id === player.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{player.full_name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {clearable && selected && (
          <button
            type="button"
            aria-label="Clear goalkeeper"
            disabled={unavailable}
            onClick={() => {
              onValueChange(null, null);
              setOpen(false);
            }}
            className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
