import type { Member } from "@portal/api/users";
import type { Team } from "@portal/api/teams";

/** One team section in the roster: the team, its owners, and its members. */
export interface TeamGroup {
  id: number;
  name: string;
  /** Usernames of the team owners (resolved to display names by the UI). */
  owners: string[];
  members: Member[];
  /** SaaS personal team - not renameable/deletable; the UI hides those controls. */
  isPersonal?: boolean;
}

/** The roster split into Organization owners, teams, and guests. */
export interface Directory {
  organization: Member[];
  teams: TeamGroup[];
  guests: Member[];
}

/**
 * Group the flat roster into the directory shape the Users page renders:
 * admins are the Organization owners, web-only users are Guests, and everyone
 * else sits under their team. Empty teams are omitted from the roster (they're
 * still creatable / visible via team management).
 */
export function buildDirectory(members: Member[], teams: Team[]): Directory {
  const organization = members.filter((m) => m.role === "admin");
  const guests = members.filter((m) => m.role === "guest");

  const byTeam = new Map<number, Member[]>();
  for (const m of members) {
    if (m.role === "admin" || m.role === "guest") continue;
    if (m.teamId == null) continue;
    const list = byTeam.get(m.teamId) ?? [];
    list.push(m);
    byTeam.set(m.teamId, list);
  }

  const teamGroups: TeamGroup[] = teams
    .map((t) => ({
      id: t.id,
      name: t.name,
      owners: t.owners,
      members: byTeam.get(t.id) ?? [],
      isPersonal: t.isPersonal,
    }))
    .filter((g) => g.members.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { organization, teams: teamGroups, guests };
}
