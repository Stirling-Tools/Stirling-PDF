import { describe, expect, it } from "vitest";
import { buildDirectory } from "@portal/components/users/directory";
import type { Member } from "@portal/api/users";
import type { Team } from "@portal/api/teams";

const member = (overrides: Partial<Member> = {}): Member => ({
  id: "2",
  name: "Priya",
  email: "priya@acme.com",
  username: "priya@acme.com",
  role: "member",
  status: "active",
  lastActive: "-",
  teamId: 1,
  teamName: "Acme",
  ...overrides,
});

const team = (id: number, name: string): Team => ({
  id,
  name,
  userCount: 0,
  owners: [],
});

describe("buildDirectory", () => {
  it("keeps a team that has no members yet", () => {
    const dir = buildDirectory(
      [member()],
      [team(1, "Acme"), team(2, "Brand new")],
    );

    expect(dir.teams.map((t) => t.name)).toEqual(["Acme", "Brand new"]);
    expect(dir.teams[1].members).toEqual([]);
  });

  it("sorts teams by name regardless of how many members they have", () => {
    const dir = buildDirectory(
      [member()],
      [team(3, "Zephyr"), team(1, "Acme"), team(2, "Meridian")],
    );

    expect(dir.teams.map((t) => t.name)).toEqual([
      "Acme",
      "Meridian",
      "Zephyr",
    ]);
  });

  it("still keeps admins and guests out of their team's section", () => {
    const dir = buildDirectory(
      [
        member({ id: "1", username: "root", role: "admin" }),
        member({ id: "3", username: "vendor", role: "guest" }),
        member(),
      ],
      [team(1, "Acme")],
    );

    expect(dir.organization).toHaveLength(1);
    expect(dir.guests).toHaveLength(1);
    expect(dir.teams[0].members.map((m) => m.username)).toEqual([
      "priya@acme.com",
    ]);
  });
});
