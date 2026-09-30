import type { LoggedInteraction } from "@/lib/interactions/schema";

/**
 * What has to be typed to confirm a delete: the goalkeeper and the type, e.g.
 * "Josh Bentley Phone Call". Specific enough that it cannot be typed by habit.
 */
export function deleteConfirmationPhrase(interaction: LoggedInteraction): string {
  return `${interaction.goalkeeperName.trim()} ${interaction.interactionType}`.replace(/\s+/g, " ");
}

function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
}

export function confirmationMatches(typed: string, interaction: LoggedInteraction): boolean {
  return normalise(typed) === normalise(deleteConfirmationPhrase(interaction));
}
