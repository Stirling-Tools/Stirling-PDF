import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Stack,
  Text,
  Button,
  TextInput,
  Table,
  ActionIcon,
  Menu,
  Badge,
  Loader,
  Group,
  Modal,
  Select,
  Tooltip,
  CloseButton,
  Avatar,
  Box,
} from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { alert } from '@app/components/toast';
import { userManagementService, User } from '@app/services/userManagementService';
import { teamService, Team } from '@app/services/teamService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import InviteMembersModal from '@app/components/shared/InviteMembersModal';
import { useLoginRequired } from '@app/hooks/useLoginRequired';
import LoginRequiredBanner from '@app/components/shared/config/LoginRequiredBanner';
import { useNavigate } from 'react-router-dom';
import UpdateSeatsButton from '@app/components/shared/UpdateSeatsButton';
import { useLicense } from '@app/contexts/LicenseContext';
import ChangeUserPasswordModal from '@app/components/shared/ChangeUserPasswordModal';
import { useAuth } from '@app/auth/UseSession';

export default function PeopleSection() {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { loginEnabled } = useLoginRequired();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const { licenseInfo: globalLicenseInfo } = useLicense();
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteModalOpened, setInviteModalOpened] = useState(false);
  const [editUserModalOpened, setEditUserModalOpened] = useState(false);
  const [changePasswordModalOpened, setChangePasswordModalOpened] = useState(false);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [processing, setProcessing] = useState(false);
  const [mailEnabled, setMailEnabled] = useState(false);

  // License information
  const [licenseInfo, setLicenseInfo] = useState<{
    maxAllowedUsers: number;
    availableSlots: number;
    grandfatheredUserCount: number;
    licenseMaxUsers: number;
    premiumEnabled: boolean;
    totalUsers: number;
  } | null>(null);
  const hasNoSlots = licenseInfo ? licenseInfo.availableSlots === 0 : false;
  const handleAddMembersClick = () => {
    if (!loginEnabled) {
      return;
    }
    if (hasNoSlots) {
      navigate('/settings/adminPlan');
      return;
    }
    setInviteModalOpened(true);
  };

  const addMemberTooltip = !loginEnabled
    ? t('workspace.people.loginRequired', 'Enable login mode first')
    : hasNoSlots
      ? t('workspace.people.license.noSlotsAvailable', 'No user slots available')
      : null;

  const isCurrentUser = (user: User) => currentUser?.username === user.username;

  // Form state for edit user modal
  const [editForm, setEditForm] = useState({
    role: 'ROLE_USER',
    teamId: undefined as number | undefined,
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (config) {
      console.log('[PeopleSection] Email invites enabled:', config.enableEmailInvites);
    }
  }, [config]);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (loginEnabled) {
        const [adminData, teamsData] = await Promise.all([
          userManagementService.getUsers(),
          teamService.getTeams(),
        ]);

        console.log('[PeopleSection] Fetched users:', adminData.users);
        console.log('[PeopleSection] Fetched user settings:', adminData.userSettings);

        // Enrich users with session data
        const enrichedUsers = adminData.users.map(user => ({
          ...user,
          isActive: adminData.userSessions[user.username] || false,
          lastRequest: adminData.userLastRequest[user.username] || undefined,
          mfaEnabled: adminData.userSettings?.[user.username]?.mfaEnabled === 'true',
        }));

        setUsers(enrichedUsers);
        setTeams(teamsData);

        // Store license information
        setLicenseInfo({
          maxAllowedUsers: adminData.maxAllowedUsers,
          availableSlots: adminData.availableSlots,
          grandfatheredUserCount: adminData.grandfatheredUserCount,
          licenseMaxUsers: adminData.licenseMaxUsers,
          premiumEnabled: adminData.premiumEnabled,
          totalUsers: adminData.totalUsers,
        });
        setMailEnabled(adminData.mailEnabled);
      } else {
        // Provide example data when login is disabled
        const exampleUsers: User[] = [
          {
            id: 1,
            username: 'admin',
            email: 'admin@example.com',
            enabled: true,
            roleName: 'ROLE_ADMIN',
            rolesAsString: 'ROLE_ADMIN',
            authenticationType: 'password',
            isActive: true,
            lastRequest: Date.now(),
            team: { id: 1, name: 'Engineering' }
          },
          {
            id: 2,
            username: 'john.doe',
            email: 'john.doe@example.com',
            enabled: true,
            roleName: 'ROLE_USER',
            rolesAsString: 'ROLE_USER',
            authenticationType: 'password',
            isActive: false,
            lastRequest: Date.now() - 86400000,
            team: { id: 1, name: 'Engineering' }
          },
          {
            id: 3,
            username: 'jane.smith',
            email: 'jane.smith@example.com',
            enabled: true,
            roleName: 'ROLE_USER',
            rolesAsString: 'ROLE_USER',
            authenticationType: 'oauth',
            isActive: true,
            lastRequest: Date.now(),
            team: { id: 2, name: 'Marketing' }
          },
          {
            id: 4,
            username: 'bob.wilson',
            email: 'bob.wilson@example.com',
            enabled: false,
            roleName: 'ROLE_USER',
            rolesAsString: 'ROLE_USER',
            authenticationType: 'password',
            isActive: false,
            lastRequest: Date.now() - 604800000,
            team: undefined
          }
        ];

        const exampleTeams: Team[] = [
          { id: 1, name: 'Engineering', userCount: 3 },
          { id: 2, name: 'Marketing', userCount: 2 }
        ];

        setUsers(exampleUsers);
        setTeams(exampleTeams);
        setMailEnabled(false);

        // Example license information
        setLicenseInfo({
          maxAllowedUsers: 10,
          availableSlots: 6,
          grandfatheredUserCount: 0,
          licenseMaxUsers: 5,
          premiumEnabled: true,
          totalUsers: 4,
        });
      }
    } catch (error) {
      console.error('[PeopleSection] Failed to fetch people data:', error);
      alert({ alertType: 'error', title: 'Failed to load people data' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserRole = async () => {
    if (!selectedUser) return;

    try {
      setProcessing(true);
      await userManagementService.updateUserRole({
        username: selectedUser.username,
        role: editForm.role,
        teamId: editForm.teamId,
      });
      alert({ alertType: 'success', title: t('workspace.people.editMember.success') });
      closeEditModal();
      fetchData();
    } catch (error: any) {
      console.error('[PeopleSection] Failed to update user:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.people.editMember.error');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleEnabled = async (user: User) => {
    try {
      await userManagementService.toggleUserEnabled(user.username, !user.enabled);
      alert({ alertType: 'success', title: t('workspace.people.toggleEnabled.success') });
      fetchData();
    } catch (error: any) {
      console.error('[PeopleSection] Failed to toggle user status:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.people.toggleEnabled.error');
      alert({ alertType: 'error', title: errorMessage });
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmMessage = t('workspace.people.confirmDelete', 'Are you sure you want to delete this user? This action cannot be undone.');
    if (!window.confirm(`${confirmMessage}\n\nUser: ${user.username}`)) {
      return;
    }

    try {
      await userManagementService.deleteUser(user.username);
      alert({ alertType: 'success', title: t('workspace.people.deleteUserSuccess', 'User deleted successfully') });
      fetchData();
    } catch (error: any) {
      console.error('[PeopleSection] Failed to delete user:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.people.deleteUserError', 'Failed to delete user');
      alert({ alertType: 'error', title: errorMessage });
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      role: user.roleName,
      teamId: user.team?.id,
    });
    setEditUserModalOpened(true);
  };

  const openChangePasswordModal = (user: User) => {
    setPasswordUser(user);
    setChangePasswordModalOpened(true);
  };

  const closeChangePasswordModal = () => {
    setChangePasswordModalOpened(false);
    setPasswordUser(null);
  };

  const closeEditModal = () => {
    setEditUserModalOpened(false);
    setSelectedUser(null);
    setEditForm({
      role: 'ROLE_USER',
      teamId: undefined,
    });
  };

  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const roleOptions = [
    {
      value: 'ROLE_ADMIN',
      label: t('workspace.people.admin'),
      description: t('workspace.people.roleDescriptions.admin', 'Can manage settings and invite members, with full administrative access.'),
      icon: 'admin-panel-settings'
    },
    {
      value: 'ROLE_USER',
      label: t('workspace.people.member'),
      description: t('workspace.people.roleDescriptions.member', 'Can view and edit shared files, but cannot manage workspace settings or members.'),
      icon: 'person'
    },
  ];

  const renderRoleOption = ({ option }: { option: any }) => (
    <Group gap="sm" wrap="nowrap">
      <LocalIcon icon={option.icon} width="1.25rem" height="1.25rem" style={{ flexShrink: 0 }} />
      <Box style={{ flex: 1 }}>
        <Text size="sm" fw={500}>{option.label}</Text>
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>
          {option.description}
        </Text>
      </Box>
    </Group>
  );

  const teamOptions = teams.map((team) => ({
    value: team.id.toString(),
    label: team.name,
  }));

  if (loading) {
    return (
      <Stack align="center" py="md">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          {t('workspace.people.loading', 'Loading people...')}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <LoginRequiredBanner show={!loginEnabled} />
      <div>
        <Text fw={600} size="lg">
          {t('workspace.people.title')}
        </Text>
        <Text size="sm" c="dimmed">
          {t('workspace.people.description')}
        </Text>
      </div>

      {/* License Information - Compact */}
      {licenseInfo && (
        <Group gap="md" style={{ fontSize: '0.875rem' }}>
          <Text size="sm" span c="dimmed">
            <Text component="span" fw={600} c="inherit">{licenseInfo.totalUsers}</Text>
            <Text component="span" c="dimmed"> / </Text>
            <Text component="span" fw={600} c="inherit">{licenseInfo.maxAllowedUsers}</Text>
            <Text component="span" c="dimmed"> {t('workspace.people.license.users', 'users')}</Text>
          </Text>

          {licenseInfo.availableSlots === 0 && (
            <Group gap="xs" wrap="nowrap" align="center">
              <Badge color="red" variant="light" size="sm">
                {t('workspace.people.license.noSlotsAvailable', 'No slots available')}
              </Badge>
              <Button
                size="compact-sm"
                variant="outline"
                onClick={() => navigate('/settings/adminPlan')}
              >
                {t('workspace.people.actions.upgrade', 'Upgrade')}
              </Button>
            </Group>
          )}

          {licenseInfo.grandfatheredUserCount > 0 && (
            <Text size="sm" c="dimmed" span>
              •
              <Text component="span" ml={4}>
                {t('workspace.people.license.grandfatheredShort', '{{count}} grandfathered', { count: licenseInfo.grandfatheredUserCount })}
              </Text>
            </Text>
          )}

          {licenseInfo.premiumEnabled && licenseInfo.licenseMaxUsers > 0 && (
            <Badge color="blue" variant="light" size="sm">
              +{licenseInfo.licenseMaxUsers} {t('workspace.people.license.fromLicense', 'from license')}
            </Badge>
          )}

          {/* Enterprise Seat Management Button */}
          {globalLicenseInfo?.licenseType === 'ENTERPRISE' && (
            <>
              <Text size="sm" c="dimmed" span>•</Text>
              <UpdateSeatsButton
                size="xs"
                onSuccess={fetchData}
              />
            </>
          )}
        </Group>
      )}

      {/* Header Actions */}
      <Group justify="space-between">
        <TextInput
          placeholder={t('workspace.people.searchMembers')}
          leftSection={<LocalIcon icon="search" width="1rem" height="1rem" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          style={{ maxWidth: 300 }}
        />
        <Tooltip
          label={addMemberTooltip || undefined}
          disabled={loginEnabled && (!licenseInfo || licenseInfo.availableSlots > 0)}
          position="bottom"
          withArrow
        >
          <Button
            leftSection={<LocalIcon icon="person-add" width="1rem" height="1rem" />}
            onClick={handleAddMembersClick}
            disabled={!loginEnabled || (licenseInfo ? licenseInfo.availableSlots === 0 : false)}
          >
            {t('workspace.people.addMembers')}
          </Button>
        </Tooltip>
      </Group>

      {/* Members Table */}
      <Table
        horizontalSpacing="md"
        verticalSpacing="sm"
        withRowBorders
        style={{
          '--table-border-color': 'var(--mantine-color-gray-3)',
        } as React.CSSProperties}
      >
        <Table.Thead>
          <Table.Tr style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
            <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm">
              {t('workspace.people.user')}
            </Table.Th>
            <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm" w={100}>
              {t('workspace.people.role')}
            </Table.Th>
            <Table.Th style={{ fontWeight: 600, color: 'var(--mantine-color-gray-7)' }} fz="sm">
              {t('workspace.people.team')}
            </Table.Th>
            <Table.Th w={50}></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filteredUsers.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed" py="xl">
                  {t('workspace.people.noMembersFound')}
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            filteredUsers.map((user) => (
              <Table.Tr
                key={user.id}
                style={isCurrentUser(user) ? { backgroundColor: 'rgba(34, 139, 230, 0.08)' } : undefined}
              >
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip
                      label={
                        !user.enabled
                          ? t('workspace.people.disabled', 'Disabled')
                          : user.isActive
                            ? t('workspace.people.activeSession', 'Active session')
                            : t('workspace.people.active', 'Active')
                      }
                      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
                    >
                      <Avatar
                        size={32}
                        color={user.enabled ? 'blue' : 'gray'}
                        styles={{
                          root: {
                            border: user.isActive ? '2px solid var(--mantine-color-green-6)' : 'none',
                            opacity: user.enabled ? 1 : 0.5,
                          }
                        }}
                      >
                        {user.username.charAt(0).toUpperCase()}
                      </Avatar>
                    </Tooltip>
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Tooltip label={user.username} disabled={user.username.length <= 20} zIndex={Z_INDEX_OVER_CONFIG_MODAL}>
                        <Text
                          size="sm"
                          fw={500}
                          maw={200}
                          style={{
                            lineHeight: 1.3,
                            opacity: user.enabled ? 1 : 0.6,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {user.username}
                        </Text>
                      </Tooltip>
                      {user.email && (
                        <Text size="xs" c="dimmed" truncate style={{ lineHeight: 1.3 }}>
                          {user.email}
                        </Text>
                      )}
                    </Box>
                  </Group>
                </Table.Td>
                <Table.Td w={100}>
                  <Badge
                    size="sm"
                    variant="light"
                    color={(user.rolesAsString || '').includes('ROLE_ADMIN') ? 'blue' : 'cyan'}
                  >
                    {(user.rolesAsString || '').includes('ROLE_ADMIN')
                      ? t('workspace.people.admin', 'Admin')
                      : t('workspace.people.member', 'Member')}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {user.team?.name ? (
                    <Tooltip label={user.team.name} disabled={user.team.name.length <= 20} zIndex={Z_INDEX_OVER_CONFIG_MODAL}>
                      <Text
                        size="sm"
                        maw={150}
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {user.team.name}
                      </Text>
                    </Tooltip>
                  ) : (
                    <Text size="sm">—</Text>
                  )}
                </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      {/* Info icon with tooltip */}
                      <Tooltip
                        label={
                          <div>
                            <Text size="xs" fw={500}>Authentication: {user.authenticationType || 'Unknown'}</Text>
                            <Text size="xs">
                              Last Activity: {user.lastRequest && new Date(user.lastRequest).getFullYear() >= 1980
                                ? new Date(user.lastRequest).toLocaleString()
                                :t('never', 'Never')}
                            </Text>
                          </div>
                        }
                        multiline
                        w={220}
                        position="left"
                        withArrow
                        zIndex={Z_INDEX_OVER_CONFIG_MODAL + 10}
                      >
                        <ActionIcon variant="subtle"size="sm">
                          <LocalIcon icon="info" width="1rem" height="1rem" />
                        </ActionIcon>
                      </Tooltip>

                      {/* Actions menu */}
                      {!isCurrentUser(user) && (
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle"  disabled={!loginEnabled}>
                            <LocalIcon icon="more-vert" width="1rem" height="1rem" />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown style={{ zIndex: Z_INDEX_OVER_CONFIG_MODAL }}>
                          {!isCurrentUser(user) && (
                            <Menu.Item
                              leftSection={<LocalIcon icon="edit" width="1rem" height="1rem" />}
                              onClick={() => openEditModal(user)}
                              disabled={!loginEnabled}
                            >
                              {t('workspace.people.editRole', 'Edit Role & Team')}
                            </Menu.Item>
                          )}
                          {!isCurrentUser(user) && (
                          <Menu.Item
                            leftSection={<LocalIcon icon="lock" width="1rem" height="1rem" />}
                            onClick={() => openChangePasswordModal(user)}
                            disabled={!loginEnabled}
                          >
                            {t('workspace.people.changePassword.action', 'Change password')}
                          </Menu.Item>
                          )}
                          {!isCurrentUser(user) && (
                            <Menu.Item
                              leftSection={user.enabled ? <LocalIcon icon="person-off" width="1rem" height="1rem" /> : <LocalIcon icon="person-check" width="1rem" height="1rem" />}
                              onClick={() => handleToggleEnabled(user)}
                              disabled={!loginEnabled}
                            >
                              {user.enabled ? t('workspace.people.disable') : t('workspace.people.enable')}
                            </Menu.Item>
                          )}
                          {!isCurrentUser(user) && user.mfaEnabled && (
                            <>
                              <Menu.Divider />
                              <Menu.Item
                                color="red"
                                leftSection={<LocalIcon icon="key" width="1rem" height="1rem" />}
                                onClick={async () => {
                                  try {
                                    await userManagementService.disableMfaByAdmin(user.username);
                                    alert({ alertType: 'success', title: t('workspace.people.mfa.adminDisableSuccess', 'MFA disabled successfully for user') });
                                  } catch (error: any) {
                                    console.error('[PeopleSection] Failed to disable MFA for user:', error);
                                    const errorMessage = error.response?.data?.message ||
                                                        error.response?.data?.error ||
                                                        error.message ||
                                                        t('workspace.people.mfa.adminDisableError', 'Failed to disable MFA for user');
                                    alert({ alertType: 'error', title: errorMessage });
                                  }
                                }}
                                disabled={!loginEnabled}
                              >
                                {t('workspace.people.mfa.disableByAdmin', 'Disable MFA')}
                              </Menu.Item>
                            </>
                          )}
                          {!isCurrentUser(user) && (
                            <>
                              <Menu.Divider />
                              <Menu.Item color="red" leftSection={<LocalIcon icon="delete" width="1rem" height="1rem" />} onClick={() => handleDeleteUser(user)} disabled={!loginEnabled}>
                                {t('workspace.people.deleteUser')}
                              </Menu.Item>
                            </>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
        </Table.Tbody>
      </Table>

      {/* Invite Members Modal (reusable) */}
      <InviteMembersModal
        opened={inviteModalOpened}
        onClose={() => setInviteModalOpened(false)}
        onSuccess={fetchData}
      />

      <ChangeUserPasswordModal
        opened={changePasswordModalOpened}
        onClose={closeChangePasswordModal}
        user={passwordUser}
        onSuccess={fetchData}
        mailEnabled={mailEnabled}
      />

      {/* Edit User Modal */}
      <Modal
        opened={editUserModalOpened}
        onClose={closeEditModal}
        size="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        centered
        padding="xl"
        withCloseButton={false}
      >
        <Box pos="relative">
          <CloseButton
            onClick={closeEditModal}
            size="lg"
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              zIndex: 1
            }}
          />
          <Stack gap="lg" pt="md">
            {/* Header with Icon */}
            <Stack gap="md" align="center">
              <LocalIcon icon="edit" width="3rem" height="3rem" style={{ color: 'var(--mantine-color-gray-6)' }} />
              <Text size="xl" fw={600} ta="center">
                {t('workspace.people.editMember.title')}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {t('workspace.people.editMember.editing')} <strong>{selectedUser?.username}</strong>
              </Text>
            </Stack>
            <Select
              label={t('workspace.people.editMember.role')}
              data={roleOptions}
              value={editForm.role}
              onChange={(value) => setEditForm({ ...editForm, role: value || 'ROLE_USER' })}
              renderOption={renderRoleOption}
              comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
            />
            <Select
              label={t('workspace.people.editMember.team')}
              placeholder={t('workspace.people.editMember.teamPlaceholder')}
              data={teamOptions}
              value={editForm.teamId?.toString()}
              onChange={(value) => setEditForm({ ...editForm, teamId: value ? parseInt(value) : undefined })}
              clearable
              comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
            />
            <Button onClick={handleUpdateUserRole} loading={processing} fullWidth size="md" mt="md">
              {t('workspace.people.editMember.submit')}
            </Button>
          </Stack>
        </Box>
      </Modal>
    </Stack>
  );
}
