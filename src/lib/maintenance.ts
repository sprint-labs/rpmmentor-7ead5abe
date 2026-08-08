/**
 * Temporary rollout gate.
 *
 * Keep this enabled while production validation is in progress. Set it to
 * false when Mentor Hub is ready for the wider team.
 */
export const MAINTENANCE_MODE = true;

type MaintenanceUser = {
  role: string;
  actualRole?: string;
};

/**
 * Restrict every authenticated account except a genuine Super Admin.
 * `actualRole` deliberately takes precedence so the interface only preview
 * cannot lock a Super Admin out or let another role bypass maintenance.
 */
export function isRestrictedDuringMaintenance(user: MaintenanceUser | null): boolean {
  if (!MAINTENANCE_MODE || !user) return false;
  return user.actualRole !== "super_admin";
}
