import React, { useState, useEffect, type ReactNode } from "react";
import { TextInput, Group, Text, Stack, Alert } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Avatar } from "@app/ui/Avatar";
import { DataTable, column } from "@app/ui/DataTable";
import { StatusBadge } from "@app/ui/StatusBadge";
import { useTranslation } from "react-i18next";
import { useTeamAuth } from "@app/auth/teamSession";
import {
  useSaaSTeam,
  type TeamInvitation,
  type TeamMember,
} from "@app/contexts/SaaSTeamContext";
import { Icon } from "@app/ui/Icon";
import {
  OwnershipTransferModal,
  type CloudOwnershipStatus,
} from "@app/components/shared/ownership/OwnershipTransferModal";
import apiClient from "@app/services/apiClient";
import { useTeamAvatarUrls } from "@app/hooks/useTeamAvatarUrls";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

type TeamTableRow =
  | { kind: "member"; member: TeamMember }
  | { kind: "invitation"; invitation: TeamInvitation };

interface TeamMembersTableProps {
  members: TeamMember[];
  invitations: TeamInvitation[];
  showActions: boolean;
  onMakeOwner: (member: TeamMember) => void;
  onRemove: (member: TeamMember) => void;
  onCancelInvitation: (invitation: TeamInvitation) => void;
}

function TeamMembersTable(props: TeamMembersTableProps) {
  const { t } = useTranslation();
  const avatarUrls = useTeamAvatarUrls(props.members);

  const rows: TeamTableRow[] = [
    ...props.members.map((member) => ({ kind: "member" as const, member })),
    ...props.invitations
      .filter((inv) => inv.status === "PENDING")
      .map((invitation) => ({ kind: "invitation" as const, invitation })),
  ];

  const columns = [
    column.entity<TeamTableRow>({
      key: "name",
      header: t("team.members.nameColumn", "Name"),
      icon: (row) =>
        row.kind === "member" ? (
          <Avatar
            name={row.member.username}
            size="sm"
            src={
              row.member.supabaseId
                ? avatarUrls[row.member.supabaseId]
                : undefined
            }
          />
        ) : undefined,
      primary: (row) =>
        row.kind === "member"
          ? row.member.username
          : row.invitation.inviteeEmail.split("@")[0],
    }),
    column.muted<TeamTableRow>({
      key: "email",
      header: t("team.members.emailColumn", "Email"),
      get: (row) =>
        row.kind === "member" ? row.member.email : row.invitation.inviteeEmail,
    }),
    column.badge<TeamTableRow>({
      key: "role",
      header: t("team.members.roleColumn", "Role"),
      get: (row) => {
        if (row.kind === "member") {
          return {
            tone: row.member.role === "LEADER" ? "info" : "neutral",
            label:
              row.member.role === "LEADER"
                ? t("users.role.orgOwner", "Org Owner")
                : t("users.role.member", "Member"),
          };
        }
        return {
          tone: "warning",
          label: t("team.members.pending", "PENDING"),
        };
      },
    }),
    ...(props.showActions
      ? [
          column.actions<TeamTableRow>({
            key: "actions",
            get: (row) => {
              if (row.kind === "member") {
                if (row.member.role === "LEADER") return [];
                return [
                  {
                    label: t("team.members.actions", "Member actions"),
                    glyph: "kebab",
                    iconOnly: true,
                    menu: [
                      {
                        label: t("team.makeOwner", "Make owner"),
                        onClick: () => props.onMakeOwner(row.member),
                      },
                      {
                        label: t("team.members.remove", "Remove from Team"),
                        tone: "danger",
                        onClick: () => props.onRemove(row.member),
                      },
                    ],
                  },
                ];
              }
              return [
                {
                  label: t("team.invite.cancelLabel", "Cancel invitation"),
                  tone: "danger",
                  onClick: () => props.onCancelInvitation(row.invitation),
                },
              ];
            },
          }),
        ]
      : []),
  ];

  return (
    <div>
      <Text fw={600} size="md" mb="sm">
        {t("team.members.title", "Team Members")}
      </Text>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) =>
          row.kind === "member"
            ? `member-${row.member.id}`
            : `invitation-${row.invitation.invitationId}`
        }
        empty={t("team.members.empty", "No team members yet.")}
      />
    </div>
  );
}

const TeamSection: React.FC = () => {
  const { t } = useTranslation();
  const { refreshAfterMembershipChange } = useTeamAuth();
  const {
    currentTeam,
    loading,
    teamMembers,
    teamInvitations,
    isTeamLeader,
    isPersonalTeam,
    inviteUser,
    cancelInvitation,
    removeMember,
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
        {loading ? (
          <Text>{t("team.loading", "Loading team information...")}</Text>
        ) : (
          <>
            <Text>
              {t(
                "team.currentUnavailable",
                "We couldn't identify your current team. Try again, or contact support if this continues.",
              )}
            </Text>
            <Button onClick={() => void refreshTeams()}>
              {t("common.retry", "Try again")}
            </Button>
          </>
        )}
      </Alert>
    );
  }

  const showMemberActions = isTeamLeader && !isPersonalTeam;

  return (
    <Stack gap="lg">
      {transferTarget && (
        <OwnershipTransferModal
          key={transferTarget.id}
          adapter={{
            local: false,
            prepare: async () => ({
              targetId: transferTarget.id,
              targetName: transferTarget.email,
              targetEmail: transferTarget.email,
              cloud: (
                await apiClient.post<CloudOwnershipStatus>(
                  `/api/v1/team/${currentTeam.teamId}/ownership/status`,
                  { email: transferTarget.email },
                )
              ).data,
            }),
            transferCloud: async (state) => {
              await apiClient.post(
                `/api/v1/team/${state.cloud!.teamId}/ownership/transfer`,
                {
                  email: transferTarget.email,
                  expectedLeaderId: state.cloud!.leaderUserId,
                },
              );
              return {
                ...state,
                cloud: { ...state.cloud!, state: "TRANSFERRED" },
              };
            },
          }}
          onClose={() => setTransferTarget(null)}
          onTransferred={() => {
            setSuccess(
              t(
                "team.transferSuccess",
                "Team ownership transferred. Your role is now member.",
              ),
            );
            void refreshTeams();
            void refreshAfterMembershipChange();
          }}
        />
      )}

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
