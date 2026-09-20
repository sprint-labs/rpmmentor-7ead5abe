import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboFieldProps {
  /** Current text. This is a free-text field: the value is not restricted to `options`. */
  value: string;
  onValueChange: (value: string) => void;
  /** Suggestions, filtered as the mentor types. */
  options: readonly string[];
  ariaLabel: string;
  placeholder?: string;
  emptyMessage?: string;
  /** Shown under the field, e.g. which competition the suggestions came from. */
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  id?: string;
  className?: string;
  inputClassName?: string;
}

/** Suggestions past this point are windowed — nobody scrolls 400 clubs. */
const MAX_VISIBLE_OPTIONS = 60;

/**
 * A text input that suggests, rather than a `<select>` that dictates.
 *
 * The match report fields it replaces used a native `<datalist>`, which browsers
 * render as an unstyled, full-height list floating outside the dialog — the one
 * piece of the app the design system could not reach. This keeps the typed value
 * authoritative (clubs play odd cups, and a fixture against a club nobody has
 * reported on yet must still be filable) while offering what Mentor Hub knows,
 * in a popover that matches everything around it.
 *
 * Typing filters. Arrow keys move through the list, Enter takes the highlighted
 * suggestion, Escape closes and leaves whatever was typed intact.
 */
export function ComboField({
  value,
  onValueChange,
  options,
  ariaLabel,
  placeholder,
  emptyMessage = "No matches — what you typed is kept.",
  hint,
  required = false,
  disabled = false,
  maxLength = 80,
  id,
  className,
  inputClassName,
}: ComboFieldProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const listId = `${fieldId}-list`;
  const hintId = `${fieldId}-hint`;

  const normalised = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const option of options) {
      const name = option.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }, [options]);

  const query = value.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return normalised;
    // Prefix matches first — typing "bl" should reach Blackburn before Bolton.
    const starts: string[] = [];
    const contains: string[] = [];
    for (const option of normalised) {
      const lower = option.toLowerCase();
      if (lower.startsWith(query)) starts.push(option);
      else if (lower.includes(query)) contains.push(option);
    }
    return [...starts, ...contains];
  }, [normalised, query]);

  const visible = matches.slice(0, MAX_VISIBLE_OPTIONS);
  const hiddenCount = matches.length - visible.length;

  // A competition change can empty the club list under an open popover, and any
  // change to what is on offer invalidates the highlight.
  useEffect(() => {
    if (normalised.length === 0) setOpen(false);
  }, [normalised.length]);
  useEffect(() => {
    setActiveIndex(-1);
  }, [query, normalised.length]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    // Guarded: jsdom, and older Safari, do not implement scrollIntoView.
    const row = listRef.current.children[activeIndex];
    if (row instanceof HTMLElement && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const commit = (next: string) => {
    onValueChange(next);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (!open && normalised.length > 0) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (visible.length === 0) return;
      event.preventDefault();
      setActiveIndex((previous) => (previous + 1) % visible.length);
    } else if (event.key === "ArrowUp") {
      if (!open || visible.length === 0) return;
      event.preventDefault();
      setActiveIndex((previous) => (previous <= 0 ? visible.length - 1 : previous - 1));
    } else if (event.key === "Enter") {
      // Only intercept Enter when a suggestion is highlighted, so Enter on a
      // typed value still submits the form the way it always did.
      if (open && activeIndex >= 0 && visible[activeIndex]) {
        event.preventDefault();
        commit(visible[activeIndex]);
      }
    } else if (event.key === "Escape") {
      if (!open) return;
      // Keep what was typed; just get the list out of the way, and do not let
      // the surrounding dialog treat this as a request to close.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <input
              ref={inputRef}
              id={fieldId}
              role="combobox"
              aria-label={ariaLabel}
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={
                open && activeIndex >= 0 ? `${fieldId}-option-${activeIndex}` : undefined
              }
              aria-describedby={hint ? hintId : undefined}
              required={required}
              disabled={disabled}
              maxLength={maxLength}
              placeholder={placeholder}
              value={value}
              autoComplete="off"
              className={cn(
                "w-full h-9 pl-3 pr-9 rounded-md bg-input/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
                inputClassName,
              )}
              onChange={(event) => {
                onValueChange(event.target.value);
                if (!open && normalised.length > 0) setOpen(true);
              }}
              onKeyDown={onKeyDown}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Show ${ariaLabel} suggestions`}
              disabled={disabled || normalised.length === 0}
              onClick={() => {
                setOpen((previous) => !previous);
                inputRef.current?.focus();
              }}
              className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronsUpDown aria-hidden="true" className="size-4" />
            </button>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          // Focus stays in the text input: the mentor is typing, the list follows.
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0"
        >
          {visible.length === 0 ? (
            <p className="px-3 py-2.5 text-[12px] text-muted-foreground">{emptyMessage}</p>
          ) : (
            <>
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={`${ariaLabel} suggestions`}
                className="max-h-56 overflow-y-auto py-1"
              >
                {visible.map((option, index) => (
                  <li
                    key={option}
                    id={`${fieldId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    // Mousedown, not click: blurring the input first would close
                    // the popover before the click ever lands.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      commit(option);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "cursor-pointer truncate px-3 py-1.5 text-sm",
                      index === activeIndex && "bg-accent text-accent-foreground",
                    )}
                  >
                    {option}
                  </li>
                ))}
              </ul>
              {hiddenCount > 0 && (
                <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
                  {hiddenCount} more — keep typing to narrow.
                </p>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>

      {hint && (
        <p id={hintId} className="text-[10px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
