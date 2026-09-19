import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Player Records has been folded into the goalkeeper roster.
 *
 * Correcting a record is done on the goalkeeper's own profile, through Edit
 * Details, which already carries every field this page offered and re-checks
 * the caller's role on the server the same way. Keeping a second list of the
 * same people, reachable only from the System menu, meant two places to look
 * for one player and two places to keep in step.
 *
 * The route stays as a redirect rather than disappearing: these URLs are in
 * bookmarks and in older notification links, and a 404 is a worse answer than
 * the roster.
 */
export const Route = createFileRoute("/system/players/")({
  beforeLoad: () => {
    throw redirect({ to: "/goalkeepers" });
  },
});
