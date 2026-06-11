import React, { useState, useEffect } from "react";
import {
  Button,
  TextInput,
  Group,
  Text,
  Stack,
  Alert,
  Table,
  Badge,
  ActionIcon,
  Menu,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
import LocalIcon from "@app/components/shared/LocalIcon";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import apiClient from "@app/services/apiClient";

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
    leaveTeam,
    refreshTeams,
  } = useSaaSTeam();

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

  if (!currentTeam) {
    return (
      <Alert color="gray">
        <Text>{t("team.loading", "Loading team information...")}</Text>
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      {/* Header */}
      <div>
        <Group justify="space-between" align="center">
          <div style={{ flex: 1 }}>
            {isEditingName ? (
              <Group gap="xs" align="center">
                <TextInput
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder={t("team.namePlaceholder", "Team name")}
                  style={{ flex: 1, maxWidth: 300 }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit();
                    if (e.key === "Escape") handleCancelRename();
                  }}
                />
                <ActionIcon
                  variant="filled"
                  color="blue"
                  onClick={handleRenameSubmit}
                  loading={renamingTeam}
                  disabled={!newTeamName.trim()}
                >
                  <LocalIcon icon="check" width="1rem" height="1rem" />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={handleCancelRename}
                  disabled={renamingTeam}
                >
                  <LocalIcon icon="close" width="1rem" height="1rem" />
                </ActionIcon>
              </Group>
            ) : (
              <Group gap="xs" align="center">
                <Text fw={600} size="lg">
                  {currentTeam.name}
                </Text>
                {isTeamLeader && !isPersonalTeam && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handleStartRename}
                    aria-label={t("team.editName", "Edit team name")}
                  >
                    <LocalIcon icon="edit" width="1rem" height="1rem" />
                  </ActionIcon>
                )}
                {isTeamLeader && (
                  <Badge color="blue">{t("team.leader", "LEADER")}</Badge>
                )}
                {isPersonalTeam && (
                  <Badge color="gray" variant="light" size="xs">
                    {t("team.personal", "Personal")}
                  </Badge>
                )}
              </Group>
            )}
            {!isEditingName && !isPersonalTeam && (
              <Text size="sm" c="dimmed" mt={4}>
                {t("team.memberCount", "{{count}} team members", {
                  count: currentTeam.seatsUsed,
                })}
              </Text>
            )}
          </div>
          {!isPersonalTeam && !isTeamLeader && !isEditingName && (
            <Button
              color="red"
              variant="outline"
              size="xs"
              onClick={handleLeaveTeam}
              leftSection={
                <LocalIcon icon="logout" width="1rem" height="1rem" />
              }
            >
              {t("team.leaveButton", "Leave Team")}
            </Button>
          )}
        </Group>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <Alert color="red" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {success && (
        <Alert color="green" onClose={() => setSuccess(null)} withCloseButton>
          {success}
        </Alert>
      )}

      {/* Invite Members */}
      {isTeamLeader && (
        <div>
          <Text fw={600} size="md" mb="sm">
            {t("team.invite.title", "Invite Team Member")}
          </Text>
          <form onSubmit={handleInvite}>
            <Group>
              <TextInput
                type="email"
                placeholder={t("team.invite.placeholder", "email@example.com")}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                style={{ flex: 1 }}
                required
                error={
                  inviteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)
                    ? t("team.invite.invalidEmail", "Invalid email format")
                    : undefined
                }
              />
              <Button
                type="submit"
                loading={inviting}
                disabled={
                  !inviteEmail.trim() ||
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)
                }
              >
                {t("team.invite.sendButton", "Send Invite")}
              </Button>
            </Group>
          </form>
        </div>
      )}

      {/* Team Members Table */}
      <div>
        <Text fw={600} size="md" mb="sm">
          {t("team.members.title", "Team Members")}
        </Text>
        <Table
          horizontalSpacing="md"
          verticalSpacing="sm"
          withRowBorders
          highlightOnHover
          style={
            {
              "--table-border-color": "var(--mantine-color-gray-3)",
            } as React.CSSProperties
          }
        >
          <Table.Thead>
            <Table.Tr
              style={{ backgroundColor: "var(--mantine-color-gray-0)" }}
            >
              <Table.Th
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color: "var(--mantine-color-gray-7)",
                }}
              >
                {t("team.members.nameColumn", "Name")}
              </Table.Th>
              <Table.Th
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color: "var(--mantine-color-gray-7)",
                }}
              >
                {t("team.members.emailColumn", "Email")}
              </Table.Th>
              <Table.Th
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color: "var(--mantine-color-gray-7)",
                }}
              >
                {t("team.members.roleColumn", "Role")}
              </Table.Th>
              {isTeamLeader && !isPersonalTeam && (
                <Table.Th style={{ width: 50 }}></Table.Th>
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {teamMembers.length === 0 && teamInvitations.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={isTeamLeader && !isPersonalTeam ? 4 : 3}>
                  <Text ta="center" c="dimmed" py="xl">
                    {t("team.members.empty", "No team members yet.")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              <>
                {/* Active Members */}
                {teamMembers.map((member) => (
                  <Table.Tr key={`member-${member.id}`}>
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
                      <Badge
                        size="sm"
                        color={member.role === "LEADER" ? "blue" : undefined}
                        style={
                          member.role !== "LEADER"
                            ? {
                                backgroundColor: "var(--tool-header-badge-bg)",
                                color: "var(--tool-header-badge-text)",
                              }
                            : undefined
                        }
                      >
                        {member.role}
                      </Badge>
                    </Table.Td>
                    {isTeamLeader && !isPersonalTeam && (
                      <Table.Td>
                        {member.role !== "LEADER" && (
                          <Menu
                            position="bottom-end"
                            withinPortal
                            zIndex={Z_INDEX_OVER_CONFIG_MODAL}
                          >
                            <Menu.Target>
                              <ActionIcon variant="subtle">
                                <LocalIcon
                                  icon="more-vert"
                                  width="1rem"
                                  height="1rem"
                                />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                color="red"
                                leftSection={
                                  <LocalIcon
                                    icon="person-remove"
                                    width="1rem"
                                    height="1rem"
                                  />
                                }
                                onClick={() =>
                                  handleRemove(member.id, member.email)
                                }
                              >
                                {t("team.members.remove", "Remove from Team")}
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        )}
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}

                {/* Pending Invitations */}
                {teamInvitations
                  .filter((inv) => inv.status === "PENDING")
                  .map((invitation) => (
                    <Table.Tr key={`invitation-${invitation.invitationId}`}>
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
                      {isTeamLeader && !isPersonalTeam && (
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() =>
                              handleCancelInvitation(
                                invitation.invitationId,
                                invitation.inviteeEmail,
                              )
                            }
                            aria-label={t(
                              "team.invite.cancelLabel",
                              "Cancel invitation",
                            )}
                          >
                            <LocalIcon
                              icon="close"
                              width="1rem"
                              height="1rem"
                            />
                          </ActionIcon>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))}
              </>
            )}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
};

export default TeamSection;
