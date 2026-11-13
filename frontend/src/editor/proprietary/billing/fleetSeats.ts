import type { TeamHolding } from "@editor/billing/types";

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

/**
 * Users the team occupies. Outside a fleet, {@code localUsers} replaces the wallet's count whenever
 * it is passed, null included; only undefined falls back to the wallet.
 */
export function teamUsersInUse(
  team: TeamHolding | undefined,
  deviceId?: string | null,
  localUsers?: number | null,
): number | null | undefined {
  if (team?.fleet) return fleetUsersInUse(team, deviceId, localUsers);
  return localUsers === undefined ? team?.usersInUse : localUsers;
}
