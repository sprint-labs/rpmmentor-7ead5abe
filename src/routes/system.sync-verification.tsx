import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { COMPETITIONS } from "@/lib/competitions";
import {
  findPlayerByName,
  interactionBelongsToGoalkeeper,
  legacyGkSlugForName,
  normalisePersonName,
} from "@/lib/goalkeeper-player-link";
import { goalkeepers } from "@/lib/mock-data";

export const Route = createFileRoute("/system/sync-verification")({
  component: SyncVerificationPage,
  head: () => ({
    meta: [
      { title: "Sync Verification · Mentor Hub" },
      {
        name: "description",
        content:
          "Confirms the competitions list, goalkeeper player-linking helpers and Harrison Male roster data are loaded in this build.",
      },
      { property: "og:title", content: "Sync Verification · Mentor Hub" },
      {
        property: "og:description",
        content:
          "Confirms the competitions list, goalkeeper player-linking helpers and Harrison Male roster data are loaded in this build.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Check {
  label: string;
  pass: boolean;
  detail: string;
}

const REQUIRED_COMPETITIONS = [
  "Carabao Cup",
  "EFL Trophy",
  "FA Cup",
  "Premier League Under 18s",
  "Premier League Under 16s",
];

function runChecks(): { group: string; checks: Check[] }[] {
  const missingComps = REQUIRED_COMPETITIONS.filter(
    (c) => !(COMPETITIONS as readonly string[]).includes(c),
  );

  const players = [
    { id: "p1", full_name: "James Beadle" },
    { id: "p2", full_name: "Harrison Male" },
  ];
  const found = findPlayerByName(players, "harrison male");
  const gk = { id: "gk-harrison-male", name: "Harrison Male" };
  const matchesBySlug = interactionBelongsToGoalkeeper(
    { gkSlug: "gk-harrison-male", goalkeeperName: "X", playerId: null },
    gk,
    null,
  );
  const matchesByPlayerId = interactionBelongsToGoalkeeper(
    { gkSlug: "", goalkeeperName: "Other", playerId: "p2" },
    gk,
    "p2",
  );
  const matchesByName = interactionBelongsToGoalkeeper(
    { gkSlug: "", goalkeeperName: "Harrison Male", playerId: null },
    gk,
    null,
  );
  const rejectsUnrelated = !interactionBelongsToGoalkeeper(
    { gkSlug: "gk-other", goalkeeperName: "Other", playerId: "px" },
    gk,
    "p2",
  );

  const harrison = goalkeepers.find((g) => normalisePersonName(g.name) === "harrison male");

  return [
    {
      group: "Competitions list",
      checks: [
        {
          label: "COMPETITIONS module loaded",
          pass: COMPETITIONS.length > 0,
          detail: `${COMPETITIONS.length} competitions available`,
        },
        {
          label: "Cups and age groups present",
          pass: missingComps.length === 0,
          detail:
            missingComps.length === 0
              ? REQUIRED_COMPETITIONS.join(", ")
              : `Missing: ${missingComps.join(", ")}`,
        },
      ],
    },
    {
      group: "Player linking helpers",
      checks: [
        {
          label: "normalisePersonName",
          pass: normalisePersonName("  Harrison   Male ") === "harrison male",
          detail: `"  Harrison   Male " → "${normalisePersonName("  Harrison   Male ")}"`,
        },
        {
          label: "legacyGkSlugForName",
          pass: legacyGkSlugForName("Harrison Male") === "gk-harrison-male",
          detail: legacyGkSlugForName("Harrison Male"),
        },
        {
          label: "findPlayerByName",
          pass: found?.id === "p2" && findPlayerByName(players, "Nobody") === null,
          detail: found ? `Resolved to ${found.full_name} (${found.id})` : "No match",
        },
        {
          label: "interactionBelongsToGoalkeeper — slug / player id / name",
          pass: matchesBySlug && matchesByPlayerId && matchesByName,
          detail: `slug: ${matchesBySlug} · playerId: ${matchesByPlayerId} · name: ${matchesByName}`,
        },
        {
          label: "interactionBelongsToGoalkeeper — rejects unrelated",
          pass: rejectsUnrelated,
          detail: rejectsUnrelated ? "Unrelated interaction excluded" : "Incorrectly matched",
        },
      ],
    },
    {
      group: "Harrison Male roster data",
      checks: [
        {
          label: "Present in roster",
          pass: !!harrison,
          detail: harrison ? `id: ${harrison.id}` : "Not found",
        },
        {
          label: "Club is Tranmere Rovers",
          pass: harrison?.club === "Tranmere Rovers",
          detail: harrison?.club ?? "—",
        },
        {
          label: "League is EFL League Two",
          pass: harrison?.league === "EFL League Two",
          detail: harrison?.league ?? "—",
        },
      ],
    },
  ];
}

function SyncVerificationPage() {
  const { user, can } = useAuth();
  const canManage = !!user && can("system.manage");

  if (!canManage) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          You need the Super Admin role to view sync verification.
        </div>
      </div>
    );
  }

  const groups = runChecks();
  const all = groups.flatMap((g) => g.checks);
  const failed = all.filter((c) => !c.pass);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sync verification</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Runtime checks that the synced competitions list, player-linking helpers and roster data
          are loaded in this build.{" "}
          <Link to="/system/github" className="text-primary hover:underline">
            GitHub sync
          </Link>
        </p>
      </header>

      <div
        className={`rounded-lg border p-4 text-sm ${
          failed.length === 0
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
            : "border-amber-500/40 bg-amber-500/10 text-amber-200"
        }`}
      >
        {failed.length === 0
          ? `All ${all.length} checks passed — synced code is loaded correctly.`
          : `${failed.length} of ${all.length} checks failed — this build is out of sync.`}
      </div>

      {groups.map((g) => (
        <section key={g.group} className="rounded-lg border border-border bg-card overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 text-sm font-medium">{g.group}</h2>
          <ul className="divide-y divide-border">
            {g.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 px-4 py-3">
                {c.pass ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0">
                  <p className="text-sm leading-tight">{c.label}</p>
                  <p className="text-xs text-muted-foreground break-words">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
