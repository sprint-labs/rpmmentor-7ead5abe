import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * A single player record now lives on that goalkeeper's profile.
 *
 * This redirects to the roster rather than to the profile itself: the old URL
 * carries a canonical `players.id`, and the profile is addressed by its legacy
 * `gk-…` slug, which cannot be derived from the id without loading the row.
 * The roster is one click from the right person and needs no lookup to reach.
 */
export const Route = createFileRoute("/system/players/$playerId")({
  beforeLoad: () => {
    throw redirect({ to: "/goalkeepers" });
  },
});
