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
  Paper,
  Checkbox,
  Textarea,
  SegmentedControl,
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

export default function PeopleSection() {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteModalOpened, setInviteModalOpened] = useState(false);
  const [editUserModalOpened, setEditUserModalOpened] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [processing, setProcessing] = useState(false);
  const [inviteMode, setInviteMode] = useState<'email' | 'direct' | 'link'>('direct');
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  // License information
  const [licenseInfo, setLicenseInfo] = useState<{
    maxAllowedUsers: number;
    availableSlots: number;
    grandfatheredUserCount: number;
    licenseMaxUsers: number;
    premiumEnabled: boolean;
    totalUsers: number;
  } | null>(null);

  // Form state for direct invite
  const [inviteForm, setInviteForm] = useState({
    username: '',
    password: '',
    role: 'ROLE_USER',
    teamId: undefined as number | undefined,
    forceChange: false,
  });

  // Form state for email invite
  const [emailInviteForm, setEmailInviteForm] = useState({
    emails: '',
    role: 'ROLE_USER',
    teamId: undefined as number | undefined,
  });

  // Form state for invite link
  const [inviteLinkForm, setInviteLinkForm] = useState({
    email: '',
    role: 'ROLE_USER',
    teamId: undefined as number | undefined,
    expiryHours: 72,
    sendEmail: false,
  });

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
      const [adminData, teamsData] = await Promise.all([
        userManagementService.getUsers(),
        teamService.getTeams(),
      ]);

      // Enrich users with session data
      const enrichedUsers = adminData.users.map(user => ({
        ...user,
        isActive: adminData.userSessions[user.username] || false,
        lastRequest: adminData.userLastRequest[user.username] || undefined,
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
    } catch (error) {
      console.error('Failed to fetch people data:', error);
      alert({ alertType: 'error', title: 'Failed to load people data' });
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async () => {
    if (!inviteForm.username || !inviteForm.password) {
      alert({ alertType: 'error', title: t('workspace.people.addMember.usernameRequired') });
      return;
    }

    try {
      setProcessing(true);
      await userManagementService.createUser({
        username: inviteForm.username,
        password: inviteForm.password,
        role: inviteForm.role,
        teamId: inviteForm.teamId,
        authType: 'password',
        forceChange: inviteForm.forceChange,
      });
      alert({ alertType: 'success', title: t('workspace.people.addMember.success') });
      setInviteModalOpened(false);
      setInviteForm({
        username: '',
        password: '',
        role: 'ROLE_USER',
        teamId: undefined,
        forceChange: false,
      });
      fetchData();
    } catch (error: any) {
      console.error('Failed to create user:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.people.addMember.error');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const handleEmailInvite = async () => {
    if (!emailInviteForm.emails.trim()) {
      alert({ alertType: 'error', title: t('workspace.people.emailInvite.emailsRequired', 'At least one email address is required') });
      return;
    }

    try {
      setProcessing(true);
      const response = await userManagementService.inviteUsers({
        emails: emailInviteForm.emails,
        role: emailInviteForm.role,
        teamId: emailInviteForm.teamId,
      });

      if (response.successCount > 0) {
        alert({
          alertType: 'success',
          title: t('workspace.people.emailInvite.success', `${response.successCount} user(s) invited successfully`)
        });

        if (response.failureCount > 0 && response.errors) {
          alert({
            alertType: 'warning',
            title: t('workspace.people.emailInvite.partialSuccess', 'Some invites failed'),
            body: response.errors
          });
        }

        setInviteModalOpened(false);
        setEmailInviteForm({
          emails: '',
          role: 'ROLE_USER',
          teamId: undefined,
        });
        fetchData();
      } else {
        alert({
          alertType: 'error',
          title: t('workspace.people.emailInvite.allFailed', 'Failed to invite users'),
          body: response.errors || response.error
        });
      }
    } catch (error: any) {
      console.error('Failed to invite users:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.people.emailInvite.error', 'Failed to send invites');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateInviteLink = async () => {
    try {
      setProcessing(true);
      const response = await userManagementService.generateInviteLink({
        email: inviteLinkForm.email,
        role: inviteLinkForm.role,
        teamId: inviteLinkForm.teamId,
        expiryHours: inviteLinkForm.expiryHours,
        sendEmail: inviteLinkForm.sendEmail,
      });

      // Construct full frontend URL
      const frontendUrl = `${window.location.origin}/invite/${response.token}`;
      setGeneratedInviteLink(frontendUrl);

      if (response.emailSent) {
        alert({
          alertType: 'success',
          title: t('workspace.people.inviteLink.successWithEmail', 'Invite link generated and email sent!')
        });
      } else if (inviteLinkForm.sendEmail && response.emailError) {
        // Email was requested but failed
        alert({
          alertType: 'warning',
          title: t('workspace.people.inviteLink.emailFailed', 'Invite link generated, but email failed'),
          body: t('workspace.people.inviteLink.emailFailedDetails', 'Error: {0}. Please share the invite link manually.').replace('{0}', response.emailError)
        });
      } else {
        alert({
          alertType: 'success',
          title: t('workspace.people.inviteLink.success', 'Invite link generated successfully!')
        });
      }
    } catch (error: any) {
      console.error('Failed to generate invite link:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.people.inviteLink.error', 'Failed to generate invite link');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
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
      console.error('Failed to update user:', error);
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
      console.error('Failed to toggle user status:', error);
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
      console.error('Failed to delete user:', error);
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

  const closeEditModal = () => {
    setEditUserModalOpened(false);
    setSelectedUser(null);
    setEditForm({
      role: 'ROLE_USER',
      teamId: undefined,
    });
  };

  const closeInviteModal = () => {
    setInviteModalOpened(false);
    setGeneratedInviteLink(null);
    setInviteLinkForm({
      email: '',
      role: 'ROLE_USER',
      teamId: undefined,
      expiryHours: 72,
      sendEmail: false,
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
        <Group gap="md" c="dimmed" style={{ fontSize: '0.875rem' }}>
          <Text size="sm" span>
            <Text component="span" fw={600} c="inherit">{licenseInfo.totalUsers}</Text>
            <Text component="span" c="dimmed"> / </Text>
            <Text component="span" fw={600} c="inherit">{licenseInfo.maxAllowedUsers}</Text>
            <Text component="span" c="dimmed" ml={4}>{t('workspace.people.license.users', 'users')}</Text>
          </Text>

          {licenseInfo.availableSlots === 0 && (
            <Badge color="red" variant="light" size="sm">
              {t('workspace.people.license.noSlotsAvailable', 'No slots available')}
            </Badge>
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
          label={t('workspace.people.license.noSlotsAvailable', 'No user slots available')}
          disabled={!licenseInfo || licenseInfo.availableSlots > 0}
          position="bottom"
          withArrow
        >
          <Button
            leftSection={<LocalIcon icon="person-add" width="1rem" height="1rem" />}
            onClick={() => setInviteModalOpened(true)}
            disabled={licenseInfo ? licenseInfo.availableSlots === 0 : false}
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
              <Table.Tr key={user.id}>
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
                    color={(user.rolesAsString || '').includes('ROLE_ADMIN') ? 'blue' : 'gray'}
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
                        c="dimmed"
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
                    <Text size="sm" c="dimmed">—</Text>
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
                              Last Activity: {user.lastRequest
                                ? new Date(user.lastRequest).toLocaleString()
                                : 'Never'}
                            </Text>
                          </div>
                        }
                        multiline
                        w={220}
                        position="left"
                        withArrow
                        zIndex={Z_INDEX_OVER_CONFIG_MODAL + 10}
                      >
                        <ActionIcon variant="subtle" color="gray" size="sm">
                          <LocalIcon icon="info" width="1rem" height="1rem" />
                        </ActionIcon>
                      </Tooltip>

                      {/* Actions menu */}
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <LocalIcon icon="more-vert" width="1rem" height="1rem" />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown style={{ zIndex: Z_INDEX_OVER_CONFIG_MODAL }}>
                          <Menu.Item onClick={() => openEditModal(user)}>{t('workspace.people.editRole')}</Menu.Item>
                          <Menu.Item
                            leftSection={user.enabled ? <LocalIcon icon="person-off" width="1rem" height="1rem" /> : <LocalIcon icon="person-check" width="1rem" height="1rem" />}
                            onClick={() => handleToggleEnabled(user)}
                          >
                            {user.enabled ? t('workspace.people.disable') : t('workspace.people.enable')}
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item color="red" leftSection={<LocalIcon icon="delete" width="1rem" height="1rem" />} onClick={() => handleDeleteUser(user)}>
                            {t('workspace.people.deleteUser')}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
        </Table.Tbody>
      </Table>

      {/* Add Member Modal */}
      <Modal
        opened={inviteModalOpened}
        onClose={closeInviteModal}
        size="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        centered
        padding="xl"
        withCloseButton={false}
      >
        <Box pos="relative">
          <CloseButton
            onClick={closeInviteModal}
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
              <LocalIcon icon="person-add" width="3rem" height="3rem" style={{ color: 'var(--mantine-color-gray-6)' }} />
              <Text size="xl" fw={600} ta="center">
                {t('workspace.people.inviteMembers', 'Invite Members')}
              </Text>
              {inviteMode === 'email' && (
                <Text size="sm" c="dimmed" ta="center" px="md">
                  {t('workspace.people.inviteMembers.subtitle', 'Type or paste in emails below, separated by commas. Your workspace will be billed by members.')}
                </Text>
              )}
            </Stack>

            {/* License Warning/Info */}
            {licenseInfo && (
              <Paper withBorder p="sm" bg={licenseInfo.availableSlots === 0 ? 'var(--mantine-color-red-light)' : 'var(--mantine-color-blue-light)'}>
                <Stack gap="xs">
                  <Group gap="xs">
                    <LocalIcon icon={licenseInfo.availableSlots > 0 ? 'info' : 'warning'} width="1rem" height="1rem" />
                    <Text size="sm" fw={500}>
                      {licenseInfo.availableSlots > 0
                        ? t('workspace.people.license.slotsAvailable', {
                            count: licenseInfo.availableSlots,
                            defaultValue: `${licenseInfo.availableSlots} user slot(s) available`
                          })
                        : t('workspace.people.license.noSlotsAvailable', 'No user slots available')}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {t('workspace.people.license.currentUsage', {
                      current: licenseInfo.totalUsers,
                      max: licenseInfo.maxAllowedUsers,
                      defaultValue: `Currently using ${licenseInfo.totalUsers} of ${licenseInfo.maxAllowedUsers} user licenses`
                    })}
                  </Text>
                </Stack>
              </Paper>
            )}

            {/* Mode Toggle */}
            <Tooltip
              label={t('workspace.people.inviteMode.emailDisabled', 'Email invites require SMTP configuration and mail.enableInvites=true in settings')}
              disabled={!!config?.enableEmailInvites}
              position="bottom"
              withArrow
              zIndex={Z_INDEX_OVER_CONFIG_MODAL + 1}
            >
              <div>
                <SegmentedControl
                  value={inviteMode}
                  onChange={(value) => {
                    setInviteMode(value as 'email' | 'direct' | 'link');
                    setGeneratedInviteLink(null);
                  }}
                  data={[
                    {
                      label: t('workspace.people.inviteMode.username', 'Username'),
                      value: 'direct',
                    },
                    {
                      label: t('workspace.people.inviteMode.link', 'Link'),
                      value: 'link',
                    },
                    {
                      label: t('workspace.people.inviteMode.email', 'Email'),
                      value: 'email',
                      disabled: !config?.enableEmailInvites,
                    },
                  ]}
                  fullWidth
                />
              </div>
            </Tooltip>

            {/* Link Mode */}
            {inviteMode === 'link' && (
              <>
                <TextInput
                  label={t('workspace.people.inviteLink.email', 'Email (optional)')}
                  placeholder={t('workspace.people.inviteLink.emailPlaceholder', 'user@example.com')}
                  value={inviteLinkForm.email}
                  onChange={(e) => setInviteLinkForm({ ...inviteLinkForm, email: e.currentTarget.value })}
                  description={t('workspace.people.inviteLink.emailDescription', 'If provided, the link will be tied to this email address')}
                />
                <Select
                  label={t('workspace.people.addMember.role')}
                  data={roleOptions}
                  value={inviteLinkForm.role}
                  onChange={(value) => setInviteLinkForm({ ...inviteLinkForm, role: value || 'ROLE_USER' })}
                  renderOption={renderRoleOption}
                  comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
                />
                <Select
                  label={t('workspace.people.addMember.team')}
                  placeholder={t('workspace.people.addMember.teamPlaceholder')}
                  data={teamOptions}
                  value={inviteLinkForm.teamId?.toString()}
                  onChange={(value) => setInviteLinkForm({ ...inviteLinkForm, teamId: value ? parseInt(value) : undefined })}
                  clearable
                  comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
                />
                <TextInput
                  label={t('workspace.people.inviteLink.expiryHours', 'Link expires in (hours)')}
                  type="number"
                  value={inviteLinkForm.expiryHours}
                  onChange={(e) => setInviteLinkForm({ ...inviteLinkForm, expiryHours: parseInt(e.currentTarget.value) || 72 })}
                  min={1}
                  max={720}
                />
                {inviteLinkForm.email && (
                  <Checkbox
                    label={t('workspace.people.inviteLink.sendEmail', 'Send invite link via email')}
                    description={t('workspace.people.inviteLink.sendEmailDescription', 'Also send the link to the provided email address')}
                    checked={inviteLinkForm.sendEmail}
                    onChange={(e) => setInviteLinkForm({ ...inviteLinkForm, sendEmail: e.currentTarget.checked })}
                  />
                )}

                {/* Display generated link */}
                {generatedInviteLink && (
                  <Paper withBorder p="md" bg="var(--mantine-color-green-light)">
                    <Stack gap="sm">
                      <Text size="sm" fw={500}>{t('workspace.people.inviteLink.generated', 'Invite Link Generated')}</Text>
                      <Group gap="xs">
                        <TextInput
                          value={generatedInviteLink}
                          readOnly
                          style={{ flex: 1 }}
                        />
                        <Button
                          variant="light"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(generatedInviteLink);
                              alert({ alertType: 'success', title: t('workspace.people.inviteLink.copied', 'Link copied to clipboard!') });
                            } catch {
                              // Fallback for browsers without clipboard API
                              const textArea = document.createElement('textarea');
                              textArea.value = generatedInviteLink;
                              textArea.style.position = 'fixed';
                              textArea.style.opacity = '0';
                              document.body.appendChild(textArea);
                              textArea.select();
                              document.execCommand('copy');
                              document.body.removeChild(textArea);
                              alert({ alertType: 'success', title: t('workspace.people.inviteLink.copied', 'Link copied to clipboard!') });
                            }
                          }}
                        >
                          <LocalIcon icon="content-copy" width="1rem" height="1rem" />
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                )}
              </>
            )}

            {/* Email Mode */}
            {inviteMode === 'email' && config?.enableEmailInvites && (
              <>
                <Textarea
                  label={t('workspace.people.emailInvite.emails', 'Email Addresses')}
                  placeholder={t('workspace.people.emailInvite.emailsPlaceholder', 'user1@example.com, user2@example.com')}
                  value={emailInviteForm.emails}
                  onChange={(e) => setEmailInviteForm({ ...emailInviteForm, emails: e.currentTarget.value })}
                  minRows={3}
                  required
                />
                <Select
                  label={t('workspace.people.addMember.role')}
                  data={roleOptions}
                  value={emailInviteForm.role}
                  onChange={(value) => setEmailInviteForm({ ...emailInviteForm, role: value || 'ROLE_USER' })}
                  renderOption={renderRoleOption}
                  comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
                />
                <Select
                  label={t('workspace.people.addMember.team')}
                  placeholder={t('workspace.people.addMember.teamPlaceholder')}
                  data={teamOptions}
                  value={emailInviteForm.teamId?.toString()}
                  onChange={(value) => setEmailInviteForm({ ...emailInviteForm, teamId: value ? parseInt(value) : undefined })}
                  clearable
                  comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
                />
              </>
            )}

            {/* Direct/Username Mode */}
            {inviteMode === 'direct' && (
              <>
                <TextInput
                  label={t('workspace.people.addMember.username')}
                  placeholder={t('workspace.people.addMember.usernamePlaceholder')}
                  value={inviteForm.username}
                  onChange={(e) => setInviteForm({ ...inviteForm, username: e.currentTarget.value })}
                  required
                />
                <TextInput
                  label={t('workspace.people.addMember.password')}
                  type="password"
                  placeholder={t('workspace.people.addMember.passwordPlaceholder')}
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm({ ...inviteForm, password: e.currentTarget.value })}
                  required
                />
                <Select
                  label={t('workspace.people.addMember.role')}
                  data={roleOptions}
                  value={inviteForm.role}
                  onChange={(value) => setInviteForm({ ...inviteForm, role: value || 'ROLE_USER' })}
                  renderOption={renderRoleOption}
                  comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
                />
                <Select
                  label={t('workspace.people.addMember.team')}
                  placeholder={t('workspace.people.addMember.teamPlaceholder')}
                  data={teamOptions}
                  value={inviteForm.teamId?.toString()}
                  onChange={(value) => setInviteForm({ ...inviteForm, teamId: value ? parseInt(value) : undefined })}
                  clearable
                  comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
                />
                <Checkbox
                  label={t('workspace.people.addMember.forcePasswordChange', 'Force password change on first login')}
                  checked={inviteForm.forceChange}
                  onChange={(e) => setInviteForm({ ...inviteForm, forceChange: e.currentTarget.checked })}
                />
              </>
            )}

            {/* Action Button */}
            <Button
              onClick={inviteMode === 'email' ? handleEmailInvite : inviteMode === 'link' ? handleGenerateInviteLink : handleInviteUser}
              loading={processing}
              fullWidth
              size="md"
              mt="md"
            >
              {inviteMode === 'email'
                ? t('workspace.people.emailInvite.submit', 'Send Invites')
                : inviteMode === 'link'
                  ? t('workspace.people.inviteLink.submit', 'Generate Link')
                  : t('workspace.people.addMember.submit')}
            </Button>
          </Stack>
        </Box>
      </Modal>

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
