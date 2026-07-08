import { portalBackend } from "@portal/api/http";

/**
 * Teams service layer. The roster groups people under teams, each with a Team
 * Owner (a LEADER membership). Backed by the proprietary team endpoints
 * (/api/v1/team/*) plus the admin ui-data teams summary.
 */

export interface Team {
  id: number;
  name: string;
  userCount: number;
  /** Usernames of the team's owners (LEADER memberships). */
  owners: string[];
}

interface TeamsDto {
  teamsWithCounts: { id: number; name: string; userCount: number }[];
  teamOwners: Record<string, string[]>;
}

/** GET the teams summary and fold the owners map onto each team. */
export async function fetchTeams(): Promise<Team[]> {
  const data = await portalBackend.json<TeamsDto>(
    "/api/v1/proprietary/ui-data/teams",
  );
  return (data.teamsWithCounts ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    userCount: t.userCount,
    owners: data.teamOwners?.[String(t.id)] ?? [],
  }));
}

/** POST /api/v1/team/create. */
export async function createTeam(name: string): Promise<void> {
  await portalBackend.form("/api/v1/team/create", { name });
}

/** POST /api/v1/team/addUser. */
export async function addUserToTeam(
  teamId: number,
  userId: string,
): Promise<void> {
  await portalBackend.form("/api/v1/team/addUser", {
    teamId: String(teamId),
    userId,
  });
}

/** POST /api/v1/team/setOwner. */
export async function setTeamOwner(
  teamId: number,
  userId: string,
): Promise<void> {
  await portalBackend.form("/api/v1/team/setOwner", {
    teamId: String(teamId),
    userId,
  });
}

/** POST /api/v1/team/rename. */
export async function renameTeam(
  teamId: number,
  newName: string,
): Promise<void> {
  await portalBackend.form("/api/v1/team/rename", {
    teamId: String(teamId),
    newName,
  });
}

/** POST /api/v1/team/delete (blocked by the backend if the team still has members/configs). */
export async function deleteTeam(teamId: number): Promise<void> {
  await portalBackend.form("/api/v1/team/delete", { teamId: String(teamId) });
}
