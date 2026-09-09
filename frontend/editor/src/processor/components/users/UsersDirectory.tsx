import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  type CellAction,
  type CellCap,
  type CellLabel,
  type CellMenuItem,
  column,
  DataTable,
  type DataTableColumn,
  type DataTableGroup,
} from "@app/ui";
import { type Member, type RoleId } from "@processor/api/users";
import type { Team } from "@processor/api/teams";
import type { UsersCapabilities } from "@processor/api/usersCapabilities";
import { avatarToneForMember } from "@processor/components/users/format";
import {
  buildDirectory,
  type TeamGroup,
} from "@processor/components/users/directory";

/** Collapse a group's rows past this many, behind a "Show all" expander. */
const COLLAPSED_LIMIT = 8;

/** Teams that can't be renamed/deleted (system-managed). */
const SYSTEM_TEAMS = new Set(["Default", "Internal"]);

interface UsersDirectoryProps {
  members: Member[];
  teams: Team[];
  /** Flavor-specific action set (self-hosted org-admin vs SaaS team-leader). */
  capabilities: UsersCapabilities;
  onChangeRole: (member: Member, role: RoleId) => void;
  onGrantProcessor: (member: Member) => void;
  onRevokeProcessor: (member: Member) => void;
  /** Team ids holding a team-wide Processor grant; members inherit it. */
  processorTeamIds: Set<number>;
  onGrantTeamProcessor: (team: TeamGroup) => void;
  onRevokeTeamProcessor: (team: TeamGroup) => void;
  onAddToTeam: (team: TeamGroup) => void;
  // Per-member admin actions (the row kebab).
  onResetPassword: (member: Member) => void;
  onMoveToTeam: (member: Member) => void;
  onToggleEnabled: (member: Member) => void;
  onUnlock: (member: Member) => void;
  onDisableMfa: (member: Member) => void;
  onRemove: (member: Member) => void;
  // Team actions (the team-header kebab).
  onRenameTeam: (team: TeamGroup) => void;
  onDeleteTeam: (team: TeamGroup) => void;
  /** Show the "Approves policy" capability on org owners (Storybook design doc). */
  showApprover?: boolean;
  /** Show the Guests group + the "Guest" role option (Storybook design doc). */
  showGuests?: boolean;
}

/**
 * The people roster on the shared DataTable: grouped like the org chart
 * (Organization owners, then each team, then guests), each row carrying its
 * capability chips, a role selector, and a kebab of admin actions. Long groups
 * collapse behind a "Show all".
 */
