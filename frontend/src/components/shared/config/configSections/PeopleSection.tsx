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
  Switch,
  Textarea,
  SegmentedControl,
  Tooltip,
  CloseButton,
} from '@mantine/core';
import LocalIcon from '../../LocalIcon';
import { alert } from '../../../toast';
import { userManagementService, User } from '../../../../services/userManagementService';
import { teamService, Team } from '../../../../services/teamService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '../../../../styles/zIndex';
import { useAppConfig } from '../../../../hooks/useAppConfig';

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

  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

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
    // Email is optional - if provided, it will be pre-filled for the user
    // If not provided, user will be asked to enter their email during signup

    try {
      setProcessing(true);
      const response = await userManagementService.generateInviteLink({
        email: inviteLinkForm.email.trim() || undefined,
        role: inviteLinkForm.role,
        teamId: inviteLinkForm.teamId,
        expiryHours: inviteLinkForm.expiryHours,
        sendEmail: inviteLinkForm.sendEmail,
      });

      // Construct invite URL using current frontend origin (not backend URL)
      const frontendUrl = `${window.location.origin}/invite?token=${response.token}`;
      setGeneratedInviteLink(frontendUrl);

      if (response.emailSent) {
        alert({ alertType: 'success', title: t('workspace.people.inviteLink.successWithEmail', 'Invite link generated and sent via email') });
      } else {
        alert({ alertType: 'success', title: t('workspace.people.inviteLink.success', 'Invite link generated successfully') });
      }

      if (response.emailError) {
        alert({ alertType: 'warning', title: t('workspace.people.inviteLink.emailFailed', 'Email failed to send'), body: response.emailError });
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
      <div style={{ flex: 1 }}>
        <Text size="sm" fw={500}>{option.label}</Text>
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>
          {option.description}
        </Text>
      </div>
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

      {/* Header Actions */}
      <Group justify="space-between">
        <TextInput
          placeholder={t('workspace.people.searchMembers')}
          leftSection={<LocalIcon icon="search" width="1rem" height="1rem" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          style={{ maxWidth: 300 }}
        />
        <Button leftSection={<LocalIcon icon="person-add" width="1rem" height="1rem" />} onClick={() => setInviteModalOpened(true)}>
          {t('workspace.people.addMembers')}
        </Button>
      </Group>

      {/* Members Table */}
      <Paper withBorder p="md">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('workspace.people.user')}</Table.Th>
              <Table.Th>{t('workspace.people.role')}</Table.Th>
              <Table.Th>{t('workspace.people.team')}</Table.Th>
              <Table.Th>{t('workspace.people.status')}</Table.Th>
              <Table.Th style={{ width: 50 }}></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredUsers.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text ta="center" c="dimmed" py="xl">
                    {t('workspace.people.noMembersFound')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              filteredUsers.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {user.isActive && (
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--mantine-color-green-6)',
                            flexShrink: 0,
                          }}
                          title={t('workspace.people.activeSession', 'Active session')}
                        />
                      )}
                      <div>
                        <Text size="sm" fw={500}>
                          {user.username}
                        </Text>
                        {user.email && (
                          <Text size="xs" c="dimmed">
                            {user.email}
                          </Text>
                        )}
                      </div>
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={(user.rolesAsString || '').includes('ROLE_ADMIN') ? 'blue' : 'gray'}
                      variant="light"
                    >
                      {(user.rolesAsString || '').includes('ROLE_ADMIN') ? t('workspace.people.admin') : t('workspace.people.member')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{user.team?.name || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={user.enabled ? 'green' : 'red'} variant="light">
                      {user.enabled ? t('workspace.people.active') : t('workspace.people.disabled')}
                    </Badge>
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
      </Paper>

      {/* Add Member Modal */}
      <Modal
        opened={inviteModalOpened}
        onClose={() => {
          setInviteModalOpened(false);
          setGeneratedInviteLink(null);
          setInviteLinkForm({
            email: '',
            role: 'ROLE_USER',
            teamId: undefined,
            expiryHours: 72,
            sendEmail: false,
          });
        }}
        size="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        centered
        padding="xl"
        withCloseButton={false}
      >
        <div style={{ position: 'relative' }}>
          <CloseButton
            onClick={() => {
              setInviteModalOpened(false);
              setGeneratedInviteLink(null);
              setInviteLinkForm({
                email: '',
                role: 'ROLE_USER',
                teamId: undefined,
                expiryHours: 72,
                sendEmail: false,
              });
            }}
            size="lg"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
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

            {/* Mode Toggle */}
            <SegmentedControl
              value={inviteMode}
              onChange={(value) => setInviteMode(value as 'email' | 'direct' | 'link')}
              data={[
                {
                  label: t('workspace.people.directInvite.tab', 'Direct Create'),
                  value: 'direct',
                },
                {
                  label: (
                    <Tooltip
                      label={t('workspace.people.inviteMode.emailDisabled', 'Email invites require SMTP configuration and mail.enableInvites=true')}
                      disabled={!!config?.enableEmailInvites}
                      position="bottom"
                      withArrow
                      zIndex={Z_INDEX_OVER_CONFIG_MODAL + 1}
                    >
                      <span>{t('workspace.people.emailInvite.tab', 'Email Invite')}</span>
                    </Tooltip>
                  ),
                  value: 'email',
                  disabled: !config?.enableEmailInvites,
                },
                {
                  label: t('workspace.people.inviteLinkTab.tab', 'Invite Link'),
                  value: 'link',
                },
              ]}
              fullWidth
            />

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
                <Switch
                  label={t('workspace.people.addMember.forcePasswordChange', 'Force password change on first login')}
                  checked={inviteForm.forceChange}
                  onChange={(e) => setInviteForm({ ...inviteForm, forceChange: e.currentTarget.checked })}
                />
              </>
            )}

            {/* Invite Link Mode */}
            {inviteMode === 'link' && (
              <>
                <Text size="sm" c="dimmed">
                  {t('workspace.people.inviteLink.description', 'Generate a secure link that allows the user to set their own password')}
                </Text>

                <TextInput
                  label={t('workspace.people.inviteLink.email', 'Email Address')}
                  placeholder="user@example.com"
                  description={t('workspace.people.inviteLink.emailOptional', 'Optional - leave blank for a general invite link')}
                  value={inviteLinkForm.email}
                  onChange={(e) => {
                    const newEmail = e.currentTarget.value;
                    const hasEmail = newEmail.trim().length > 0;
                    const smtpEnabled = config?.enableEmailInvites || false;

                    setInviteLinkForm({
                      ...inviteLinkForm,
                      email: newEmail,
                      // Auto-enable sendEmail when email is provided and SMTP is configured
                      // Disable when email is cleared
                      sendEmail: hasEmail && smtpEnabled ? true : false,
                    });
                  }}
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
                  type="number"
                  label={t('workspace.people.inviteLink.expiryHours', 'Expiry Hours')}
                  description={t('workspace.people.inviteLink.expiryDescription', 'How many hours until the link expires')}
                  value={inviteLinkForm.expiryHours}
                  onChange={(e) => setInviteLinkForm({ ...inviteLinkForm, expiryHours: parseInt(e.currentTarget.value) || 72 })}
                  min={1}
                  max={720}
                />

                {inviteLinkForm.email.trim() && (
                  <Tooltip
                    label={t('workspace.people.inviteLink.smtpRequired', 'SMTP must be configured to send emails')}
                    disabled={!!config?.enableEmailInvites}
                    position="top-start"
                    withArrow
                    zIndex={Z_INDEX_OVER_CONFIG_MODAL + 1}
                  >
                    <div>
                      <Switch
                        label={t('workspace.people.inviteLink.sendEmail', 'Send invite link via email')}
                        description={!config?.enableEmailInvites ? t('workspace.people.inviteLink.smtpRequired', 'SMTP must be configured to send emails') : undefined}
                        checked={inviteLinkForm.sendEmail}
                        disabled={!config?.enableEmailInvites}
                        onChange={(e) => setInviteLinkForm({ ...inviteLinkForm, sendEmail: e.currentTarget.checked })}
                      />
                    </div>
                  </Tooltip>
                )}

                {generatedInviteLink && (
                  <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
                    <Stack gap="xs">
                      <Text size="sm" fw={600}>
                        {t('workspace.people.inviteLink.generated', 'Invite Link Generated')}
                      </Text>
                      <Group gap="xs">
                        <TextInput
                          value={generatedInviteLink}
                          readOnly
                          style={{ flex: 1 }}
                        />
                        <ActionIcon
                          variant="subtle"
                          onClick={async () => {
                            try {
                              // Try modern clipboard API first (requires HTTPS or localhost)
                              if (navigator.clipboard && navigator.clipboard.writeText) {
                                await navigator.clipboard.writeText(generatedInviteLink);
                                alert({ alertType: 'success', title: t('workspace.people.inviteLink.copied', 'Link copied to clipboard') });
                              } else {
                                // Fallback for HTTP (non-secure contexts)
                                const textArea = document.createElement('textarea');
                                textArea.value = generatedInviteLink;
                                textArea.style.position = 'fixed';
                                textArea.style.left = '-9999px';
                                document.body.appendChild(textArea);
                                textArea.select();
                                const successful = document.execCommand('copy');
                                document.body.removeChild(textArea);

                                if (successful) {
                                  alert({ alertType: 'success', title: t('workspace.people.inviteLink.copied', 'Link copied to clipboard') });
                                } else {
                                  throw new Error('Copy command failed');
                                }
                              }
                            } catch (err) {
                              console.error('Failed to copy:', err);
                              alert({ alertType: 'error', title: 'Failed to copy to clipboard' });
                            }
                          }}
                        >
                          <LocalIcon icon="content-copy" />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  </Paper>
                )}
              </>
            )}

            {/* Action Button */}
            <Button
              onClick={inviteMode === 'email' ? handleEmailInvite : inviteMode === 'link' ? handleGenerateInviteLink : handleInviteUser}
              loading={processing}
              fullWidth
              size="md"
              mt="md"
              leftSection={inviteMode === 'link' ? <LocalIcon icon="link" /> : undefined}
            >
              {inviteMode === 'email'
                ? t('workspace.people.emailInvite.submit', 'Send Invites')
                : inviteMode === 'link'
                ? t('workspace.people.inviteLink.generate', 'Generate Link')
                : t('workspace.people.addMember.submit')}
            </Button>
          </Stack>
        </div>
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
        <div style={{ position: 'relative' }}>
          <CloseButton
            onClick={closeEditModal}
            size="lg"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
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
        </div>
      </Modal>
    </Stack>
  );
}
