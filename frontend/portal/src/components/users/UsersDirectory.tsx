import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "@mantine/core";
import { Avatar, Chip, Select } from "@shared/components";
import { type Member, type RoleId } from "@portal/api/users";
import type { Team } from "@portal/api/teams";
import { avatarToneForRole } from "@portal/components/users/format";
import {
  buildDirectory,
  type TeamGroup,
} from "@portal/components/users/directory";
import "@portal/views/Users.css";

/** Collapse a group's rows past this many, behind a "Show all" expander. */
const COLLAPSED_LIMIT = 8;

/** Teams that can't be renamed/deleted (system-managed). */
const SYSTEM_TEAMS = new Set(["Default", "Internal"]);

interface UsersDirectoryProps {
  members: Member[];
  teams: Team[];
  onChangeRole: (member: Member, role: RoleId) => void;
  onGrantProcessor: (member: Member) => void;
  onRevokeProcessor: (member: Member) => void;
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
  /**
   * Show the "Approves policy" capability chip on org owners. Off in the live
   * app (no backend for it yet); on in Storybook to document the intended design.
   */
  showApprover?: boolean;
}

/**
 * The people roster, grouped like the org chart: Organization owners, then each
 * team (with its leader), each row carrying capability chips, a role selector,
 * and a kebab of admin actions. Long groups collapse behind a "Show all" so big
 * orgs stay scannable.
 */
