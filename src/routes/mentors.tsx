import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Loader2, Users } from "lucide-react";
import { PageHeader } from "@/components/primitives";
import { withPermission } from "@/components/require-permission";
import { ROLE_LABEL } from "@/lib/auth";
import { listUsersAndRoles } from "@/lib/users-and-roles.functions";

export const Route = createFileRoute("/mentors")({
  component: withPermission(UsersAndRolesPage, "mentors.view"),
});

const QUERY_KEY = ["users-and-roles"] as const;

function UsersAndRolesPage() {
  const list = useServerFn(listUsersAndRoles);
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => list(),
  });
  const users = query.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users & Roles"
        description="Real user accounts, their current role, and confirmed activity recorded through Mentor Hub."
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[1fr_1fr_180px_170px_170px] gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
          <div>First name</div>
          <div>Last name</div>
          <div>Role</div>
          <div className="text-right">Match Reports</div>
          <div className="text-right">Interactions</div>
        </div>

        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading users and activity…
          </div>
        ) : query.isError ? (
          <div className="px-4 py-12 text-center text-sm">
            <AlertCircle className="mx-auto mb-2 size-6 text-destructive" />
            <p className="font-medium text-destructive">Could not load Users & Roles</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {query.error instanceof Error ? query.error.message : "The live source is unavailable."}
            </p>
            <button
              type="button"
              onClick={() => query.refetch()}
              className="mt-3 inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
            >
              Retry
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Users className="mx-auto mb-2 size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No user profiles found</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((user) => (
              <li
                key={user.id}
                className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_1fr_180px_170px_170px] md:items-center"
              >
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">First name</div>
                  <div className="text-sm font-medium">{user.firstName}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">Last name</div>
                  <div className="text-sm font-medium">{user.lastName}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">Role</div>
                  <span className="inline-flex rounded-full border border-border bg-accent px-2 py-1 text-xs font-medium">
                    {user.role ? ROLE_LABEL[user.role] : "No role"}
                  </span>
                </div>
                <div className="rounded-md bg-muted/35 px-3 py-2 md:bg-transparent md:p-0 md:text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Total Match Reports Submitted
                  </div>
                  <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
                    {user.matchReportsSubmitted}
                  </div>
                </div>
                <div className="rounded-md bg-muted/35 px-3 py-2 md:bg-transparent md:p-0 md:text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Total Interactions Logged
                  </div>
                  <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
                    {user.interactionsLogged}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Match Report totals include confirmed submissions made through Mentor Hub. Historic Sheet-only reports cannot be attributed to a user without a stable user ID. Interaction totals exclude the Live Match Observation created automatically by a Match Report.
      </p>
    </div>
  );
}
