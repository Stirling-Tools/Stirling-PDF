import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Avatar,
  type CellAction,
  type CellCap,
  type CellLabel,
  type CellMenuItem,
  column,
  DataTable,
  type DataTableColumn,
  Input,
  renderCellActions,
  type TabItem,
  Tabs,
} from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { type Member, type RoleId } from "@portal/api/users";
import type { Team } from "@portal/api/teams";
import type { UsersCapabilities } from "@portal/api/usersCapabilities";
import { avatarToneForMember } from "@portal/components/users/format";

/** Tab key standing for "no team filter". */
const ALL_TEAMS = "__all__";
/** Tab key for members belonging to no team. */
const UNASSIGNED = "__none__";

const DEFAULT_TEAM = "Default";
const INTERNAL_TEAM = "Internal";

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
  onGrantTeamProcessor: (team: Team) => void;
  onRevokeTeamProcessor: (team: Team) => void;
  /** Null when the viewer may not add members; the control is then omitted. */
  onAddToTeam: ((team: Team) => void) | null;
  /** Every licensed seat is taken, so adding anyone would be rejected. */
  seatsFull?: boolean;
  // Per-member admin actions (the row kebab).
  onResetPassword: (member: Member) => void;
  onMoveToTeam: (member: Member) => void;
  onToggleEnabled: (member: Member) => void;
  onUnlock: (member: Member) => void;
  onDisableMfa: (member: Member) => void;
  onRemove: (member: Member) => void;
  onTransferOwnership?: (member: Member) => void;
  // Team actions, offered beside the selected team's tab.
  onRenameTeam: (team: Team) => void;
  onDeleteTeam: (team: Team) => void;
  /** Show the "Approves policy" capability on org owners (Storybook design doc). */
  showApprover?: boolean;
  /** Offer the "Guest" role option (Storybook design doc). */
  showGuests?: boolean;
}

