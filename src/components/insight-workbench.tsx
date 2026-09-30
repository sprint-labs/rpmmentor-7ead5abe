import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/primitives";

/**
 * The shared master/detail shell behind every insight drilldown: a summary
 * strip, a filter bar, a scrollable list of records, and a detail pane holding
 * the complete record. Every tab renders through this so they stay identical —
 * only the row content, the facts and the tiles differ.
 */

export interface WorkbenchTile {
  label: string;
  value: ReactNode;
  /** Extra classes for the value — used for the score/duty colour tones. */
  valueClassName?: string;
  /** Big mono figure (a count or score) rather than a plain line of text. */
  mono?: boolean;
}

export interface WorkbenchFilterSpec<T> {
  id: string;
  /** Screen-reader label, e.g. "Filter by mentor". */
  label: string;
  /** The unfiltered option, e.g. "All mentors". */
  allLabel: string;
  optionsOf: (items: T[]) => string[];
  matches: (item: T, value: string) => boolean;
}

export interface WorkbenchRowContent {
  initials: string;
  title: string;
  subtitle: string;
  /** Middle column — hidden until xl, where there is room for it. */
  middleTop?: string;
  middleBottom?: string;
  /**
   * Yellow the middle line when it carries something to act on: a follow-up,
   * an assessment, an overdue band. Everything else stays muted.
   */
  middleBottomHighlighted?: boolean;
  rightTop?: string;
  rightTopClassName?: string;
  rightBottom?: string;
}

export interface WorkbenchDetailHeader {
  title: string;
  subtitle: string;
  /** Optional figure shown large to the right of the heading. */
  rightValue?: string;
  rightValueClassName?: string;
  rightLabel?: string;
}

interface InsightWorkbenchProps<T> {
  items: T[];
  idOf: (item: T) => string;
  /** DOM ids for the detail region and its heading — stable per drilldown. */
  domId: string;
  headingId: string;
  tiles: (visible: T[], all: T[], filters: Record<string, string>) => WorkbenchTile[];
  searchLabel: string;
  searchPlaceholder: string;
  searchFieldsOf: (item: T) => (string | null | undefined)[];
  filters?: WorkbenchFilterSpec<T>[];
  /** Filter values to open with, e.g. a duty band deep-linked from the dashboard. */
  initialFilters?: Record<string, string>;
  /** Search text to open with, e.g. a `q` value carried in the URL. */
  initialSearch?: string;
  /**
   * On narrow screens, open the record somewhere else (its own page) instead
   * of scrolling down to the inline detail pane. When set, the inline pane is
   * only shown from the `lg` breakpoint up.
   */
  onOpenCompact?: (item: T) => void;
  /**
   * Reports search and filter changes so the owner can keep them somewhere
   * that survives leaving the page (e.g. the URL). Not called on first render.
   */
  onFiltersChange?: (state: { search: string; filters: Record<string, string> }) => void;
  /**
   * "drilldown" (default) is the square, framed insight view. "page" is a
   * full page: rounded like the Match Report cards, and on desktop the list
   * and detail fill the height of the window instead of stopping at 68%.
   */
  variant?: "drilldown" | "page";
  listLabel: string;
  rowAriaLabel: (item: T) => string;
  rowOf: (item: T) => WorkbenchRowContent;
  detailHeader: (item: T) => WorkbenchDetailHeader;
  renderDetail: (item: T) => ReactNode;
  /** Shown in the list when the filters exclude everything. */
  noMatchLabel: string;
  /** Shown in the detail pane when there is nothing at all to select. */
  placeholder: string;
}

/** Order-independent key for a search and filter set, ignoring cleared ("") values. */
function stateKey(search: string, values: Record<string, string>): string {
  return JSON.stringify({
    search,
    filters: Object.entries(values)
      .filter(([, value]) => Boolean(value))
      .sort(([a], [b]) => a.localeCompare(b)),
  });
}

const TILE_COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

