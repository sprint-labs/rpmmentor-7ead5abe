import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Copy, FileText, Loader2, MessageSquare, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/primitives";
import { withPermission } from "@/components/require-permission";
import { ROLE_LABEL } from "@/lib/auth";
import { listUsersAndRoles } from "@/lib/users-and-roles.functions";
import { cn } from "@/lib/utils";
import { formatDate, formatRelative } from "@/lib/mock-data";

export const Route = createFileRoute("/users")({
  component: withPermission(UsersAndRolesPage, "mentors.view"),
});

const QUERY_KEY = ["users-and-roles"] as const;

// Every column is a fraction of the row, never content-sized: the header and
// each row are separate grids, so content-sized columns would land at a
// different width on every row and nothing would line up. Names get the
// smallest shares — the data columns are what people come here to read.
const GRID_COLS =
  "md:grid-cols-[minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]";

/** Accounts quiet this long are flagged as likely not using the platform. */
const STALE_LOGIN_DAYS = 30;

function lastLoginTone(lastLoginAt: string | null): string {
  if (!lastLoginAt) return "text-destructive font-medium";
  const days = (Date.now() - new Date(lastLoginAt).getTime()) / 86_400_000;
  if (days > STALE_LOGIN_DAYS) return "text-warning font-medium";
  return "text-foreground";
}

function copyUserId(id: string) {
  navigator.clipboard
    .writeText(id)
    .then(() => toast.success("User ID copied"))
    .catch(() => toast.error("Copy failed"));
}

function UsersAndRolesPage() {
  const list = useServerFn(listUsersAndRoles);
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => list(),
  });
  const users = query.data ?? [];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="Users & Roles"
        description="Real user accounts, their current role, and confirmed activity recorded through Mentor Hub."
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className={`hidden ${GRID_COLS} items-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:grid`}>
          <div>First name</div>
          <div>Last name</div>
          <div>User ID</div>
          <div>Role</div>
          <div>Last login</div>
          <div>Match reports</div>
          <div>Interactions</div>
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
            {users.map((user) => {
              const fullName =
                [user.firstName, user.lastName].filter((p) => p && p !== "—").join(" ") ||
                user.coachIdentity;
              return (
                <li
                  key={user.id}
                  className={`grid items-center gap-x-3 gap-y-2 px-4 py-4 ${GRID_COLS}`}
                >
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">First name</div>
                    <div className="text-sm font-medium truncate">{user.firstName}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">Last name</div>
                    <div className="text-sm font-medium truncate">{user.lastName}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">User ID</div>
                    <button
                      type="button"
                      onClick={() => copyUserId(user.id)}
                      title="Copy full user ID"
                      className="inline-flex items-center gap-1.5 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {user.id.slice(0, 8)}
                      <Copy className="size-3" />
                    </button>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">Role</div>
                    <span className="inline-flex rounded-full border border-border bg-accent px-2 py-1 text-xs font-medium">
                      {user.role ? ROLE_LABEL[user.role] : "No role"}
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">Last login</div>
                    <span
                      className={cn("whitespace-nowrap text-sm", lastLoginTone(user.lastLoginAt))}
                      title={user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never signed in"}
                    >
                      {user.lastLoginAt ? formatRelative(user.lastLoginAt) : "Never"}
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">Match reports</div>
                    <Link
                      to="/reports"
                      search={{
                        from: "",
                        to: "",
                        coach: user.coachIdentity,
                        mentorProfileId: user.id,
                        source: "reports-submitted",
                        gk: "",
                        openSubmit: "",
                        eventId: "",
                        last5Gk: "",
                        matchDate: "",
                        opponent: "",
                      }}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums text-primary hover:bg-accent/40 hover:underline"
                      title={`See all match reports ${fullName} submitted`}
                    >
                      <FileText className="size-3.5 shrink-0" />
                      {user.matchReportsSubmitted}
                    </Link>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">Interactions</div>
                    <Link
                      to="/interactions"
                      search={{
                        from: "",
                        to: "",
                        mentorId: user.id,
                        type: "",
                        source: "interactions-logged",
                        q: "",
                        page: 1,
                        openLog: "",
                        gkId: "",
                        date: "",
                        eventId: "",
                      }}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums text-primary hover:bg-accent/40 hover:underline"
                      title={`See all interactions ${fullName} logged`}
                    >
                      <MessageSquare className="size-3.5 shrink-0" />
                      {user.interactionsLogged}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Match Report totals include confirmed submissions made through Mentor Hub. Historic Sheet-only reports cannot be attributed to a user without a stable user ID. Interaction totals exclude the Live Match Observation created automatically by a Match Report.
      </p>
    </div>
  );
}
