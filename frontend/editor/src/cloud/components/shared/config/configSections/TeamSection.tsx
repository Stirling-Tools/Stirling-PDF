import React, { useState, useEffect, type ReactNode } from "react";
import {
  TextInput,
  Group,
  Text,
  Stack,
  Alert,
  Table,
  Badge,
  Menu,
  Modal,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { StatusBadge } from "@app/ui/StatusBadge";
import { useTranslation } from "react-i18next";
import {
  useSaaSTeam,
  type TeamInvitation,
  type TeamMember,
} from "@app/contexts/SaaSTeamContext";
import { Icon } from "@app/ui/Icon";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import apiClient from "@app/services/apiClient";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TransferOwnershipModalProps {
  targetEmail: string | null;
  error: string | null;
  transferring: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function TransferOwnershipModal({
  targetEmail,
  error,
  transferring,
  onCancel,
  onConfirm,
}: TransferOwnershipModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={targetEmail !== null}
      onClose={onCancel}
      title={t("team.transferTitle", "Transfer team ownership")}
      zIndex={Z_INDEX_OVER_CONFIG_MODAL + 1}
    >
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        <Text>
          {t(
            "team.transferBody",
            "Make {{email}} the team owner? They will control team membership and organization billing settings. You will become a member. The team's subscription and wallet stay with the team.",
            { email: targetEmail ?? undefined },
          )}
        </Text>
        <Group justify="flex-end">
          <Button variant="tertiary" disabled={transferring} onClick={onCancel}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button accent="danger" disabled={transferring} onClick={onConfirm}>
            {t("team.makeOwner", "Make owner")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface NoOwnerAlertProps {
  show: boolean;
  busy: boolean;
  onClaim: () => void;
}

function NoOwnerAlert({ show, busy, onClaim }: NoOwnerAlertProps) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Alert title={t("team.noOwner", "This team has no owner")}>
      <Text>
        {t(
          "team.recoverBody",
          "An existing member can recover ownership to manage the team and its billing settings.",
        )}
      </Text>
      <Button disabled={busy} onClick={onClaim}>
        {t("team.recoverOwner", "Become team owner")}
      </Button>
    </Alert>
  );
}

interface TeamNameEditorProps {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function TeamNameEditor({
  value,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: TeamNameEditorProps) {
  const { t } = useTranslation();
  return (
    <Group gap="xs" align="center">
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("team.namePlaceholder", "Team name")}
        style={{ flex: 1, maxWidth: 300 }}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <ActionIcon
        onClick={onSubmit}
        loading={saving}
        disabled={!value.trim()}
        aria-label={t("team.renameSubmit", "Save team name")}
      >
        <Icon name="check" size="1rem" />
      </ActionIcon>
      <ActionIcon
        variant="tertiary"
        onClick={onCancel}
        disabled={saving}
        aria-label={t("team.renameCancel", "Cancel rename")}
      >
        <Icon name="x" size="1rem" />
      </ActionIcon>
    </Group>
  );
}

interface TeamNameDisplayProps {
  name: string;
  memberCount: number;
  isLeader: boolean;
  isPersonal: boolean;
  onRename: () => void;
}

function TeamNameDisplay({
  name,
  memberCount,
  isLeader,
  isPersonal,
  onRename,
}: TeamNameDisplayProps) {
  const { t } = useTranslation();
  return (
    <>
      <Group gap="xs" align="center">
        <Text fw={600} size="lg">
          {name}
        </Text>
        {isLeader && !isPersonal && (
          <ActionIcon
            variant="tertiary"
            size="sm"
            onClick={onRename}
            aria-label={t("team.editName", "Edit team name")}
          >
            <Icon name="pencil" size="1rem" />
          </ActionIcon>
        )}
        {isLeader && (
          <StatusBadge tone="info" showDot={false}>
            {t("team.leader", "LEADER")}
          </StatusBadge>
        )}
        {isPersonal && (
          <StatusBadge tone="neutral" showDot={false}>
            {t("team.personal", "Personal")}
          </StatusBadge>
        )}
      </Group>
      {!isPersonal && (
        <Text size="sm" c="dimmed" mt={4}>
          {t("team.memberCount", "{{count}} team members", {
            count: memberCount,
          })}
        </Text>
      )}
    </>
  );
}

interface TeamTitleProps {
  editing: boolean;
  name: string;
  memberCount: number;
  isLeader: boolean;
  isPersonal: boolean;
  draftName: string;
  saving: boolean;
  onDraftNameChange: (value: string) => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
}

function TeamTitle({
  editing,
  name,
  memberCount,
  isLeader,
  isPersonal,
  draftName,
  saving,
  onDraftNameChange,
  onStartRename,
  onSubmitRename,
  onCancelRename,
}: TeamTitleProps) {
  if (editing) {
    return (
      <TeamNameEditor
        value={draftName}
        saving={saving}
        onChange={onDraftNameChange}
        onSubmit={onSubmitRename}
        onCancel={onCancelRename}
      />
    );
  }
  return (
    <TeamNameDisplay
      name={name}
      memberCount={memberCount}
      isLeader={isLeader}
      isPersonal={isPersonal}
      onRename={onStartRename}
    />
  );
}

interface TeamHeaderProps {
  canLeave: boolean;
  onLeave: () => void;
  children: ReactNode;
}

function TeamHeader({ canLeave, onLeave, children }: TeamHeaderProps) {
  const { t } = useTranslation();
  return (
    <div>
      <Group justify="space-between" align="center">
        <div style={{ flex: 1 }}>{children}</div>
        {canLeave && (
          <Button
            accent="danger"
            variant="secondary"
            size="sm"
            onClick={onLeave}
            leftSection={<Icon name="log-out" size="1rem" />}
          >
            {t("team.leaveButton", "Leave Team")}
          </Button>
        )}
      </Group>
    </div>
  );
}

interface DismissibleAlertProps {
  message: string | null;
  color: string;
  onClose: () => void;
}

function DismissibleAlert({ message, color, onClose }: DismissibleAlertProps) {
  if (!message) return null;
  return (
    <Alert color={color} onClose={onClose} withCloseButton>
      {message}
    </Alert>
  );
}

interface InviteMemberFormProps {
  show: boolean;
  email: string;
  inviting: boolean;
  onEmailChange: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function InviteMemberForm({
  show,
  email,
  inviting,
  onEmailChange,
  onSubmit,
}: InviteMemberFormProps) {
  const { t } = useTranslation();
  if (!show) return null;
  const invalid = !EMAIL_PATTERN.test(email);
  return (
    <div>
      <Text fw={600} size="md" mb="sm">
        {t("team.invite.title", "Invite Team Member")}
      </Text>
      <form onSubmit={onSubmit}>
        <Group>
          <TextInput
            type="email"
            placeholder={t("team.invite.placeholder", "email@example.com")}
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            style={{ flex: 1 }}
            required
            error={
              email && invalid
                ? t("team.invite.invalidEmail", "Invalid email format")
                : undefined
            }
          />
          <Button
            type="submit"
            loading={inviting}
            disabled={!email.trim() || invalid}
          >
            {t("team.invite.sendButton", "Send Invite")}
          </Button>
        </Group>
      </form>
    </div>
  );
}

function ColumnHeader({ children }: { children: ReactNode }) {
  return (
    <Table.Th
      style={{
        fontWeight: 600,
        fontSize: "0.875rem",
        color: "var(--mantine-color-gray-7)",
      }}
    >
      {children}
    </Table.Th>
  );
}

function MemberRoleBadge({ role }: { role: TeamMember["role"] }) {
  const { t } = useTranslation();
  const isOwner = role === "LEADER";
  return (
    <Badge
      size="sm"
      color={isOwner ? "blue" : undefined}
      style={
        isOwner
          ? undefined
          : {
              backgroundColor: "var(--c-surface-raised)",
              color: "var(--c-accent-fg)",
            }
      }
    >
      {isOwner
        ? t("users.role.orgOwner", "Org Owner")
        : t("users.role.member", "Member")}
    </Badge>
  );
}

interface MemberActionsMenuProps {
  member: TeamMember;
  onMakeOwner: () => void;
  onRemove: () => void;
}

function MemberActionsMenu({
  member,
  onMakeOwner,
  onRemove,
}: MemberActionsMenuProps) {
  const { t } = useTranslation();
  if (member.role === "LEADER") return null;
  return (
    <Menu position="bottom-end" withinPortal zIndex={Z_INDEX_OVER_CONFIG_MODAL}>
      <Menu.Target>
        <ActionIcon
          variant="tertiary"
          aria-label={t("team.members.actions", "Member actions")}
        >
          <Icon name="ellipsis-vertical" size="1rem" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={onMakeOwner}>
          {t("team.makeOwner", "Make owner")}
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<Icon name="user-minus" size="1rem" />}
          onClick={onRemove}
        >
          {t("team.members.remove", "Remove from Team")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

interface TeamMemberRowProps extends MemberActionsMenuProps {
  showActions: boolean;
}

function TeamMemberRow({ showActions, ...actions }: TeamMemberRowProps) {
  const { member } = actions;
  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={500}>
          {member.username}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {member.email}
        </Text>
      </Table.Td>
      <Table.Td>
        <MemberRoleBadge role={member.role} />
      </Table.Td>
      {showActions && (
        <Table.Td>
          <MemberActionsMenu {...actions} />
        </Table.Td>
      )}
    </Table.Tr>
  );
}

interface PendingInvitationRowProps {
  invitation: TeamInvitation;
  showActions: boolean;
  onCancel: () => void;
}

function PendingInvitationRow({
  invitation,
  showActions,
  onCancel,
}: PendingInvitationRowProps) {
  const { t } = useTranslation();
  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={500} c="dimmed" fs="italic">
          {invitation.inviteeEmail.split("@")[0]}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {invitation.inviteeEmail}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge size="sm" color="yellow" variant="light">
          {t("team.members.pending", "PENDING")}
        </Badge>
      </Table.Td>
      {showActions && (
        <Table.Td>
          <ActionIcon
            variant="tertiary"
            accent="danger"
            onClick={onCancel}
            aria-label={t("team.invite.cancelLabel", "Cancel invitation")}
          >
            <Icon name="x" size="1rem" />
          </ActionIcon>
        </Table.Td>
      )}
    </Table.Tr>
  );
}

interface TeamMembersTableProps {
  members: TeamMember[];
  invitations: TeamInvitation[];
  showActions: boolean;
  onMakeOwner: (member: TeamMember) => void;
  onRemove: (member: TeamMember) => void;
  onCancelInvitation: (invitation: TeamInvitation) => void;
}

function TeamMemberRows({
  members,
  invitations,
  showActions,
  onMakeOwner,
  onRemove,
  onCancelInvitation,
}: TeamMembersTableProps) {
  const { t } = useTranslation();
  if (members.length === 0 && invitations.length === 0) {
    return (
      <Table.Tr>
        <Table.Td colSpan={showActions ? 4 : 3}>
          <Text ta="center" c="dimmed" py="xl">
            {t("team.members.empty", "No team members yet.")}
          </Text>
        </Table.Td>
      </Table.Tr>
    );
  }
  return (
    <>
      {members.map((member) => (
        <TeamMemberRow
          key={`member-${member.id}`}
          member={member}
          showActions={showActions}
          onMakeOwner={() => onMakeOwner(member)}
          onRemove={() => onRemove(member)}
        />
      ))}
      {invitations
        .filter((inv) => inv.status === "PENDING")
        .map((invitation) => (
          <PendingInvitationRow
            key={`invitation-${invitation.invitationId}`}
            invitation={invitation}
            showActions={showActions}
            onCancel={() => onCancelInvitation(invitation)}
          />
        ))}
    </>
  );
}

function TeamMembersTable(props: TeamMembersTableProps) {
  const { t } = useTranslation();
  return (
    <div>
      <Text fw={600} size="md" mb="sm">
        {t("team.members.title", "Team Members")}
      </Text>
      <Table
        horizontalSpacing="md"
        verticalSpacing="sm"
        withRowBorders
        highlightOnHover
        style={{
          "--table-border-color": "var(--mantine-color-gray-3)",
        }}
      >
        <Table.Thead>
          <Table.Tr style={{ backgroundColor: "var(--mantine-color-gray-0)" }}>
            <ColumnHeader>{t("team.members.nameColumn", "Name")}</ColumnHeader>
            <ColumnHeader>
              {t("team.members.emailColumn", "Email")}
            </ColumnHeader>
            <ColumnHeader>{t("team.members.roleColumn", "Role")}</ColumnHeader>
            {props.showActions && <Table.Th style={{ width: 50 }}></Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <TeamMemberRows {...props} />
        </Table.Tbody>
      </Table>
    </div>
  );
}

const TeamSection: React.FC = () => {
  const { t } = useTranslation();
  const {
    currentTeam,
    teamMembers,
    teamInvitations,
    isTeamLeader,
    isPersonalTeam,
    inviteUser,
    cancelInvitation,
    removeMember,
    transferLeadership,
    claimLeadership,
    leaveTeam,
    refreshTeams,
  } = useSaaSTeam();

  const [transferTarget, setTransferTarget] = useState<{
    id: number;
    email: string;
  } | null>(null);
  const [transferring, setTransferring] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Team rename state
  const [isEditingName, setIsEditingName] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [renamingTeam, setRenamingTeam] = useState(false);

  // Refresh team data on mount and every 10 seconds
  useEffect(() => {
    // Refresh immediately on mount
    refreshTeams();

    // Then refresh every 10 seconds
    const interval = setInterval(() => {
      refreshTeams();
    }, 10000);

    return () => clearInterval(interval);
  }, []); // Only run on mount/unmount

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      await inviteUser(inviteEmail);
      setSuccess(
        t("team.inviteSent", "Invitation sent to {{email}}", {
          email: inviteEmail,
        }),
      );
      setInviteEmail("");
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(
        error.response?.data?.error ||
          t("team.inviteError", "Failed to send invitation"),
      );
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: number, memberEmail: string) => {
    if (
      !window.confirm(
        t("team.confirmRemove", "Remove {{email}} from the team?", {
          email: memberEmail,
        }),
      )
    )
      return;

    try {
      await removeMember(memberId);
      setSuccess(t("team.memberRemoved", "Member removed successfully"));
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(
        error.response?.data?.error ||
          t("team.removeError", "Failed to remove member"),
      );
    }
  };

  const handleCancelInvitation = async (
    invitationId: number,
    email: string,
  ) => {
    if (
      !window.confirm(
        t("team.confirmCancelInvite", "Cancel invitation for {{email}}?", {
          email,
        }),
      )
    )
      return;

    try {
      await cancelInvitation(invitationId);
      setSuccess(
        t("team.inviteCancelled", "Invitation for {{email}} cancelled", {
          email,
        }),
      );
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(
        error.response?.data?.error ||
          t("team.cancelInviteError", "Failed to cancel invitation"),
      );
    }
  };

  const handleStartRename = () => {
    if (currentTeam) {
      setNewTeamName(currentTeam.name);
      setIsEditingName(true);
    }
  };

  const handleCancelRename = () => {
    setIsEditingName(false);
    setNewTeamName("");
  };

  const handleRenameSubmit = async () => {
    if (!currentTeam || !newTeamName.trim()) return;

    setRenamingTeam(true);
    setError(null);

    try {
      await apiClient.post(`/api/v1/team/${currentTeam.teamId}/rename`, {
        newName: newTeamName.trim(),
      });

      setSuccess(t("team.renameSuccess", "Team renamed successfully"));
      setIsEditingName(false);
      await refreshTeams();
    } catch (err) {
      const error = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setError(
        error.response?.data?.error ||
          error.message ||
          t("team.renameError", "Failed to rename team"),
      );
    } finally {
      setRenamingTeam(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!currentTeam || isPersonalTeam) return;

    const confirmMessage = isTeamLeader
      ? t(
          "team.confirmLeaveLeader",
          'Are you sure you want to leave "{{name}}"? You are a team leader. Make sure there are other leaders before leaving.',
          { name: currentTeam.name },
        )
      : t("team.confirmLeave", 'Are you sure you want to leave "{{name}}"?', {
          name: currentTeam.name,
        });

    if (!window.confirm(confirmMessage)) return;

    try {
      await leaveTeam();
      setSuccess(t("team.leaveSuccess", "Successfully left team"));
    } catch (err) {
      const error = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setError(
        error.response?.data?.error ||
          error.message ||
          t("team.leaveError", "Failed to leave team"),
      );
    }
  };

  const handleConfirmTransfer = async () => {
    if (!transferTarget) return;
    setTransferring(true);
    setError(null);
    try {
      await transferLeadership(transferTarget.id);
      setTransferTarget(null);
      setSuccess(
        t(
          "team.transferSuccess",
          "Team ownership transferred. Your role is now member.",
        ),
      );
    } catch {
      setError(
        t(
          "team.transferError",
          "Ownership could not be transferred. Refresh the team and try again.",
        ),
      );
    } finally {
      setTransferring(false);
    }
  };

  const handleClaimOwnership = async () => {
    setTransferring(true);
    try {
      await claimLeadership();
      setSuccess(t("team.recoverSuccess", "You are now the team owner."));
    } catch {
      setError(
        t(
          "team.transferError",
          "Ownership could not be transferred. Refresh the team and try again.",
        ),
      );
    } finally {
      setTransferring(false);
    }
  };

  if (!currentTeam) {
    return (
      <Alert color="gray">
        <Text>{t("team.loading", "Loading team information...")}</Text>
      </Alert>
    );
  }

  const showMemberActions = isTeamLeader && !isPersonalTeam;

  return (
    <Stack gap="lg">
      <TransferOwnershipModal
        targetEmail={transferTarget?.email ?? null}
        error={error}
        transferring={transferring}
        onCancel={() => !transferring && setTransferTarget(null)}
        onConfirm={handleConfirmTransfer}
      />

      <NoOwnerAlert
        show={
          !isPersonalTeam &&
          teamMembers.length > 0 &&
          !teamMembers.some((m) => m.role === "LEADER")
        }
        busy={transferring}
        onClaim={handleClaimOwnership}
      />
      <TeamHeader
        canLeave={!isPersonalTeam && !isTeamLeader && !isEditingName}
        onLeave={handleLeaveTeam}
      >
        <TeamTitle
          editing={isEditingName}
          name={currentTeam.name}
          memberCount={currentTeam.seatsUsed}
          isLeader={isTeamLeader}
          isPersonal={isPersonalTeam}
          draftName={newTeamName}
          saving={renamingTeam}
          onDraftNameChange={setNewTeamName}
          onStartRename={handleStartRename}
          onSubmitRename={handleRenameSubmit}
          onCancelRename={handleCancelRename}
        />
      </TeamHeader>

      <DismissibleAlert
        message={error}
        color="red"
        onClose={() => setError(null)}
      />
      <DismissibleAlert
        message={success}
        color="green"
        onClose={() => setSuccess(null)}
      />

      <InviteMemberForm
        show={isTeamLeader}
        email={inviteEmail}
        inviting={inviting}
        onEmailChange={setInviteEmail}
        onSubmit={handleInvite}
      />

      <TeamMembersTable
        members={teamMembers}
        invitations={teamInvitations}
        showActions={showMemberActions}
        onMakeOwner={(member) =>
          setTransferTarget({ id: member.id, email: member.email })
        }
        onRemove={(member) => handleRemove(member.id, member.email)}
        onCancelInvitation={(invitation) =>
          handleCancelInvitation(
            invitation.invitationId,
            invitation.inviteeEmail,
          )
        }
      />
    </Stack>
  );
};

export default TeamSection;