export function UsersDirectory({
  members,
  teams,
  capabilities,
  onChangeRole,
  onGrantProcessor,
  onRevokeProcessor,
  processorTeamIds,
  onGrantTeamProcessor,
  onRevokeTeamProcessor,
  onAddToTeam,
  onResetPassword,
  onMoveToTeam,
  onToggleEnabled,
  onUnlock,
  onDisableMfa,
  onRemove,
  onRenameTeam,
  onDeleteTeam,
  showApprover = false,
  showGuests = false,
}: UsersDirectoryProps) {
  const { t } = useTranslation();
  const dir = useMemo(() => buildDirectory(members, teams), [members, teams]);

  const nameByUsername = useMemo(() => {
    const m = new Map<string, string>();
    for (const member of members) {
      if (member.username) m.set(member.username, member.name);
    }
    return m;
  }, [members]);

  const roleOptions = useMemo(
    () => [
      // No SaaS user is ever ROLE_ADMIN, so the Org Owner option is dropped there.
      ...(capabilities.adminRole
        ? [
            {
              value: "admin" as RoleId,
              label: t("users.role.orgOwner", "Org Owner"),
            },
          ]
        : []),
      {
        value: "team_owner" as RoleId,
        label: t("users.role.teamOwner", "Team Owner"),
      },
      { value: "member" as RoleId, label: t("users.role.member", "Member") },
      ...(showGuests
        ? [{ value: "guest" as RoleId, label: t("users.role.guest", "Guest") }]
        : []),
    ],
    [capabilities.adminRole, showGuests, t],
  );

  const columns = useMemo<DataTableColumn<Member>[]>(() => {
    function rowKebab(m: Member): CellAction {
      const removeLabel =
        capabilities.removeScope === "team"
          ? t("users.action.removeTeam", "Remove from team")
          : t("users.action.remove", "Remove from org");
      const items: CellMenuItem[] = [];
      if (capabilities.resetPassword) {
        items.push({
          label: t("users.action.resetPw", "Reset password"),
          disabled: m.isSelf,
          onClick: () => onResetPassword(m),
        });
      }
      if (capabilities.moveTeam) {
        items.push({
          label: t("users.action.move", "Move to team"),
          onClick: () => onMoveToTeam(m),
        });
      }
      if (capabilities.suspend) {
        items.push({
          label:
            m.status === "suspended"
              ? t("users.action.reinstate", "Reinstate")
              : t("users.action.suspend", "Suspend"),
          disabled: m.isSelf,
          onClick: () => onToggleEnabled(m),
        });
      }
      if (capabilities.unlock && m.locked) {
        items.push({
          label: t("users.action.unlock", "Unlock account"),
          onClick: () => onUnlock(m),
        });
      }
      if (capabilities.resetMfa && m.mfaEnabled) {
        items.push({
          label: t("users.action.disableMfa", "Reset MFA"),
          disabled: m.isSelf,
          onClick: () => onDisableMfa(m),
        });
      }
      items.push({
        label: removeLabel,
        tone: "danger",
        disabled: m.isSelf,
        onClick: () => onRemove(m),
        dividerBefore: items.length > 0,
      });
      return {
        label: t("users.rowActions", "Actions for {{name}}", { name: m.name }),
        glyph: "kebab",
        iconOnly: true,
        menu: items,
      };
    }

    const cols: DataTableColumn<Member>[] = [
      column.entity({
        key: "person",
        header: t("users.columns.person", "Person"),
        icon: (m) => (
          <Avatar name={m.name} size="sm" tone={avatarToneForMember(m)} />
        ),
        primary: (m) => m.name,
        suffix: (m) => (m.isSelf ? t("users.you", "(you)") : undefined),
      }),
      column.muted({
        key: "email",
        header: t("users.columns.email", "Email"),
        // Blank when the name already is the email (no separate display name).
        get: (m) => (m.email !== m.name ? m.email : undefined),
      }),
      column.labels({
        key: "status",
        header: t("users.columns.status", "Status"),
        get: (m) => {
          const out: CellLabel[] = [];
          if (m.status === "suspended") {
            out.push({
              label: t("users.suspended", "Suspended"),
              accent: "danger",
            });
          }
          if (m.locked) {
            out.push({ label: t("users.locked", "Locked"), accent: "warning" });
          }
          return out;
        },
      }),
      column.caps({
        key: "capabilities",
        header: t("users.columns.capabilities", "Capabilities"),
        get: (m) => {
          const access = m.processorAccess ?? "none";
          const out: CellCap[] = [
            { label: t("users.cap.editor", "Editor"), accent: "neutral" },
          ];
          if (access === "granted") {
            out.push({
              label: t("users.cap.processor", "Processor"),
              accent: "default",
              onRemove: capabilities.manageGrants
                ? () => onRevokeProcessor(m)
                : undefined,
            });
          } else if (access !== "none") {
            out.push({
              label: t("users.cap.processor", "Processor"),
              accent: "default",
            });
          } else if (capabilities.manageGrants) {
            out.push({
              label: t("users.cap.addProcessor", "+ Processor"),
              accent: "neutral",
              dashed: true,
              onClick: () => onGrantProcessor(m),
            });
          }
          if (showApprover && m.role === "admin") {
            out.push({
              label: t("users.cap.approver", "Approves policy"),
              accent: "success",
            });
          }
          return out;
        },
      }),
      column.muted({
        key: "lastActive",
        header: t("users.lastActive", "Last active"),
        get: (m) => m.lastActive,
      }),
    ];

    if (capabilities.changeRole) {
      cols.push(
        column.select({
          key: "role",
          header: t("users.columns.role", "Role"),
          get: (m) => ({
            value: m.role,
            options: roleOptions,
            ariaLabel: t("users.roleFor", "Role for {{name}}", {
              name: m.name,
            }),
            disabled: m.isSelf,
          }),
          onChange: (m, value) => onChangeRole(m, (value ?? m.role) as RoleId),
        }),
      );
    }

    cols.push(column.actions({ key: "actions", get: (m) => [rowKebab(m)] }));
    return cols;
  }, [
    t,
    capabilities,
    roleOptions,
    showApprover,
    onChangeRole,
    onGrantProcessor,
    onRevokeProcessor,
    onResetPassword,
    onMoveToTeam,
    onToggleEnabled,
    onUnlock,
    onDisableMfa,
    onRemove,
  ]);

  const groups = useMemo<DataTableGroup<Member>[]>(() => {
    function ownerNames(owners: string[]): string {
      return owners.map((u) => nameByUsername.get(u) ?? u).join(", ");
    }
    // A team whose name/membership is system-managed - no rename/delete.
    function isManagedTeam(team: TeamGroup): boolean {
      return SYSTEM_TEAMS.has(team.name) || team.isPersonal === true;
    }
    function teamKebabHasItems(team: TeamGroup): boolean {
      return (
        capabilities.manageGrants ||
        (!isManagedTeam(team) &&
          (capabilities.renameTeam || capabilities.deleteTeam))
      );
    }
    function teamActions(team: TeamGroup): CellAction[] {
      const acts: CellAction[] = [
        {
          label: t("users.group.addToTeam", "Add to team"),
          onClick: () => onAddToTeam(team),
        },
      ];
      if (teamKebabHasItems(team)) {
        const items: CellMenuItem[] = [];
        if (capabilities.manageGrants) {
          items.push(
            processorTeamIds.has(team.id)
              ? {
                  label: t(
                    "users.team.revokeProcessor",
                    "Revoke Processor from team",
                  ),
                  onClick: () => onRevokeTeamProcessor(team),
                }
              : {
                  label: t(
                    "users.team.grantProcessor",
                    "Grant Processor to team",
                  ),
                  onClick: () => onGrantTeamProcessor(team),
                },
          );
        }
        if (!isManagedTeam(team)) {
          const divider = capabilities.manageGrants;
          if (capabilities.renameTeam) {
            items.push({
              label: t("users.action.rename", "Rename team"),
              onClick: () => onRenameTeam(team),
              dividerBefore: divider,
            });
          }
          if (capabilities.deleteTeam) {
            items.push({
              label: t("users.action.deleteTeam", "Delete team"),
              tone: "danger",
              onClick: () => onDeleteTeam(team),
              dividerBefore: divider && !capabilities.renameTeam,
            });
          }
        }
        acts.push({
          label: t("users.teamActions", "Team actions"),
          glyph: "kebab",
          iconOnly: true,
          menu: items,
        });
      }
      return acts;
    }

    const gs: DataTableGroup<Member>[] = [];
    if (capabilities.orgGroup && dir.organization.length > 0) {
      gs.push({
        key: "org",
        title: t("users.group.org", "Organization"),
        meta: t("users.group.owners", "{{count}} owner", {
          count: dir.organization.length,
        }),
        rows: dir.organization,
        collapseAfter: COLLAPSED_LIMIT,
      });
    }
    for (const team of dir.teams) {
      const led =
        team.owners.length > 0
          ? ` · ${t("users.group.ledBy", "led by {{owner}}", {
              owner: ownerNames(team.owners),
            })}`
          : "";
      gs.push({
        key: `team-${team.id}`,
        title: t("users.group.team", "{{name}} team", { name: team.name }),
        meta:
          t("users.group.teamMeta", "{{count}} people", {
            count: team.members.length,
          }) + led,
        actions: teamActions(team),
        rows: team.members,
        collapseAfter: COLLAPSED_LIMIT,
      });
    }
    if (showGuests && dir.guests.length > 0) {
      gs.push({
        key: "guests",
        title: t("users.group.guests", "Guests"),
        meta: t("users.group.guestCount", "{{count}} guest", {
          count: dir.guests.length,
        }),
        rows: dir.guests,
        collapseAfter: COLLAPSED_LIMIT,
      });
    }
    return gs;
  }, [
    t,
    dir,
    nameByUsername,
    capabilities,
    showGuests,
    processorTeamIds,
    onAddToTeam,
    onGrantTeamProcessor,
    onRevokeTeamProcessor,
    onRenameTeam,
    onDeleteTeam,
  ]);

  return (
    <DataTable<Member>
      columns={columns}
      groups={groups}
      rowKey={(m) => String(m.id)}
      collapseLabels={{
        showAll: (count) => t("users.showAll", "Show all {{count}}", { count }),
        showLess: t("users.showLess", "Show less"),
      }}
    />
  );
}
