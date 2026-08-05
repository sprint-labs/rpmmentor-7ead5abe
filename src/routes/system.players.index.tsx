import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { RequirePermission } from "@/components/require-permission";
import { Card } from "@/components/primitives";
import { listPlayers } from "@/lib/players.functions";

export const Route = createFileRoute("/system/players/")({
  component: PlayerRecordsPage,
  head: () => ({
    meta: [
      { title: "Player Records · Mentor Hub" },
      { name: "description", content: "Canonical player records from the Mentor Hub database, with editable current club." },
      { property: "og:title", content: "Player Records · Mentor Hub" },
      { property: "og:description", content: "Canonical player records with editable current club." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PlayerRecordsPage() {
  return (
    <RequirePermission permission="players.edit_club">
      <PlayerRecordsInner />
    </RequirePermission>
  );
}

function PlayerRecordsInner() {
  const fetchPlayers = useServerFn(listPlayers);
  const { data, isLoading, error } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => fetchPlayers(),
    staleTime: 60_000,
  });
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const list = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (p) => p.full_name.toLowerCase().includes(needle) || p.current_club.toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Player Records</h1>
        <p className="text-xs text-muted-foreground">
          Canonical database records. Current club can be corrected by managers, admins and super
          admins.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          aria-label="Search players"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or club"
          className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading player records…</p>
        ) : error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Could not load player records."}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No player records match.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.current_club || "No club recorded"}</p>
                </div>
                <Link
                  to="/system/players/$playerId"
                  params={{ playerId: p.id }}
                  className="text-xs text-primary hover:text-primary/80 shrink-0"
                >
                  Edit club
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
