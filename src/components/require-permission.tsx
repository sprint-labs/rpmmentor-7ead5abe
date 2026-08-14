import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { useAuth, type Permission } from "@/lib/auth";

interface Props {
  permission: Permission;
  children: ReactNode;
  title?: string;
  message?: string;
}

/**
 * Route-level permission gate. Renders `children` only when the current
 * session has `permission`; otherwise renders a shared Restricted card.
 *
 * This is the structural enforcement point — hiding a nav link is not
 * enough. Wrap every permission-gated route's page component so a direct
 * URL visit is blocked even if the sidebar hides the entry.
 */
export function RequirePermission({ permission, children, title, message }: Props) {
  const { user, can } = useAuth();

  if (user && can(permission)) return <>{children}</>;

  return (
    <div className="max-w-lg mx-auto mt-16 rounded-lg border border-border bg-card p-6 text-center">
      <ShieldOff className="size-8 mx-auto text-muted-foreground" />
      <h1 className="mt-3 text-lg font-semibold">{title ?? "Restricted"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? "You don't have permission to view this page."}
      </p>
      <Link
        to="/"
        className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

/** HOC form for wrapping a route component directly. */
export function withPermission<P extends object>(
  Component: (props: P) => ReactNode,
  permission: Permission,
) {
  return function Guarded(props: P) {
    return <RequirePermission permission={permission}>{Component(props)}</RequirePermission>;
  };
}