export function UsersDirectory({
  members,
  teams,
  onChangeRole,
  onGrantProcessor,
  onRevokeProcessor,
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
}: UsersDirectoryProps) {
  const { t } = useTranslation();
  const dir = useMemo(() => buildDirectory(members, teams), [members, teams]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const nameByUsername = useMemo(() => {
    const m = new Map<string, string>();
    for (const member of members) {
      if (member.username) m.set(member.username, member.name);
    }
    return m;
  }, [members]);

  const roleOptions: { value: RoleId; label: string }[] = [
    { value: "admin", label: t("users.role.orgOwner", "Org Owner") },
    { value: "team_owner", label: t("users.role.teamOwner", "Team Owner") },
    { value: "member", label: t("users.role.member", "Member") },
  ];

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function ownerNames(owners: string[]): string {
    return owners.map((u) => nameByUsername.get(u) ?? u).join(", ");
  }

  function rowKebab(m: Member) {
    return (
      <Menu position="bottom-end" withinPortal shadow="md" width={210}>
        <Menu.Target>
          <button
            type="button"
            className="portal-users__row-kebab"
            aria-label={t("users.rowActions", "Actions for {{name}}", {
              name: m.name,
            })}
          >
            ⋯
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item disabled={m.isSelf} onClick={() => onResetPassword(m)}>
            {t("users.action.resetPw", "Reset password")}
          </Menu.Item>
          <Menu.Item onClick={() => onMoveToTeam(m)}>
            {t("users.action.move", "Move to team")}
          </Menu.Item>
          <Menu.Item disabled={m.isSelf} onClick={() => onToggleEnabled(m)}>
            {m.status === "suspended"
              ? t("users.action.reinstate", "Reinstate")
              : t("users.action.suspend", "Suspend")}
          </Menu.Item>
          {m.locked && (
            <Menu.Item onClick={() => onUnlock(m)}>
              {t("users.action.unlock", "Unlock account")}
            </Menu.Item>
          )}
          {m.mfaEnabled && (
            <Menu.Item disabled={m.isSelf} onClick={() => onDisableMfa(m)}>
              {t("users.action.disableMfa", "Reset MFA")}
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            color="red"
            disabled={m.isSelf}
            onClick={() => onRemove(m)}
          >
            {t("users.action.remove", "Remove from org")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    );
  }

  function renderRow(m: Member) {
    const isOwnerRole = m.role === "admin" || m.role === "team_owner";
    const access = m.portalAccess ?? "none";
    return (
      <div className="portal-users__row" key={m.id}>
        <div className="portal-users__row-main">
          <Avatar name={m.name} size="sm" tone={avatarToneForRole(m.role)} />
          <div className="portal-users__row-id">
            <span className="portal-users__row-name">
              {m.name}
              {m.isSelf && (
                <span className="portal-users__row-you">
                  {" "}
                  {t("users.you", "(you)")}
                </span>
              )}
              {m.status === "suspended" && (
                <Chip tone="red" size="sm" className="portal-users__row-tag">
                  {t("users.suspended", "Suspended")}
                </Chip>
              )}
              {m.locked && (
                <Chip tone="amber" size="sm" className="portal-users__row-tag">
                  {t("users.locked", "Locked")}
                </Chip>
              )}
            </span>
            {m.email !== m.name && (
              <span className="portal-users__row-email">{m.email}</span>
            )}
          </div>
        </div>

        <div className="portal-users__caps">
          <Chip tone="neutral" size="sm">
            {t("users.cap.editor", "Editor")}
          </Chip>
          {access === "granted" ? (
            <Chip tone="blue" size="sm" onRemove={() => onRevokeProcessor(m)}>
              {t("users.cap.processor", "Processor")}
            </Chip>
          ) : isOwnerRole ? (
            <Chip tone="blue" size="sm">
              {t("users.cap.processor", "Processor")}
            </Chip>
          ) : (
            <Chip tone="neutral" size="sm" onClick={() => onGrantProcessor(m)}>
              {t("users.cap.addProcessor", "+ Processor")}
            </Chip>
          )}
          {showApprover && m.role === "admin" && (
            <Chip
              tone="green"
              size="sm"
              leadingIcon={<span aria-hidden>✓</span>}
            >
              {t("users.cap.approver", "Approves policy")}
            </Chip>
          )}
        </div>

        <span className="portal-users__row-active">{m.lastActive}</span>

        <div className="portal-users__row-role">
          <Select
            aria-label={t("users.roleFor", "Role for {{name}}", {
              name: m.name,
            })}
            options={roleOptions}
            value={m.role}
            disabled={m.isSelf}
            onChange={(e) => onChangeRole(m, e.target.value as RoleId)}
          />
        </div>

        {rowKebab(m)}
      </div>
    );
  }

  /** Rows for a group, collapsing past COLLAPSED_LIMIT behind a toggle. */
  function renderMembers(list: Member[], key: string) {
    const isOpen = expanded.has(key);
    const overflow = list.length > COLLAPSED_LIMIT;
    const shown = overflow && !isOpen ? list.slice(0, COLLAPSED_LIMIT) : list;
    return (
      <>
        {shown.map(renderRow)}
        {overflow && (
          <button
            type="button"
            className="portal-users__show-more"
            onClick={() => toggleExpand(key)}
          >
            {isOpen
              ? t("users.showLess", "Show less")
              : t("users.showAll", "Show all {{count}}", {
                  count: list.length,
                })}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="portal-users__directory">
      {/* Organization */}
      {dir.organization.length > 0 && (
        <section className="portal-users__group">
          <header className="portal-users__group-head">
            <div className="portal-users__group-title">
              <strong>{t("users.group.org", "Organization")}</strong>
              <span className="portal-users__group-desc">
                {t(
                  "users.group.orgDesc",
                  "Owners with org-wide authority and policy approval",
                )}
              </span>
            </div>
            <span className="portal-users__group-count">
              {t("users.group.owners", "{{count}} owner", {
                count: dir.organization.length,
              })}
            </span>
          </header>
          {renderMembers(dir.organization, "org")}
        </section>
      )}

      {/* Teams */}
      {dir.teams.map((team) => (
        <section className="portal-users__group" key={team.id}>
          <header className="portal-users__group-head">
            <div className="portal-users__group-title">
              <strong>
                {t("users.group.team", "{{name}} team", { name: team.name })}
              </strong>
              <span className="portal-users__group-desc">
                {t("users.group.teamMeta", "{{count}} people", {
                  count: team.members.length,
                })}
                {team.owners.length > 0 &&
                  ` · ${t("users.group.ledBy", "led by {{owner}}", {
                    owner: ownerNames(team.owners),
                  })}`}
              </span>
            </div>
            <div className="portal-users__group-actions">
              <button
                type="button"
                className="portal-users__group-action"
                onClick={() => onAddToTeam(team)}
              >
                {t("users.group.addToTeam", "Add to team")}
              </button>
              {!SYSTEM_TEAMS.has(team.name) && (
                <Menu
                  position="bottom-end"
                  withinPortal
                  shadow="md"
                  width={180}
                >
                  <Menu.Target>
                    <button
                      type="button"
                      className="portal-users__row-kebab"
                      aria-label={t("users.teamActions", "Team actions")}
                    >
                      ⋯
                    </button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => onRenameTeam(team)}>
                      {t("users.action.rename", "Rename team")}
                    </Menu.Item>
                    <Menu.Item color="red" onClick={() => onDeleteTeam(team)}>
                      {t("users.action.deleteTeam", "Delete team")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
            </div>
          </header>
          {renderMembers(team.members, `team-${team.id}`)}
        </section>
      ))}
    </div>
  );
}
