import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Stack,
  Text,
  Button,
  Table,
  ActionIcon,
  Badge,
  Loader,
  Group,
  Modal,
  Select,
  Paper,
  CloseButton,
  Tooltip,
  Menu,
} from '@mantine/core';
import LocalIcon from '../../LocalIcon';
import { alert } from '../../../toast';
import { teamService, Team } from '../../../../services/teamService';
import { User } from '../../../../services/userManagementService';
import { userManagementService } from '../../../../services/userManagementService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '../../../../styles/zIndex';

interface TeamDetailsSectionProps {
  teamId: number;
  onBack: () => void;
}

export default function TeamDetailsSection({ teamId, onBack }: TeamDetailsSectionProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Team | null>(null);
  const [teamUsers, setTeamUsers] = useState<User[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [userLastRequest, setUserLastRequest] = useState<Record<string, number>>({});
  const [addMemberModalOpened, setAddMemberModalOpened] = useState(false);
  const [changeTeamModalOpened, setChangeTeamModalOpened] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchTeamDetails();
    fetchAllTeams();
  }, [teamId]);

  const fetchTeamDetails = async () => {
    try {
      setLoading(true);
      const data = await teamService.getTeamDetails(teamId);
      console.log('[TeamDetailsSection] Raw data:', data);
      setTeam(data.team);
      setTeamUsers(Array.isArray(data.teamUsers) ? data.teamUsers : []);
      setAvailableUsers(Array.isArray(data.availableUsers) ? data.availableUsers : []);
      setUserLastRequest(data.userLastRequest || {});
    } catch (error) {
      console.error('Failed to fetch team details:', error);
      alert({ alertType: 'error', title: 'Failed to load team details' });
      onBack();
    } finally {
      setLoading(false);
    }
  };

  const fetchAllTeams = async () => {
    try {
      const teams = await teamService.getTeams();
      setAllTeams(teams);
    } catch (error) {
      console.error('Failed to fetch teams:', error);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) {
      alert({ alertType: 'error', title: t('workspace.teams.addMemberToTeam.selectUserRequired', 'Please select a user') });
      return;
    }

    try {
      setProcessing(true);
      await teamService.addUserToTeam(teamId, parseInt(selectedUserId));
      alert({ alertType: 'success', title: t('workspace.teams.addMemberToTeam.success', 'User added to team successfully') });
      setAddMemberModalOpened(false);
      setSelectedUserId('');
      fetchTeamDetails();
    } catch (error: any) {
      console.error('Failed to add member:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.teams.addMemberToTeam.error', 'Failed to add user to team');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveMember = async (user: User) => {
    if (!window.confirm(t('workspace.teams.confirmRemove', `Remove ${user.username} from this team?`))) {
      return;
    }

    try {
      setProcessing(true);
      // Find the Default team ID
      const defaultTeam = allTeams.find(t => t.name === 'Default');

      if (!defaultTeam) {
        throw new Error('Default team not found');
      }

      // Move user to Default team by updating their role with the Default team ID
      await teamService.moveUserToTeam(user.username, user.rolesAsString || 'ROLE_USER', defaultTeam.id);
      alert({ alertType: 'success', title: t('workspace.teams.removeMemberSuccess', 'User removed from team') });
      fetchTeamDetails();
    } catch (error: any) {
      console.error('Failed to remove member:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.teams.removeMemberError', 'Failed to remove user from team');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmMessage = t('workspace.people.confirmDelete', 'Are you sure you want to delete this user? This action cannot be undone.');
    if (!window.confirm(`${confirmMessage}\n\nUser: ${user.username}`)) {
      return;
    }

    try {
      setProcessing(true);
      await userManagementService.deleteUser(user.username);
      alert({ alertType: 'success', title: t('workspace.people.deleteUserSuccess', 'User deleted successfully') });
      fetchTeamDetails();
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.people.deleteUserError', 'Failed to delete user');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const openChangeTeamModal = (user: User) => {
    setSelectedUser(user);
    setSelectedTeamId(user.team?.id?.toString() || '');
    setChangeTeamModalOpened(true);
  };

  const handleChangeTeam = async () => {
    if (!selectedUser || !selectedTeamId) {
      alert({ alertType: 'error', title: t('workspace.teams.changeTeam.selectTeamRequired', 'Please select a team') });
      return;
    }

    try {
      setProcessing(true);
      await teamService.moveUserToTeam(selectedUser.username, selectedUser.rolesAsString || 'ROLE_USER', parseInt(selectedTeamId));
      alert({ alertType: 'success', title: t('workspace.teams.changeTeam.success', 'Team changed successfully') });
      setChangeTeamModalOpened(false);
      setSelectedUser(null);
      setSelectedTeamId('');
      fetchTeamDetails();
    } catch (error: any) {
      console.error('Failed to change team:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.teams.changeTeam.error', 'Failed to change team');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          {t('workspace.teams.loadingDetails', 'Loading team details...')}
        </Text>
      </Stack>
    );
  }

  if (!team) {
    return (
      <Stack align="center" py="xl">
        <Text size="sm" c="red">
          {t('workspace.teams.teamNotFound', 'Team not found')}
        </Text>
        <Button variant="light" onClick={onBack}>
          {t('workspace.teams.backToTeams', 'Back to Teams')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {/* Header with back button */}
      <Group>
        <ActionIcon variant="subtle" onClick={onBack}>
          <LocalIcon icon="arrow-back" width="1.2rem" height="1.2rem" />
        </ActionIcon>
        <div style={{ flex: 1 }}>
          <Text fw={600} size="lg">
            {team.name}
          </Text>
          <Text size="sm" c="dimmed">
            {t('workspace.teams.memberCount', { count: teamUsers.length })} {teamUsers.length === 1 ? 'member' : 'members'}
          </Text>
        </div>
      </Group>

      {/* Add Member Button */}
      <Group justify="flex-end">
        <Button
          leftSection={<LocalIcon icon="person-add" width="1rem" height="1rem" />}
          onClick={() => setAddMemberModalOpened(true)}
          disabled={team.name === 'Internal'}
        >
          {t('workspace.teams.addMember')}
        </Button>
      </Group>

      {/* Members Table */}
      <Paper withBorder p="md">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('workspace.people.user')}</Table.Th>
              <Table.Th>{t('workspace.people.role')}</Table.Th>
              <Table.Th>{t('workspace.people.status')}</Table.Th>
              <Table.Th style={{ width: 50 }}></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {teamUsers.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text ta="center" c="dimmed" py="xl">
                    {t('workspace.teams.noMembers', 'No members in this team')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              teamUsers.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
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
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={(user.rolesAsString || '').includes('ROLE_ADMIN') ? 'blue' : 'gray'}
                      variant="light"
                    >
                      {(user.rolesAsString || '').includes('ROLE_ADMIN')
                        ? t('workspace.people.admin')
                        : t('workspace.people.member')}
                    </Badge>
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
                            <Text size="xs" fw={500}>
                              Authentication: {user.authenticationType || 'Unknown'}
                            </Text>
                            <Text size="xs">
                              Last Activity:{' '}
                              {userLastRequest[user.username]
                                ? new Date(userLastRequest[user.username]).toLocaleString()
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
                          <Menu.Item
                            leftSection={<LocalIcon icon="swap-horiz" width="1rem" height="1rem" />}
                            onClick={() => openChangeTeamModal(user)}
                            disabled={processing || team.name === 'Internal'}
                          >
                            {t('workspace.teams.changeTeam.label', 'Change Team')}
                          </Menu.Item>
                          {team.name !== 'Internal' && team.name !== 'Default' && (
                            <Menu.Item
                              leftSection={<LocalIcon icon="person-remove" width="1rem" height="1rem" />}
                              onClick={() => handleRemoveMember(user)}
                              disabled={processing}
                            >
                              {t('workspace.teams.removeMember', 'Remove from team')}
                            </Menu.Item>
                          )}
                          <Menu.Divider />
                          <Menu.Item
                            color="red"
                            leftSection={<LocalIcon icon="delete" width="1rem" height="1rem" />}
                            onClick={() => handleDeleteUser(user)}
                            disabled={processing || team.name === 'Internal'}
                          >
                            {t('workspace.people.deleteUser', 'Delete User')}
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
        opened={addMemberModalOpened}
        onClose={() => setAddMemberModalOpened(false)}
        size="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        centered
        padding="xl"
        withCloseButton={false}
      >
        <div style={{ position: 'relative' }}>
          <CloseButton
            onClick={() => setAddMemberModalOpened(false)}
            size="lg"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              zIndex: 1,
            }}
          />
          <Stack gap="lg" pt="md">
            {/* Header with Icon */}
            <Stack gap="md" align="center">
              <LocalIcon icon="person-add" width="3rem" height="3rem" style={{ color: 'var(--mantine-color-gray-6)' }} />
              <Text size="xl" fw={600} ta="center">
                {t('workspace.teams.addMemberToTeam.title')}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {t('workspace.teams.addMemberToTeam.addingTo')} <strong>{team.name}</strong>
              </Text>
            </Stack>

            <Select
              label={t('workspace.teams.addMemberToTeam.selectUser')}
              placeholder={t('workspace.teams.addMemberToTeam.selectUserPlaceholder')}
              data={availableUsers.map((user) => ({
                value: user.id.toString(),
                label: `${user.username}${user.team ? ` (${t('workspace.teams.addMemberToTeam.currentlyIn')} ${user.team.name})` : ''}`,
              }))}
              value={selectedUserId}
              onChange={(value) => setSelectedUserId(value || '')}
              searchable
              comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
            />

            {selectedUserId && availableUsers.find((u) => u.id.toString() === selectedUserId)?.team && (
              <Text size="xs" c="orange">
                {t('workspace.teams.addMemberToTeam.willBeMoved')}
              </Text>
            )}

            <Button onClick={handleAddMember} loading={processing} fullWidth size="md" mt="md">
              {t('workspace.teams.addMemberToTeam.submit')}
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
        <div style={{ position: 'relative' }}>
          <CloseButton
            onClick={() => setChangeTeamModalOpened(false)}
            size="lg"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              zIndex: 1,
            }}
          />
          <Stack gap="lg" pt="md">
            {/* Header with Icon */}
            <Stack gap="md" align="center">
              <LocalIcon icon="swap-horiz" width="3rem" height="3rem" style={{ color: 'var(--mantine-color-gray-6)' }} />
              <Text size="xl" fw={600} ta="center">
                {t('workspace.teams.changeTeam.title', 'Change Team')}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {t('workspace.teams.changeTeam.changing', 'Moving')} <strong>{selectedUser?.username}</strong>
              </Text>
            </Stack>

            <Select
              label={t('workspace.teams.changeTeam.selectTeam', 'Select Team')}
              placeholder={t('workspace.teams.changeTeam.selectTeamPlaceholder', 'Choose a team')}
              data={allTeams
                .filter((t) => t.name !== 'Internal')
                .map((team) => ({
                  value: team.id.toString(),
                  label: team.name,
                }))}
              value={selectedTeamId}
              onChange={(value) => setSelectedTeamId(value || '')}
              searchable
              comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_OVER_CONFIG_MODAL }}
            />

            <Button onClick={handleChangeTeam} loading={processing} fullWidth size="md" mt="md">
              {t('workspace.teams.changeTeam.submit', 'Change Team')}
            </Button>
          </Stack>
        </div>
      </Modal>
    </Stack>
  );
}
