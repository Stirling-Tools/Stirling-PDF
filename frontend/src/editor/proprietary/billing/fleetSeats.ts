import type { TeamHolding } from "@app/billing/types";

/** Replaces this deployment's last report with its live roster, without counting it twice. */
export function fleetUsersInUse(
  team: TeamHolding,
  deviceId?: string | null,
  localUsers?: number | null,
): number {
  if (!team.breakdown) return team.usersInUse;
  return team.breakdown.deployments.reduce(
    (total, deployment) =>
      total +
      (deployment.deviceId === deviceId && localUsers != null
        ? localUsers
        : (deployment.users ?? 0)),
    team.breakdown.cloudUsers,
  );
}
