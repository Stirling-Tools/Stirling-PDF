import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "@mantine/core";
import {
  Avatar,
  Chip,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import {
  type Member,
  type RoleId,
  MEMBER_STATUS_TONE,
  ROLE_LABEL,
  ROLE_TONE,
} from "@portal/api/users";
import { avatarToneForRole } from "@portal/components/users/format";
import "@portal/views/Users.css";

interface MembersTableProps {
  members: Member[];
  /** Row actions. Each submits to the backend via the view's handlers. */
  onChangeRole: (member: Member, role: RoleId) => void;
  onSuspend: (member: Member) => void;
  onRemove: (member: Member) => void;
}

/** Roles a member can be reassigned to, in catalogue order. */
const ROLE_OPTIONS = Object.keys(ROLE_LABEL) as RoleId[];

export function MembersTable({
  members,
  onChangeRole,
  onSuspend,
  onRemove,
}: MembersTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<TableColumn<Member>[]>(
    () => [
      {
        key: "name",
        header: t("users.table.member"),
        render: (m) => (
          <div className="portal-users__member-cell">
            <Avatar
              name={m.name}
              src={m.avatarUrl}
              size="sm"
              tone={avatarToneForRole(m.role)}
            />
            <div className="portal-users__member-text">
              <strong>{m.name}</strong>
              {/* Invited rows seed the name with the email, so don't repeat it. */}
              {m.email !== m.name && (
                <span className="portal-users__muted">{m.email}</span>
              )}
            </div>
          </div>
        ),
      },
      {
        key: "role",
        header: t("users.table.role"),
        render: (m) => (
          <Chip tone={ROLE_TONE[m.role]} size="sm">
            {ROLE_LABEL[m.role]}
          </Chip>
        ),
      },
      {
        key: "status",
        header: t("users.table.status"),
        render: (m) => (
          <StatusBadge
            tone={MEMBER_STATUS_TONE[m.status]}
            size="sm"
            pulse={m.status === "active"}
          >
            {m.status}
          </StatusBadge>
        ),
      },
      {
        key: "lastActive",
        header: t("users.table.lastActive"),
        render: (m) => (
          <span className="portal-users__muted">{m.lastActive}</span>
        ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        width: "3rem",
        render: (m) => (
          // Mantine Menu owns the focus trap + roving arrow-key navigation that
          // a row-action menu needs; SUI has no equivalent.
          <Menu position="bottom-end" withinPortal shadow="md" width={200}>
            <Menu.Target>
              <button
                type="button"
                className="portal-users__row-action"
                aria-label={t("users.table.actionsFor", { name: m.name })}
                onClick={(e) => e.stopPropagation()}
              >
                ⋯
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t("users.table.changeRole")}</Menu.Label>
              {ROLE_OPTIONS.map((role) => (
                <Menu.Item
                  key={role}
                  disabled={role === m.role}
                  onClick={() => onChangeRole(m, role)}
                >
                  {ROLE_LABEL[role]}
                </Menu.Item>
              ))}
              <Menu.Divider />
              {m.status !== "suspended" && (
                <Menu.Item onClick={() => onSuspend(m)}>
                  {t("users.table.suspend")}
                </Menu.Item>
              )}
              <Menu.Item color="red" onClick={() => onRemove(m)}>
                {t("users.table.remove")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ),
      },
    ],
    [t, onChangeRole, onSuspend, onRemove],
  );

  return (
    <Table<Member>
      className="portal-users__table"
      columns={columns}
      rows={members}
      rowKey={(m) => m.id}
    />
  );
}
