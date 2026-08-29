import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Stack,
  Text,
  Table,
  Badge,
  Loader,
  Group,
  Modal,
  Select,
  Tooltip,
  Menu,
  Avatar,
  Box,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import LocalIcon from "@app/components/shared/LocalIcon";
import { alert } from "@app/components/toast";
import { teamService } from "@app/services/teamService";
import {
  User,
  userManagementService,
} from "@app/services/userManagementService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import ChangeUserPasswordModal from "@app/components/shared/ChangeUserPasswordModal";
import {
  useAdminUsers,
  useTeamDetails,
  useTeams,
  useAdminMutation,
  useInvalidateAdminDirectory,
} from "@app/hooks/useAdminDirectory";

interface TeamDetailsSectionProps {
  teamId: number;
  onBack: () => void;
}

export default function TeamDetailsSection({
  teamId,
  onBack,
}: TeamDetailsSectionProps) {
  const { t } = useTranslation();
  const details = useTeamDetails(teamId, true);
  const admin = useAdminUsers(true);
  // The same list TeamsSection is showing behind this view.
  const { data: allTeams = [] } = useTeams(true);
  const refreshDirectory = useInvalidateAdminDirectory();

  const loading = details.isPending || admin.isPending;
  const team = details.data?.team ?? null;
  const teamUsers = Array.isArray(details.data?.teamUsers)
    ? details.data.teamUsers
    : [];
  const availableUsers = Array.isArray(details.data?.availableUsers)
    ? details.data.availableUsers
    : [];
  const userLastRequest = details.data?.userLastRequest ?? {};
  const licenseInfo = admin.data
    ? { availableSlots: admin.data.availableSlots }
    : null;
  const mailEnabled = admin.data?.mailEnabled ?? false;
  const lockedUsers = admin.data?.lockedUsers ?? [];

  const [addMemberModalOpened, setAddMemberModalOpened] = useState(false);
  const [changeTeamModalOpened, setChangeTeamModalOpened] = useState(false);
  const [changePasswordModalOpened, setChangePasswordModalOpened] =
    useState(false);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const availableUsersForTeam = team
    ? availableUsers.filter((user) => user.team?.id !== team.id)
    : [];

  const isLockedUser = (user: User) => lockedUsers.includes(user.username);

  // A failed load leaves nothing to show, so the view hands back to the list.
  const loadFailed = details.isLoadingError || admin.isLoadingError;
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!loadFailed || reportedRef.current) return;
    reportedRef.current = true;
    alert({
      alertType: "error",
      title: t("workspace.teams.loadError", "Failed to load team details"),
    });
    onBack();
  }, [loadFailed, onBack, t]);

  // A membership move changes the team's count, the member's own team and
  // both teams' detail rows.
  const MEMBERSHIP = ["teams", "teamDetails", "users"] as const;

  const addMember = useAdminMutation({
    write: (userId: number) => teamService.addUserToTeam(teamId, userId),
    invalidates: MEMBERSHIP,
    success: t(
      "workspace.teams.addMemberToTeam.success",
      "User added to team successfully",
    ),
    errorFallback: t(
      "workspace.teams.addMemberToTeam.error",
      "Failed to add user to team",
    ),
    onDone: () => {
      setAddMemberModalOpened(false);
      setSelectedUserId("");
    },
  });

  const removeMember = useAdminMutation({
    write: (user: User) => {
      const defaultTeam = allTeams.find((team) => team.name === "Default");
      if (!defaultTeam) throw new Error("Default team not found");
      return teamService.moveUserToTeam(
        user.username,
        user.rolesAsString || "ROLE_USER",
        defaultTeam.id,
      );
    },
    invalidates: MEMBERSHIP,
    success: t("workspace.teams.removeMemberSuccess", "User removed from team"),
    errorFallback: t(
      "workspace.teams.removeMemberError",
      "Failed to remove user from team",
    ),
  });

  const changeTeam = useAdminMutation({
    write: ({ user, teamId: target }: { user: User; teamId: number }) =>
      teamService.moveUserToTeam(
        user.username,
        user.rolesAsString || "ROLE_USER",
        target,
      ),
    invalidates: MEMBERSHIP,
    success: t(
      "workspace.teams.changeTeam.success",
      "Team changed successfully",
    ),
    errorFallback: t(
      "workspace.teams.changeTeam.error",
      "Failed to change team",
    ),
    onDone: () => {
      setChangeTeamModalOpened(false);
      setSelectedUser(null);
      setSelectedTeamId("");
    },
  });

  const deleteUser = useAdminMutation({
    write: (username: string) => userManagementService.deleteUser(username),
    invalidates: ["users", "teams"],
    success: t(
      "workspace.people.deleteUserSuccess",
      "User deleted successfully",
    ),
    errorFallback: t(
      "workspace.people.deleteUserError",
      "Failed to delete user",
    ),
  });

  const unlockUser = useAdminMutation({
    write: (username: string) => userManagementService.unlockUser(username),
    invalidates: ["users"],
    success: t(
      "workspace.people.unlockUserSuccess",
      "User account unlocked successfully",
    ),
    errorFallback: t(
      "workspace.people.unlockUserError",
      "Failed to unlock user account",
    ),
  });

  // Row actions are blocked while any write is in flight, as before.
  const processing =
    addMember.isPending ||
    removeMember.isPending ||
    changeTeam.isPending ||
    deleteUser.isPending ||
    unlockUser.isPending;

  const handleAddMember = () => {
    if (!selectedUserId) {
      alert({
        alertType: "error",
        title: t(
          "workspace.teams.addMemberToTeam.selectUserRequired",
          "Please select a user",
        ),
      });
      return;
    }
    addMember.mutate(parseInt(selectedUserId));
  };

  const handleRemoveMember = (user: User) => {
    const confirmMessage = t(
      "workspace.teams.confirmRemove",
      `Remove ${user.username} from this team?`,
    );
    if (!window.confirm(confirmMessage)) return;
    removeMember.mutate(user);
  };

  const handleDeleteUser = (user: User) => {
    const confirmMessage = t(
      "workspace.people.confirmDelete",
      "Are you sure you want to delete this user? This action cannot be undone.",
    );
    if (
      !window.confirm(`${confirmMessage}

User: ${user.username}`)
    )
      return;
    deleteUser.mutate(user.username);
  };

  const handleUnlockUser = (user: User) => {
    const confirmMessage = t(
      "workspace.people.confirmUnlock",
      "Are you sure you want to unlock this user account?",
    );
    if (
      !window.confirm(`${confirmMessage}

User: ${user.username}`)
    )
      return;
    unlockUser.mutate(user.username);
  };

  const openChangeTeamModal = (user: User) => {
    setSelectedUser(user);
    setSelectedTeamId(user.team?.id?.toString() || "");
    setChangeTeamModalOpened(true);
  };

  const openChangePasswordModal = (user: User) => {
    setPasswordUser(user);
    setChangePasswordModalOpened(true);
  };

  const closeChangePasswordModal = () => {
    setChangePasswordModalOpened(false);
    setPasswordUser(null);
  };

  const handleChangeTeam = () => {
    if (!selectedUser || !selectedTeamId) {
      alert({
        alertType: "error",
        title: t(
          "workspace.teams.changeTeam.selectTeamRequired",
          "Please select a team",
        ),
      });
      return;
    }
    changeTeam.mutate({
      user: selectedUser,
      teamId: parseInt(selectedTeamId),
    });
  };

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          {t("workspace.teams.loadingDetails", "Loading team details...")}
        </Text>
      </Stack>
    );
  }

  if (!team) {
    return (
      <Stack align="center" py="xl">
        <Text size="sm" c="var(--color-red-dark)">
          {t("workspace.teams.teamNotFound", "Team not found")}
        </Text>
        <Button variant="secondary" onClick={onBack}>
          {t("workspace.teams.backToTeams", "Back to Teams")}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {/* Header with back button */}
      <Group>
        <ActionIcon
          variant="tertiary"
          onClick={onBack}
          aria-label={t("common.back", "Back")}
        >
          <LocalIcon icon="arrow-back" width="1.2rem" height="1.2rem" />
        </ActionIcon>
        <div style={{ flex: 1 }}>
          <Text fw={600} size="lg">
            {team.name}
          </Text>
          <Text size="sm" c="dimmed">
            {t("workspace.teams.memberCount", { count: teamUsers.length })}
          </Text>
        </div>
      </Group>

      {/* Add Member Button */}
      <Group justify="flex-end">
        <Tooltip
          label={t("workspace.people.license.slotsAvailable", {
            count: licenseInfo ? licenseInfo.availableSlots : 0,
          })}
          disabled={!licenseInfo || licenseInfo.availableSlots > 0}
          position="bottom"
          withArrow
          zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        >
          <Button
            leftSection={
              <LocalIcon icon="person-add" width="1rem" height="1rem" />
            }
            onClick={() => setAddMemberModalOpened(true)}
            disabled={
              team.name === "Internal" ||
              (licenseInfo ? licenseInfo.availableSlots === 0 : false)
            }
          >
            {t("workspace.teams.addMember")}
          </Button>
        </Tooltip>
      </Group>

      {/* Members Table */}
      <Table horizontalSpacing="md" verticalSpacing="sm" withRowBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ fontWeight: 600 }} fz="sm">
              {t("workspace.people.user")}
            </Table.Th>
            <Table.Th style={{ fontWeight: 600 }} fz="sm" w={100}>
              {t("workspace.people.role")}
            </Table.Th>
            <Table.Th w={50}>
              <span className="sr-only">
                {t("workspace.people.memberActions", "Member actions")}
              </span>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {teamUsers.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Text ta="center" c="dimmed" py="xl">
                  {t("workspace.teams.noMembers", "No members in this team")}
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            teamUsers.map((user) => {
              const isActive =
                userLastRequest[user.username] &&
                Date.now() - userLastRequest[user.username] < 5 * 60 * 1000; // Active within last 5 minutes

              return (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Tooltip
                        label={
                          !user.enabled
                            ? t("workspace.people.disabled", "Disabled")
                            : isActive
                              ? t(
                                  "workspace.people.activeSession",
                                  "Active session",
                                )
                              : t("workspace.people.active", "Active")
                        }
                        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
                      >
                        <Avatar
                          size={32}
                          color={user.enabled ? "blue" : "gray"}
                          styles={{
                            root: {
                              border: isActive
                                ? "2px solid var(--mantine-color-green-6)"
                                : "none",
                              opacity: user.enabled ? 1 : 0.5,
                            },
                          }}
                        >
                          {user.username.charAt(0).toUpperCase()}
                        </Avatar>
                      </Tooltip>
                      <Box style={{ minWidth: 0, flex: 1 }}>
                        <Group gap={6} wrap="nowrap" align="center">
                          <Tooltip
                            label={user.username}
                            disabled={user.username.length <= 20}
                            zIndex={Z_INDEX_OVER_CONFIG_MODAL}
                          >
                            <Text
                              size="sm"
                              fw={500}
                              maw={200}
                              style={{
                                lineHeight: 1.3,
                                color: user.enabled
                                  ? undefined
                                  : "var(--c-text-muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {user.username}
                            </Text>
                          </Tooltip>
                          {isLockedUser(user) && (
                            <Badge color="orange" variant="light" size="xs">
                              {t("workspace.people.lockedBadge", "Locked")}
                            </Badge>
                          )}
                        </Group>
                        {user.email && (
                          <Text
                            size="xs"
                            c="dimmed"
                            truncate
                            style={{ lineHeight: 1.3 }}
                          >
                            {user.email}
                          </Text>
                        )}
                      </Box>
                    </Group>
                  </Table.Td>
                  <Table.Td w={100}>
                    <Badge
                      size="sm"
                      color={
                        (user.rolesAsString || "").includes("ROLE_ADMIN")
                          ? "blue"
                          : "cyan"
                      }
                      variant="light"
                    >
                      {(user.rolesAsString || "").includes("ROLE_ADMIN")
                        ? t("workspace.people.admin")
                        : t("workspace.people.user")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      {/* Info icon with tooltip */}
                      <Tooltip
                        label={
                          <div>
                            <Text size="xs" fw={500}>
                              Authentication:{" "}
                              {user.authenticationType || "Unknown"}
                            </Text>
                            <Text size="xs">
                              Last Activity:{" "}
                              {userLastRequest[user.username]
                                ? new Date(
                                    userLastRequest[user.username],
                                  ).toLocaleString()
                                : "Never"}
                            </Text>
                          </div>
                        }
                        multiline
                        w={220}
                        position="left"
                        withArrow
                        zIndex={Z_INDEX_OVER_CONFIG_MODAL + 10}
                      >
                        <ActionIcon
                          variant="tertiary"
                          size="sm"
                          aria-label={t(
                            "workspace.people.userInfo",
                            "User info",
                          )}
                        >
                          <LocalIcon icon="info" width="1rem" height="1rem" />
                        </ActionIcon>
                      </Tooltip>

                      {/* Actions menu */}
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon
                            variant="tertiary"
                            aria-label={t(
                              "workspace.people.memberActions",
                              "Member actions",
                            )}
                          >
                            <LocalIcon
                              icon="more-vert"
                              width="1rem"
                              height="1rem"
                            />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown
                          style={{ zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
                        >
                          <Menu.Item
                            leftSection={
                              <LocalIcon
                                icon="swap-horiz"
                                width="1rem"
                                height="1rem"
                              />
                            }
                            onClick={() => openChangeTeamModal(user)}
                            disabled={processing || team.name === "Internal"}
                          >
                            {t(
                              "workspace.teams.changeTeam.label",
                              "Change Team",
                            )}
                          </Menu.Item>
                          <Menu.Item
                            leftSection={
                              <LocalIcon
                                icon="lock"
                                width="1rem"
                                height="1rem"
                              />
                            }
                            onClick={() => openChangePasswordModal(user)}
                            disabled={processing}
                          >
                            {t(
                              "workspace.people.changePassword.action",
                              "Change password",
                            )}
                          </Menu.Item>
                          {isLockedUser(user) && (
                            <Menu.Item
                              leftSection={
                                <LocalIcon
                                  icon="lock-open"
                                  width="1rem"
                                  height="1rem"
                                />
                              }
                              onClick={() => handleUnlockUser(user)}
                              disabled={processing}
                            >
                              {t(
                                "workspace.people.unlockAccount",
                                "Unlock Account",
                              )}
                            </Menu.Item>
                          )}
                          {team.name !== "Internal" &&
                            team.name !== "Default" && (
                              <Menu.Item
                                leftSection={
                                  <LocalIcon
                                    icon="person-remove"
                                    width="1rem"
                                    height="1rem"
                                  />
                                }
                                onClick={() => handleRemoveMember(user)}
                                disabled={processing}
                              >
                                {t(
                                  "workspace.teams.removeMember",
                                  "Remove from team",
                                )}
                              </Menu.Item>
                            )}
                          <Menu.Divider />
                          <Menu.Item
                            color="red"
                            leftSection={
                              <LocalIcon
                                icon="delete"
                                width="1rem"
                                height="1rem"
                              />
                            }
                            onClick={() => handleDeleteUser(user)}
                            disabled={processing || team.name === "Internal"}
                          >
                            {t("workspace.people.deleteUser", "Delete User")}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>

      <ChangeUserPasswordModal
        opened={changePasswordModalOpened}
        onClose={closeChangePasswordModal}
        user={passwordUser}
        onSuccess={refreshDirectory}
        mailEnabled={mailEnabled}
      />

      {/* Add Member Modal */}
      <Modal
        opened={addMemberModalOpened}
        onClose={() => setAddMemberModalOpened(false)}
        size="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        centered
        padding="xl"
        withCloseButton={false}
      >
        <div style={{ position: "relative" }}>
          <ActionIcon
            onClick={() => setAddMemberModalOpened(false)}
            size="lg"
            variant="tertiary"
            aria-label={t("common.close", "Close")}
            style={{
              position: "absolute",
              top: -8,
              right: -8,
              zIndex: 1,
            }}
          >
            <LocalIcon icon="close-rounded" />
          </ActionIcon>
          <Stack gap="lg" pt="md">
            {/* Header with Icon */}
            <Stack gap="md" align="center">
              <LocalIcon
                icon="person-add"
                width="3rem"
                height="3rem"
                style={{ color: "var(--mantine-color-gray-6)" }}
              />
              <Text size="xl" fw={600} ta="center">
                {t("workspace.teams.addMemberToTeam.title")}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {t("workspace.teams.addMemberToTeam.addingTo")}{" "}
                <strong>{team.name}</strong>
              </Text>
            </Stack>

            <Select
              label={t("workspace.teams.addMemberToTeam.selectUser")}
              placeholder={t(
                "workspace.teams.addMemberToTeam.selectUserPlaceholder",
              )}
              data={availableUsersForTeam.map((user) => ({
                value: user.id.toString(),
                label: `${user.username}${user.team ? ` (${t("workspace.teams.addMemberToTeam.currentlyIn")} ${user.team.name})` : ""}`,
              }))}
              value={selectedUserId}
              onChange={(value) => setSelectedUserId(value || "")}
              searchable
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
            />

            {selectedUserId &&
              availableUsersForTeam.find(
                (u) => u.id.toString() === selectedUserId,
              )?.team && (
                <Text size="xs" c="var(--color-amber-dark)">
                  {t("workspace.teams.addMemberToTeam.willBeMoved")}
                </Text>
              )}

            <Button
              onClick={handleAddMember}
              loading={addMember.isPending}
              fullWidth
              size="md"
              style={{ marginTop: "var(--mantine-spacing-md)" }}
            >
              {t("workspace.teams.addMemberToTeam.submit")}
            </Button>
          </Stack>
        </div>
      </Modal>

      {/* Change Team Modal */}
      <Modal
        opened={changeTeamModalOpened}
        onClose={() => setChangeTeamModalOpened(false)}
        size="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        centered
        padding="xl"
        withCloseButton={false}
      >
        <div style={{ position: "relative" }}>
          <ActionIcon
            onClick={() => setChangeTeamModalOpened(false)}
            size="lg"
            variant="tertiary"
            aria-label={t("common.close", "Close")}
            style={{
              position: "absolute",
              top: -8,
              right: -8,
              zIndex: 1,
            }}
          >
            <LocalIcon icon="close-rounded" />
          </ActionIcon>
          <Stack gap="lg" pt="md">
            {/* Header with Icon */}
            <Stack gap="md" align="center">
              <LocalIcon
                icon="swap-horiz"
                width="3rem"
                height="3rem"
                style={{ color: "var(--mantine-color-gray-6)" }}
              />
              <Text size="xl" fw={600} ta="center">
                {t("workspace.teams.changeTeam.title", "Change Team")}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {t("workspace.teams.changeTeam.changing", "Moving")}{" "}
                <strong>{selectedUser?.username}</strong>
              </Text>
            </Stack>

            <Select
              label={t("workspace.teams.changeTeam.selectTeam", "Select Team")}
              placeholder={t(
                "workspace.teams.changeTeam.selectTeamPlaceholder",
                "Choose a team",
              )}
              data={allTeams
                .filter((t) => t.name !== "Internal")
                .map((team) => ({
                  value: team.id.toString(),
                  label: team.name,
                }))}
              value={selectedTeamId}
              onChange={(value) => setSelectedTeamId(value || "")}
              searchable
              comboboxProps={{
                withinPortal: true,
                zIndex: Z_INDEX_OVER_CONFIG_MODAL,
              }}
            />

            <Button
              onClick={handleChangeTeam}
              loading={changeTeam.isPending}
              fullWidth
              size="md"
              style={{ marginTop: "var(--mantine-spacing-md)" }}
            >
              {t("workspace.teams.changeTeam.submit", "Change Team")}
            </Button>
          </Stack>
        </div>
      </Modal>
    </Stack>
  );
}
