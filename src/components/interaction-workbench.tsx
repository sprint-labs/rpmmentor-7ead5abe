import { Link } from "@tanstack/react-router";
import { ArrowRight, Mic2, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/primitives";
import { useInteractionAudioState } from "@/lib/interactions/use-interactions";
import { formatDateOnly, type LoggedInteraction } from "@/lib/interactions/schema";

interface InteractionWorkbenchProps {
  interactions: LoggedInteraction[];
  periodLabel: string;
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(interaction: LoggedInteraction): string {
  if (interaction.matchReportId) return "Created from a Match Report";
  if (interaction.calendarEventId) return "Logged for a scheduled event";
  return "Logged directly";
}

function DetailFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-border pb-3">
      <dt className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function InteractionWorkbench({ interactions, periodLabel }: InteractionWorkbenchProps) {
  const [search, setSearch] = useState("");
  const [interactionType, setInteractionType] = useState("");
  const [mentorName, setMentorName] = useState("");
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  const interactionTypes = useMemo(
    () => [...new Set(interactions.map((interaction) => interaction.interactionType))].sort(),
    [interactions],
  );
  const mentors = useMemo(
    () =>
      [
        ...new Set(interactions.map((interaction) => interaction.mentorName).filter(Boolean)),
      ].sort(),
    [interactions],
  );

  const filteredInteractions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en-GB");
    return interactions.filter((interaction) => {
      if (interactionType && interaction.interactionType !== interactionType) return false;
      if (mentorName && interaction.mentorName !== mentorName) return false;
      if (!query) return true;
      return [
        interaction.goalkeeperName,
        interaction.club,
        interaction.mentorName,
        interaction.notes,
        interaction.outcome,
        interaction.followUp,
      ].some((value) => value.toLocaleLowerCase("en-GB").includes(query));
    });
  }, [interactionType, interactions, mentorName, search]);

  const selectedInteraction =
    filteredInteractions.find((interaction) => interaction.id === selectedInteractionId) ??
    filteredInteractions[0] ??
    null;
  const selectedInteractionIds = useMemo(
    () => (selectedInteraction ? [selectedInteraction.id] : []),
    [selectedInteraction],
  );
  const interactionAudio = useInteractionAudioState(selectedInteractionIds);
  const selectedAudio = selectedInteraction
    ? (interactionAudio.audioByInteraction.get(selectedInteraction.id) ?? [])
    : [];
  const hasFilters = Boolean(search || interactionType || mentorName);

  const clearFilters = () => {
    setSearch("");
    setInteractionType("");
    setMentorName("");
  };

  const selectInteraction = (interactionId: string) => {
    setSelectedInteractionId(interactionId);
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    window.requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      detailHeadingRef.current?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 border border-border bg-card sm:grid-cols-3">
        <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Interactions
          </div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">
            {filteredInteractions.length}
            {hasFilters ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                of {interactions.length}
              </span>
            ) : null}
          </div>
        </div>
        <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Period
          </div>
          <div className="mt-1 text-sm font-medium">{periodLabel}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Scope
          </div>
          <div className="mt-1 truncate text-sm font-medium">{mentorName || "All mentors"}</div>
        </div>
      </div>

      <div className="grid min-w-0 border border-border bg-card lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)]">
        <section
          className="min-w-0 border-b border-border lg:border-b-0 lg:border-r"
          aria-label="Interactions in period"
        >
          <div className="grid grid-cols-1 gap-2 border-b border-border bg-card p-3 sm:grid-cols-2 lg:sticky lg:top-0 lg:z-[1] lg:grid-cols-1 xl:grid-cols-2">
            <label className="relative sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <span className="sr-only">Search interactions</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search goalkeeper, club or notes"
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label>
              <span className="sr-only">Filter by interaction type</span>
              <select
                value={interactionType}
                onChange={(event) => setInteractionType(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All types</option>
                {interactionTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by mentor</span>
              <select
                value={mentorName}
                onChange={(event) => setMentorName(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All mentors</option>
                {mentors.map((mentor) => (
                  <option key={mentor} value={mentor}>
                    {mentor}
                  </option>
                ))}
              </select>
            </label>
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground sm:col-span-2 lg:col-span-1 xl:col-span-2"
              >
                <X className="size-3.5" aria-hidden="true" /> Clear filters
              </button>
            ) : null}
          </div>

          <div className="lg:max-h-[min(68vh,48rem)] lg:overflow-y-auto lg:supports-[height:100dvh]:max-h-[min(68dvh,48rem)]">
            {filteredInteractions.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs text-muted-foreground">
                No interactions match these filters.
              </div>
            ) : (
              filteredInteractions.map((interaction) => {
                const isSelected = selectedInteraction?.id === interaction.id;
                return (
                  <button
                    key={interaction.id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-controls="selected-interaction-detail"
                    aria-label={`Show details for ${interaction.goalkeeperName} on ${formatDateOnly(interaction.occurredAt)}`}
                    onClick={() => selectInteraction(interaction.id)}
                    className={`grid min-h-20 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-3 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring xl:grid-cols-[minmax(0,1.25fr)_minmax(8rem,0.75fr)_auto] ${
                      isSelected
                        ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]"
                        : "hover:bg-accent/25"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden="true">
                        <Avatar initials={initialsOf(interaction.goalkeeperName)} size={28} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">
                          {interaction.goalkeeperName}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {interaction.club ? `${interaction.club} · ` : ""}
                          {interaction.interactionType}
                        </span>
                      </span>
                    </span>
                    <span className="hidden min-w-0 xl:block">
                      <span className="block truncate text-[11px] font-medium">
                        {interaction.mentorName || "Mentor not recorded"}
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-[10px] ${
                          interaction.followUp ? "text-warning" : "text-muted-foreground"
                        }`}
                      >
                        {interaction.followUp || interaction.outcome || "No follow-up recorded"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                      {formatDateOnly(interaction.occurredAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section
          ref={detailPanelRef}
          id="selected-interaction-detail"
          aria-labelledby={selectedInteraction ? "selected-interaction-heading" : undefined}
          aria-label={selectedInteraction ? undefined : "Selected interaction details"}
          className="min-w-0 scroll-mt-20 bg-muted/20 p-4 sm:p-5 lg:max-h-[min(68vh,48rem)] lg:overflow-y-auto lg:supports-[height:100dvh]:max-h-[min(68dvh,48rem)]"
        >
          {selectedInteraction ? (
            <>
              <p className="sr-only" aria-live="polite">
                Showing details for {selectedInteraction.goalkeeperName}
              </p>
              <div className="min-w-0">
                <h2
                  ref={detailHeadingRef}
                  id="selected-interaction-heading"
                  tabIndex={-1}
                  className="break-words text-xl font-semibold tracking-tight"
                >
                  {selectedInteraction.goalkeeperName}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedInteraction.interactionType} ·{" "}
                  {formatDateOnly(selectedInteraction.occurredAt)}
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                <DetailFact
                  label="Mentor"
                  value={selectedInteraction.mentorName || "Not recorded"}
                />
                <DetailFact label="Club" value={selectedInteraction.club || "Not recorded"} />
                <DetailFact label="Interaction type" value={selectedInteraction.interactionType} />
                <DetailFact label="Outcome" value={selectedInteraction.outcome || "Not recorded"} />
                <DetailFact label="Source" value={sourceLabel(selectedInteraction)} />
              </dl>

              <section className="mt-5" aria-labelledby="selected-interaction-notes">
                <h3
                  id="selected-interaction-notes"
                  className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                >
                  Notes
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                  {selectedInteraction.notes || "No notes recorded."}
                </p>
              </section>

              <section className="mt-5" aria-labelledby="selected-interaction-follow-up">
                <h3
                  id="selected-interaction-follow-up"
                  className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                >
                  Follow-up action
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                  {selectedInteraction.followUp || "No follow-up action recorded."}
                </p>
              </section>

              <section
                className="mt-5"
                aria-labelledby="selected-interaction-voice-note"
                aria-busy={interactionAudio.isLoading}
              >
                <h3
                  id="selected-interaction-voice-note"
                  className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                >
                  <Mic2 className="size-3" aria-hidden="true" /> Voice note
                </h3>
                {interactionAudio.isLoading ? (
                  <p className="mt-2 text-sm text-muted-foreground">Loading voice note…</p>
                ) : interactionAudio.isError ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    We couldn’t load the voice note. Refresh the page to try again.
                  </p>
                ) : selectedAudio.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No voice note attached.</p>
                ) : (
                  <div className="mt-2 space-y-3">
                    {selectedAudio.map((clip, index) => (
                      <div key={clip.mediaId}>
                        <p className="mb-1 text-xs text-muted-foreground">
                          {clip.title || `Voice note ${index + 1}`}
                        </p>
                        {clip.signedUrl ? (
                          <audio
                            src={clip.signedUrl}
                            controls
                            preload="none"
                            aria-label={`Voice note for the interaction with ${selectedInteraction.goalkeeperName} on ${formatDateOnly(selectedInteraction.occurredAt)}`}
                            className="h-9 w-full"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Voice note saved, but playback is unavailable. Refresh to try again.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3 border-t border-border pt-4 sm:grid-cols-2">
                <DetailFact
                  label="Record created"
                  value={formatDateTime(selectedInteraction.createdAt)}
                />
                <DetailFact
                  label="Last updated"
                  value={
                    selectedInteraction.updatedAt
                      ? formatDateTime(selectedInteraction.updatedAt)
                      : "Not edited"
                  }
                />
              </dl>

              {selectedInteraction.matchReportId ? (
                <Link
                  to="/reports/$reportId"
                  params={{ reportId: selectedInteraction.matchReportId }}
                  className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40"
                >
                  View source report <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : selectedInteraction.calendarEventId ? (
                <Link
                  to="/calendar"
                  className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40"
                >
                  Open calendar <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-56 items-center justify-center text-center text-xs text-muted-foreground">
              Select an interaction to review its complete record.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