export function InsightWorkbench<T>({
  items,
  idOf,
  domId,
  headingId,
  tiles,
  searchLabel,
  searchPlaceholder,
  searchFieldsOf,
  filters = [],
  initialFilters,
  initialSearch,
  onOpenCompact,
  onFiltersChange,
  variant = "drilldown",
  listLabel,
  rowAriaLabel,
  rowOf,
  detailHeader,
  renderDetail,
  noMatchLabel,
  placeholder,
}: InsightWorkbenchProps<T>) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(
    () => initialFilters ?? {},
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The owner may mirror search and filters somewhere that survives leaving
  // the page (the URL) and hand them back as the seeds. Each change reported
  // is remembered until it comes back, so those echoes are ignored and only a
  // genuinely outside change (Back, or a link that clears the URL) replaces
  // what is on screen. Without this, a slow echo of "a" could overwrite "ab"
  // while someone is still typing.
  const seedKey = stateKey(initialSearch ?? "", initialFilters ?? {});
  const echoes = useRef<string[]>([]);
  const currentKey = stateKey(search, filterValues);
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;
  useEffect(() => {
    const echoAt = echoes.current.indexOf(seedKey);
    if (echoAt >= 0) {
      echoes.current.splice(0, echoAt + 1);
      return;
    }
    echoes.current = [];
    if (seedKey === currentKeyRef.current) return;
    const seed = JSON.parse(seedKey) as { search: string; filters: [string, string][] };
    setSearch(seed.search);
    setFilterValues(Object.fromEntries(seed.filters));
  }, [seedKey]);

  const onFiltersChangeRef = useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;
  const lastReported = useRef(currentKey);
  useEffect(() => {
    if (currentKey === lastReported.current) return;
    lastReported.current = currentKey;
    if (!onFiltersChangeRef.current) return;
    echoes.current.push(currentKey);
    onFiltersChangeRef.current({ search, filters: filterValues });
    // `currentKey` captures both values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  const detailPanelRef = useRef<HTMLElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  const filterOptions = useMemo(
    () => filters.map((filter) => ({ filter, options: filter.optionsOf(items) })),
    [filters, items],
  );

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en-GB");
    return items.filter((item) => {
      for (const filter of filters) {
        const value = filterValues[filter.id];
        if (value && !filter.matches(item, value)) return false;
      }
      if (!query) return true;
      return searchFieldsOf(item).some((field) =>
        (field ?? "").toLocaleLowerCase("en-GB").includes(query),
      );
    });
  }, [filterValues, filters, items, search, searchFieldsOf]);

  const selectedItem =
    visibleItems.find((item) => idOf(item) === selectedId) ?? visibleItems[0] ?? null;

  const hasFilters = Boolean(search) || Object.values(filterValues).some(Boolean);

  const clearFilters = () => {
    setSearch("");
    setFilterValues({});
  };

  const selectItem = (item: T) => {
    setSelectedId(idOf(item));
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    if (onOpenCompact) {
      onOpenCompact(item);
      return;
    }
    window.requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      detailHeadingRef.current?.focus({ preventScroll: true });
    });
  };

  const summaryTiles = tiles(visibleItems, items, filterValues);
  const isPage = variant === "page";
  // Page variant: the split view takes the rest of the window on desktop, and
  // each side scrolls on its own. 19rem is the header, page title and tiles.
  const paneHeight = isPage
    ? "lg:min-h-0 lg:overflow-y-auto"
    : "lg:max-h-[min(68vh,48rem)] lg:overflow-y-auto lg:supports-[height:100dvh]:max-h-[min(68dvh,48rem)]";
  const header = selectedItem ? detailHeader(selectedItem) : null;

  return (
    <div className="space-y-3">
      <div
        className={
          isPage
            ? // Hairline grid: two up on phones so the list starts sooner.
              `grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border ${
                TILE_COLUMNS[summaryTiles.length] ?? "sm:grid-cols-3"
              }`
            : `grid grid-cols-1 border border-border bg-card ${
                TILE_COLUMNS[summaryTiles.length] ?? "sm:grid-cols-3"
              }`
        }
      >
        {summaryTiles.map((tile, index) => (
          <div
            key={tile.label}
            className={`px-4 py-3 ${
              isPage
                ? "min-w-0 bg-card"
                : index === summaryTiles.length - 1
                  ? ""
                  : "border-b border-border sm:border-b-0 sm:border-r"
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {tile.label}
            </div>
            <div
              className={`mt-1 ${
                tile.mono ? "font-mono text-xl font-semibold tabular-nums" : "text-sm font-medium"
              } ${tile.valueClassName ?? ""}`}
            >
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      <div
        className={`grid min-w-0 border border-border bg-card ${
          isPage
            ? "overflow-hidden rounded-lg lg:h-[calc(100vh-19rem)] lg:min-h-[30rem] lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] lg:supports-[height:100dvh]:h-[calc(100dvh-19rem)]"
            : "lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)]"
        }`}
      >
        <section
          className={`min-w-0 border-border lg:border-b-0 lg:border-r ${onOpenCompact ? "" : "border-b"} ${
            isPage ? "lg:flex lg:min-h-0 lg:flex-col" : ""
          }`}
          aria-label={listLabel}
        >
          <div
            className={`grid gap-2 border-b border-border bg-card p-3 lg:sticky lg:top-0 lg:z-[1] ${
              isPage ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
            }`}
          >
            <label
              className={`relative ${isPage ? "col-span-2" : "sm:col-span-2 lg:col-span-1 xl:col-span-2"}`}
            >
              <span className="sr-only">{searchLabel}</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            {filterOptions.map(({ filter, options }) => (
              <label key={filter.id}>
                <span className="sr-only">{filter.label}</span>
                <select
                  value={filterValues[filter.id] ?? ""}
                  onChange={(event) =>
                    setFilterValues((current) => ({ ...current, [filter.id]: event.target.value }))
                  }
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">{filter.allLabel}</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground ${
                  isPage ? "col-span-2" : "sm:col-span-2 lg:col-span-1 xl:col-span-2"
                }`}
              >
                <X className="size-3.5" aria-hidden="true" /> Clear filters
              </button>
            ) : null}
          </div>

          <div className={isPage ? `lg:flex-1 ${paneHeight}` : paneHeight}>
            {visibleItems.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs text-muted-foreground">
                {noMatchLabel}
              </div>
            ) : (
              visibleItems.map((item) => {
                const id = idOf(item);
                const row = rowOf(item);
                const isSelected = selectedItem != null && idOf(selectedItem) === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-controls={domId}
                    aria-label={rowAriaLabel(item)}
                    onClick={() => selectItem(item)}
                    className={`grid min-h-20 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-3 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring xl:grid-cols-[minmax(0,1.25fr)_minmax(8rem,0.75fr)_auto] ${
                      isSelected
                        ? onOpenCompact
                          ? // On phones a tap opens the record, so nothing is "selected".
                            "hover:bg-accent/25 lg:bg-primary/10 lg:shadow-[inset_3px_0_0_var(--primary)]"
                          : "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]"
                        : "hover:bg-accent/25"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden="true">
                        <Avatar initials={row.initials} size={28} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{row.title}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {row.subtitle}
                        </span>
                      </span>
                    </span>
                    <span className="hidden min-w-0 xl:block">
                      <span className="block truncate text-[11px] font-medium">
                        {row.middleTop}
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-[10px] ${
                          row.middleBottomHighlighted ? "text-warning" : "text-muted-foreground"
                        }`}
                      >
                        {row.middleBottom}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={`block font-mono text-[10px] text-muted-foreground ${
                          row.rightTopClassName ?? ""
                        }`}
                      >
                        {row.rightTop}
                      </span>
                      {row.rightBottom ? (
                        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                          {row.rightBottom}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section
          ref={detailPanelRef}
          id={domId}
          aria-labelledby={selectedItem ? headingId : undefined}
          aria-label={selectedItem ? undefined : listLabel}
          className={`min-w-0 scroll-mt-20 bg-muted/20 p-4 sm:p-5 ${
            isPage ? "lg:px-8 lg:py-7" : ""
          } ${onOpenCompact ? "hidden lg:block" : ""} ${paneHeight}`}
        >
          {selectedItem && header ? (
            <>
              <p className="sr-only" aria-live="polite">
                Showing details for {header.title}
              </p>
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2
                    ref={detailHeadingRef}
                    id={headingId}
                    tabIndex={-1}
                    className={
                      isPage
                        ? "break-words font-display text-2xl font-bold tracking-tight"
                        : "break-words text-xl font-semibold tracking-tight"
                    }
                  >
                    {header.title}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">{header.subtitle}</p>
                </div>
                {header.rightValue ? (
                  <div className="shrink-0 text-right">
                    <div
                      className={`font-mono text-2xl font-semibold tabular-nums ${
                        header.rightValueClassName ?? ""
                      }`}
                    >
                      {header.rightValue}
                    </div>
                    {header.rightLabel ? (
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        {header.rightLabel}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {renderDetail(selectedItem)}
            </>
          ) : (
            <div className="flex min-h-56 items-center justify-center text-center text-xs text-muted-foreground">
              {placeholder}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
