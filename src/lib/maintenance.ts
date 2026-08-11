/**
 * Temporary rollout gate.
 *
 * Disabled for normal operation. Enable it only during an explicitly approved
 * production incident or recovery window.
 */
export const MAINTENANCE_MODE = false;

type MaintenanceUser = {
  role: string;
  actualRole?: string;
};

const VALID_ACTUAL_ROLES = new Set(["super_admin", "admin", "mentor_manager", "mentor"]);

/**
 * Restrict every authenticated account except a genuine Super Admin.
 * `actualRole` deliberately takes precedence so the interface only preview
 * cannot lock a Super Admin out or let another role bypass maintenance.
 */
export function isRestrictedDuringMaintenance(
  user: MaintenanceUser | null,
  maintenanceMode = MAINTENANCE_MODE,
): boolean {
  if (!user) return false;
  if (!user.actualRole || !VALID_ACTUAL_ROLES.has(user.actualRole)) return true;
  return maintenanceMode && user.actualRole !== "super_admin";
}