/** One flat list of everyone, narrowed by the team strip above it and by search.
 *  Selecting a team also puts that team's own actions beside the strip. */
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
  seatsFull = false,
  onResetPassword,
  onMoveToTeam,
  onToggleEnabled,
  onUnlock,
  onDisableMfa,
  onRemove,
  onTransferOwnership,
  onRenameTeam,
  onDeleteTeam,
  showApprover = false,
  showGuests = false,
}: UsersDirectoryProps) {
  const { t } = useTranslation();
  const roleOptions = useMemo(() => {
    const options: { value: RoleId; label: string }[] = [];
    if (capabilities.adminRole) {
      options.push({ value: "admin", label: t("users.role.admin", "Admin") });
    }
    options.push(
      { value: "team_owner", label: t("users.role.teamOwner", "Team Lead") },
      { value: "member", label: t("users.role.member", "Member") },
    );
    if (showGuests) {
      options.push({ value: "guest", label: t("users.role.guest", "Guest") });
    }
    return options;
  }, [capabilities.adminRole, showGuests, t]);

  // The one structural filter, replacing per-team sections: at a hundred people
  // those were ten headings to scroll past, not a shape.
  const [teamTab, setTeamTab] = useState<string>(ALL_TEAMS);
  // A member's tab, keyed by team id. Everyone the team list doesn't account
  // for lands under "No team", so the strip's counts always sum to the roster.
  const tabOf = useMemo(() => {
    const known = new Set(teams.map((team) => String(team.id)));
    return (m: Member) => {
      const key = m.teamId != null ? String(m.teamId) : UNASSIGNED;
      return known.has(key) ? key : UNASSIGNED;
    };
  }, [teams]);

  const teamTabs = useMemo<TabItem<string>[]>(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      const key = tabOf(m);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const tabs: TabItem<string>[] = [
      {
        key: ALL_TEAMS,
        label: t("users.tabs.all", "All"),
        count: members.length,
      },
      // Empty teams get a tab too, so a newly created one can be found and
      // given its first member.
      ...[...teams]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((team) => ({
          key: String(team.id),
          label: team.name,
          count: counts.get(String(team.id)) ?? 0,
        })),
    ];
    const orphans = counts.get(UNASSIGNED) ?? 0;
    if (orphans > 0) {
      tabs.push({
        key: UNASSIGNED,
        label: t("users.tabs.unassigned", "No team"),
        count: orphans,
      });
    }
    return tabs;
  }, [members, teams, tabOf, t]);

  const teamScoped = useMemo(
    () =>
      teamTab === ALL_TEAMS
        ? members
        : members.filter((m) => tabOf(m) === teamTab),
    [members, teamTab, tabOf],
  );

  // Search is the only filter beside the team strip: a roster is looked up by
  // name, and role and status are already visible in their own columns.
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teamScoped;
    return teamScoped.filter((m) =>
      `${m.name} ${m.email}`.toLowerCase().includes(q),
    );
  }, [teamScoped, query]);

  const teamNameById = useMemo(() => {
    const byId = new Map<number, string>();
    for (const team of teams) byId.set(team.id, team.name);
    return byId;
  }, [teams]);

  const showEmail = useMemo(
    () => members.some((m) => !!m.email && m.email !== m.name),
    [members],
  );
  const showStatus = useMemo(
    () => members.some((m) => m.status === "suspended" || m.locked),
    [members],
  );

  const columns = useMemo<DataTableColumn<Member>[]>(() => {
    const isOwner = (m: Member) =>
      capabilities.adminRole ? m.orgOwner === true : m.teamLead === true;
    const canTransferTo = (m: Member) =>
      capabilities.transferOwnership &&
      Boolean(onTransferOwnership) &&
      members.some((u) => u.isSelf && isOwner(u)) &&
      !m.isSelf &&
      m.status === "active" &&
      !m.isFirstLogin &&
      !m.locked &&
      m.role !== "guest" &&
      (capabilities.adminRole ||
        teams.some(
          (team) => team.id === m.teamId && team.isPersonal === false,
        ));
    function rowKebab(m: Member): CellAction {
      const protectedOwner = isOwner(m);
      const removeLabel =
        capabilities.removeScope === "team"
          ? t("users.action.removeTeam", "Remove from team")
          : t("users.action.remove", "Remove from org");
      const items: CellMenuItem[] = [];
      if (capabilities.resetPassword) {
        items.push({
          label: t("users.action.resetPw", "Reset password"),
          disabled: m.isSelf || protectedOwner,
          onClick: () => onResetPassword(m),
        });
      }
      if (capabilities.moveTeam) {
        items.push({
          label: t("users.action.move", "Move to team"),
          disabled: protectedOwner,
          onClick: () => onMoveToTeam(m),
        });
      }
      if (capabilities.suspend) {
        items.push({
          label:
            m.status === "suspended"
              ? t("users.action.reinstate", "Reinstate")
              : t("users.action.suspend", "Suspend"),
          disabled: m.isSelf || protectedOwner,
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
          disabled: m.isSelf || protectedOwner,
          onClick: () => onDisableMfa(m),
        });
      }
      if (capabilities.removeMember) {
        items.push({
          label: removeLabel,
          tone: "danger",
          disabled: m.isSelf || protectedOwner,
          onClick: () => onRemove(m),
          dividerBefore: items.length > 0,
        });
      }
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
    ];

    if (showEmail) {
      cols.push(
        column.muted({
          key: "email",
          header: t("users.columns.email", "Email"),
          get: (m) => (m.email !== m.name ? m.email : undefined),
        }),
      );
    }

    cols.push(
      column.labels({
        key: "team",
        header: t("users.columns.team", "Team"),
        get: (m) => {
          const name =
            m.teamName ??
            (m.teamId != null ? teamNameById.get(m.teamId) : undefined);
          return name ? [{ label: name, accent: "neutral" }] : [];
        },
      }),
    );

    if (showStatus) {
      cols.push(
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
              out.push({
                label: t("users.locked", "Locked"),
                accent: "warning",
              });
            }
            return out;
          },
        }),
      );
    }

    cols.push(
      column.caps({
        key: "capabilities",
        header: t("users.columns.capabilities", "Capabilities"),
        get: (m) => {
          const access = m.portalAccess ?? "none";
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
    );

    cols.push(
      column.select({
        key: "role",
        header: t("users.columns.role", "Role"),
        get: (m) => ({
          value: isOwner(m) ? "org_owner" : m.role,
          options: [
            ...(isOwner(m) || canTransferTo(m)
              ? [
                  {
                    value: "org_owner",
                    label: t("users.role.orgOwner", "Org Owner"),
                  },
                ]
              : []),
            ...(capabilities.adminRole
              ? roleOptions
              : [
                  {
                    value: "member",
                    label: t("users.role.member", "Member"),
                  },
                ]),
          ],
          ariaLabel: t("users.roleFor", "Role for {{name}}", {
            name: m.name,
          }),
          readOnly:
            m.isSelf ||
            isOwner(m) ||
            (!capabilities.changeRole && !canTransferTo(m)),
        }),
        onChange: (m, value) => {
          // Ownership uses its atomic transfer endpoint, never the ordinary role mutation.
          if (value === "org_owner") {
            if (canTransferTo(m)) onTransferOwnership?.(m);
            return;
          }
          if (capabilities.changeRole)
            onChangeRole(m, (value ?? m.role) as RoleId);
        },
      }),
    );

    // A reader gets no kebab at all rather than an empty menu.
    cols.push(
      column.actions({
        key: "actions",
        get: (m) => {
          const kebab = rowKebab(m);
          return kebab.menu && kebab.menu.length > 0 ? [kebab] : [];
        },
      }),
    );
    return cols;
  }, [
    t,
    capabilities,
    roleOptions,
    members,
    teams,
    showApprover,
    showEmail,
    showStatus,
    teamNameById,
    onChangeRole,
    onGrantProcessor,
    onRevokeProcessor,
    onResetPassword,
    onMoveToTeam,
    onToggleEnabled,
    onUnlock,
    onDisableMfa,
    onRemove,
    onTransferOwnership,
  ]);

  // Null on "All" and "No team", which are not teams to act on.
  const selectedTeam = useMemo<Team | null>(
    () => teams.find((tm) => String(tm.id) === teamTab) ?? null,
    [teams, teamTab],
  );

  const teamActions = useMemo<CellAction[]>(() => {
    const team = selectedTeam;
    if (!team) return [];
    const add = onAddToTeam;
    const acts: CellAction[] = add
      ? [
          {
            label: t("users.group.addToTeam", "Add to team"),
            disabled: seatsFull,
            onClick: () => add(team),
          },
        ]
      : [];
    const isDefault = team.name === DEFAULT_TEAM;
    const immutable = team.name === INTERNAL_TEAM || team.isPersonal === true;
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
              label: t("users.team.grantProcessor", "Grant Processor to team"),
              onClick: () => onGrantTeamProcessor(team),
            },
      );
    }
    if (!immutable) {
      const divider = capabilities.manageGrants;
      if (capabilities.renameTeam) {
        items.push({
          label: isDefault
            ? t("users.action.createFromDefault", "Create team from Default")
            : t("users.action.rename", "Rename team"),
          onClick: () => onRenameTeam(team),
          dividerBefore: divider,
        });
      }
      if (capabilities.deleteTeam && !isDefault) {
        items.push({
          label: t("users.action.deleteTeam", "Delete team"),
          tone: "danger",
          onClick: () => onDeleteTeam(team),
          dividerBefore: divider && !capabilities.renameTeam,
        });
      }
    }
    if (items.length > 0) {
      acts.push({
        label: t("users.teamActions", "Team actions"),
        glyph: "kebab",
        iconOnly: true,
        menu: items,
      });
    }
    return acts;
  }, [
    t,
    selectedTeam,
    capabilities,
    processorTeamIds,
    seatsFull,
    onAddToTeam,
    onGrantTeamProcessor,
    onRevokeTeamProcessor,
    onRenameTeam,
    onDeleteTeam,
  ]);

  return (
    <div className="portal-users__directory">
      <div className="portal-users__filters">
        <Tabs
          items={teamTabs}
          activeKey={teamTab}
          onChange={setTeamTab}
          ariaLabel={t("users.tabs.label", "Filter by team")}
          className="portal-users__teams"
        />
        <div className="portal-users__filter-actions">
          {teamActions.length > 0 && renderCellActions(teamActions)}
          <div
            className="portal-users__search"
            data-open={searchOpen || undefined}
          >
            {searchOpen ? (
              <Input
                ref={searchRef}
                inputSize="sm"
                value={query}
                placeholder={t("users.filters.search", "Search people")}
                aria-label={t("users.filters.search", "Search people")}
                onChange={(e) => setQuery(e.currentTarget.value)}
                // Collapses only when it has nothing to show for itself, so a
                // live filter is never dismissed by looking away from the box.
                onBlur={() => {
                  if (query.trim() === "") setSearchOpen(false);
                }}
              />
            ) : (
              <ActionIcon
                variant="tertiary"
                accent="neutral"
                size="sm"
                aria-label={t("users.filters.search", "Search people")}
                onClick={() => {
                  setSearchOpen(true);
                  requestAnimationFrame(() => searchRef.current?.focus());
                }}
              >
                <Icon name="search" size="1rem" />
              </ActionIcon>
            )}
          </div>
        </div>
      </div>
      <DataTable<Member>
        columns={columns}
        rows={rows}
        rowKey={(m) => String(m.id)}
        empty={t("users.filters.noMatches", "No one matches these filters.")}
      />
    </div>
  );
}
