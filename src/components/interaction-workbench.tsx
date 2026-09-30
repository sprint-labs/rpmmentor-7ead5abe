import type { ReactNode } from "react";
import { Mic2 } from "lucide-react";
import { InsightWorkbench } from "@/components/insight-workbench";
import { DetailFact } from "@/components/workbench-primitives";
import { initialsOf } from "@/lib/initials";
import { useInteractionAudioState } from "@/lib/interactions/use-interactions";
import {
  formatDateOnly,
  isDashboardInteractionType,
  type LoggedInteraction,
} from "@/lib/interactions/schema";

interface InteractionWorkbenchProps {
  interactions: LoggedInteraction[];
  periodLabel: string;
  /** Shown in the Scope tile when the list is already narrowed to one mentor. */
  scopeLabel?: string;
  initialFilters?: Record<string, string>;
  initialSearch?: string;
  /** Narrow screens: open the record on its own page instead of inline. */
  onOpenCompact?: (interaction: LoggedInteraction) => void;
  onFiltersChange?: (state: { search: string; filters: Record<string, string> }) => void;
  variant?: "drilldown" | "page";
  /** Edit / Open report / Delete buttons for the selected record. */
  renderActions?: (interaction: LoggedInteraction) => ReactNode;
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

/**
 * The complete read-only record. Its own component so the audio query keys off
 * whichever record is selected; also used by the standalone detail page.
 */
export function InteractionDetail({
  interaction,
  actions,
}: {
  interaction: LoggedInteraction;
  actions?: ReactNode;
}) {
  const interactionAudio = useInteractionAudioState([interaction.id]);
  const clips = interactionAudio.audioByInteraction.get(interaction.id) ?? [];

  return (
    <>
      {actions}
      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 2xl:grid-cols-3">
        <DetailFact label="Mentor" value={interaction.mentorName || "Not recorded"} />
        <DetailFact label="Club" value={interaction.club || "Not recorded"} />
        <DetailFact label="Interaction type" value={interaction.interactionType} />
        <DetailFact label="Outcome" value={interaction.outcome || "Not recorded"} />
        <DetailFact label="Source" value={sourceLabel(interaction)} />
      </dl>

      <section className="mt-5" aria-labelledby="selected-interaction-notes">
        <h3
          id="selected-interaction-notes"
          className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
        >
          Notes
        </h3>
        <p className="mt-2 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
          {interaction.notes || "No notes recorded."}
        </p>
      </section>

      <section className="mt-5" aria-labelledby="selected-interaction-follow-up">
        <h3
          id="selected-interaction-follow-up"
          className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
        >
          Follow-up action
        </h3>
        <p className="mt-2 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
          {interaction.followUp || "No follow-up action recorded."}
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
        ) : clips.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No voice note attached.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {clips.map((clip, index) => (
              <div key={clip.mediaId}>
                <p className="mb-1 text-xs text-muted-foreground">
                  {clip.title || `Voice note ${index + 1}`}
                </p>
                {clip.signedUrl ? (
                  <audio
                    src={clip.signedUrl}
                    controls
                    preload="none"
                    aria-label={`Voice note for the interaction with ${interaction.goalkeeperName} on ${formatDateOnly(interaction.occurredAt)}`}
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
        <DetailFact label="Record created" value={formatDateTime(interaction.createdAt)} />
        <DetailFact
          label="Last updated"
          value={interaction.updatedAt ? formatDateTime(interaction.updatedAt) : "Not edited"}
        />
      </dl>
    </>
  );
}

export function InteractionWorkbench({
  interactions,
  periodLabel,
  scopeLabel,
  initialFilters,
  initialSearch,
  onOpenCompact,
  onFiltersChange,
  variant,
  renderActions,
}: InteractionWorkbenchProps) {
  return (
    <InsightWorkbench<LoggedInteraction>
      items={interactions}
      initialFilters={initialFilters}
      initialSearch={initialSearch}
      onOpenCompact={onOpenCompact}
      onFiltersChange={onFiltersChange}
      variant={variant}
      idOf={(interaction) => interaction.id}
      domId="selected-interaction-detail"
      headingId="selected-interaction-heading"
      listLabel="Interactions in period"
      searchLabel="Search interactions"
      searchPlaceholder="Search goalkeeper, club or notes"
      searchFieldsOf={(interaction) => [
        interaction.goalkeeperName,
        interaction.club,
        interaction.mentorName,
        interaction.notes,
        interaction.outcome,
        interaction.followUp,
      ]}
      filters={[
        {
          id: "type",
          label: "Filter by interaction type",
          allLabel: "All types",
          optionsOf: (items) => [...new Set(items.map((i) => i.interactionType))].sort(),
          matches: (interaction, value) => interaction.interactionType === value,
        },
        {
          id: "mentor",
          label: "Filter by mentor",
          allLabel: "All mentors",
          optionsOf: (items) => [...new Set(items.map((i) => i.mentorName).filter(Boolean))].sort(),
          matches: (interaction, value) => interaction.mentorName === value,
        },
      ]}
      tiles={(visible, all, filterValues) => {
        // Match observations are counted apart so the headline matches the
        // dashboard's Interactions Logged figure, which excludes them.
        const touchpoints = visible.filter((i) => isDashboardInteractionType(i.interactionType));
        const allTouchpoints = all.filter((i) => isDashboardInteractionType(i.interactionType));
        return [
          {
            label: "Interactions",
            mono: true,
            value: (
              <>
                {touchpoints.length}
                {touchpoints.length !== allTouchpoints.length ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    of {allTouchpoints.length}
                  </span>
                ) : null}
              </>
            ),
          },
          {
            label: "Match observations",
            mono: true,
            value: visible.length - touchpoints.length,
          },
          { label: "Period", value: periodLabel },
          { label: "Scope", value: filterValues.mentor || scopeLabel || "All mentors" },
        ];
      }}
      rowAriaLabel={(interaction) =>
        `Show details for ${interaction.goalkeeperName} on ${formatDateOnly(interaction.occurredAt)}`
      }
      rowOf={(interaction) => ({
        initials: initialsOf(interaction.goalkeeperName),
        title: interaction.goalkeeperName,
        subtitle: `${interaction.club ? `${interaction.club} · ` : ""}${interaction.interactionType}`,
        middleTop: interaction.mentorName || "Mentor not recorded",
        middleBottom: interaction.followUp || interaction.outcome || "No follow-up recorded",
        middleBottomHighlighted: Boolean(interaction.followUp),
        rightTop: formatDateOnly(interaction.occurredAt),
      })}
      detailHeader={(interaction) => ({
        title: interaction.goalkeeperName,
        subtitle: `${interaction.interactionType} · ${formatDateOnly(interaction.occurredAt)}`,
      })}
      renderDetail={(interaction) => (
        <InteractionDetail
          key={interaction.id}
          interaction={interaction}
          actions={renderActions?.(interaction)}
        />
      )}
      noMatchLabel="No interactions match these filters."
      placeholder="Select an interaction to review its complete record."
    />
  );
}
