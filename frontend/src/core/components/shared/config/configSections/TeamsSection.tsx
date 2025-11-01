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
  Paper,
  Select,
  CloseButton,
} from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { alert } from '@app/components/toast';
import { teamService, Team } from '@app/services/teamService';
import { userManagementService, User } from '@app/services/userManagementService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import TeamDetailsSection from '@app/components/shared/config/configSections/TeamDetailsSection';

export default function TeamsSection() {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [renameModalOpened, setRenameModalOpened] = useState(false);
  const [addMemberModalOpened, setAddMemberModalOpened] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [processing, setProcessing] = useState(false);
  const [viewingTeamId, setViewingTeamId] = useState<number | null>(null);

  // Form states
  const [newTeamName, setNewTeamName] = useState('');
  const [renameTeamName, setRenameTeamName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const teamsData = await teamService.getTeams();
      setTeams(teamsData);
    } catch (error) {
      console.error('Failed to fetch teams:', error);
      alert({ alertType: 'error', title: 'Failed to load teams' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      alert({ alertType: 'error', title: t('workspace.teams.createTeam.nameRequired') });
      return;
    }

    try {
      setProcessing(true);
      await teamService.createTeam(newTeamName);
      alert({ alertType: 'success', title: t('workspace.teams.createTeam.success') });
      setCreateModalOpened(false);
      setNewTeamName('');
      fetchTeams();
    } catch (error: any) {
      console.error('Failed to create team:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.teams.createTeam.error');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const handleRenameTeam = async () => {
    if (!selectedTeam || !renameTeamName.trim()) {
      alert({ alertType: 'error', title: t('workspace.teams.renameTeam.nameRequired') });
      return;
    }

    try {
      setProcessing(true);
      await teamService.renameTeam(selectedTeam.id, renameTeamName);
      alert({ alertType: 'success', title: t('workspace.teams.renameTeam.success') });
      setRenameModalOpened(false);
      setSelectedTeam(null);
      setRenameTeamName('');
      fetchTeams();
    } catch (error: any) {
      console.error('Failed to rename team:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.teams.renameTeam.error');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    if (team.name === 'Internal') {
      alert({ alertType: 'error', title: t('workspace.teams.cannotDeleteInternal') });
      return;
    }

    if (!confirm(t('workspace.teams.confirmDelete'))) {
      return;
    }

    try {
      await teamService.deleteTeam(team.id);
      alert({ alertType: 'success', title: t('workspace.teams.deleteTeam.success') });
      fetchTeams();
    } catch (error: any) {
      console.error('Failed to delete team:', error);
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          error.message ||
                          t('workspace.teams.deleteTeam.error');
      alert({ alertType: 'error', title: errorMessage });
    }
  };

  const openRenameModal = (team: Team) => {
    if (team.name === 'Internal') {
      alert({ alertType: 'error', title: t('workspace.teams.cannotRenameInternal') });
      return;
    }
    setSelectedTeam(team);
    setRenameTeamName(team.name);
    setRenameModalOpened(true);
  };

  const openAddMemberModal = async (team: Team) => {
    if (team.name === 'Internal') {
      alert({ alertType: 'error', title: t('workspace.teams.cannotAddToInternal') });
      return;
    }
    setSelectedTeam(team);
    try {
      // Fetch all users to show in dropdown
      const adminData = await userManagementService.getUsers();
      setAvailableUsers(adminData.users);
      setAddMemberModalOpened(true);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      alert({ alertType: 'error', title: t('workspace.teams.addMemberToTeam.error') });
    }
  };

  const handleAddMember = async () => {
    if (!selectedTeam || !selectedUserId) {
      alert({ alertType: 'error', title: t('workspace.teams.addMemberToTeam.userRequired') });
      return;
    }

    try {
      setProcessing(true);
      await teamService.addUserToTeam(selectedTeam.id, parseInt(selectedUserId));
      alert({ alertType: 'success', title: t('workspace.teams.addMemberToTeam.success') });
      setAddMemberModalOpened(false);
      setSelectedTeam(null);
      setSelectedUserId('');
      fetchTeams();
    } catch (error) {
      console.error('Failed to add member to team:', error);
      alert({ alertType: 'error', title: t('workspace.teams.addMemberToTeam.error') });
    } finally {
      setProcessing(false);
    }
  };

  // If viewing team details, render TeamDetailsSection
  if (viewingTeamId !== null) {
    return (
      <TeamDetailsSection
        teamId={viewingTeamId}
        onBack={() => {
          setViewingTeamId(null);
          fetchTeams(); // Refresh teams list
        }}
      />
    );
  }

  if (loading) {
    return (
      <Stack align="center" py="md">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          {t('workspace.teams.loading', 'Loading teams...')}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">
          {t('workspace.teams.title')}
        </Text>
        <Text size="sm" c="dimmed">
          {t('workspace.teams.description')}
        </Text>
      </div>

      {/* Header Actions */}
      <Group justify="flex-end">
        <Button leftSection={<LocalIcon icon="add" width="1rem" height="1rem" />} onClick={() => setCreateModalOpened(true)}>
          {t('workspace.teams.createNewTeam')}
        </Button>
      </Group>

      {/* Teams Table */}
      <Paper withBorder p="md">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('workspace.teams.teamName')}</Table.Th>
              <Table.Th>{t('workspace.teams.totalMembers')}</Table.Th>
              <Table.Th style={{ width: 50 }}></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {teams.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text ta="center" c="dimmed" py="xl">
                    {t('workspace.teams.noTeamsFound')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              teams.map((team) => (
                <Table.Tr
                  key={team.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setViewingTeamId(team.id)}
                >
                  <Table.Td>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>
                        {team.name}
                      </Text>
                      {team.name === 'Internal' && (
                        <Badge size="xs" color="gray">
                          {t('workspace.teams.system')}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{team.userCount || 0}</Text>
                  </Table.Td>
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                          <LocalIcon icon="more-vert" width="1rem" height="1rem" />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown style={{ zIndex: Z_INDEX_OVER_CONFIG_MODAL }}>
                        <Menu.Item leftSection={<LocalIcon icon="visibility" width="1rem" height="1rem" />} onClick={() => setViewingTeamId(team.id)}>
                          {t('workspace.teams.viewTeam', 'View Team')}
                        </Menu.Item>
                        <Menu.Item leftSection={<LocalIcon icon="group" width="1rem" height="1rem" />} onClick={() => openAddMemberModal(team)}>
                          {t('workspace.teams.addMember')}
                        </Menu.Item>
                        <Menu.Item leftSection={<LocalIcon icon="edit" width="1rem" height="1rem" />} onClick={() => openRenameModal(team)}>
                          {t('workspace.teams.renameTeamLabel')}
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<LocalIcon icon="delete" width="1rem" height="1rem" />}
                          onClick={() => handleDeleteTeam(team)}
                          disabled={team.name === 'Internal'}
                        >
                          {t('workspace.teams.deleteTeamLabel')}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Create Team Modal */}
      <Modal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        size="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        centered
        padding="xl"
        withCloseButton={false}
      >
        <div style={{ position: 'relative' }}>
          <CloseButton
            onClick={() => setCreateModalOpened(false)}
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
              <LocalIcon icon="group-add" width="3rem" height="3rem" style={{ color: 'var(--mantine-color-gray-6)' }} />
              <Text size="xl" fw={600} ta="center">
                {t('workspace.teams.createTeam.title')}
              </Text>
            </Stack>

            <TextInput
              label={t('workspace.teams.createTeam.teamName')}
              placeholder={t('workspace.teams.createTeam.teamNamePlaceholder')}
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.currentTarget.value)}
              required
            />

            <Button onClick={handleCreateTeam} loading={processing} fullWidth size="md" mt="md">
              {t('workspace.teams.createTeam.submit')}
            </Button>
          </Stack>
        </div>
      </Modal>

      {/* Rename Team Modal */}
      <Modal
        opened={renameModalOpened}
        onClose={() => setRenameModalOpened(false)}
        size="md"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        centered
        padding="xl"
        withCloseButton={false}
      >
        <div style={{ position: 'relative' }}>
          <CloseButton
            onClick={() => setRenameModalOpened(false)}
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
                {t('workspace.teams.renameTeam.title')}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {t('workspace.teams.renameTeam.renaming')} <strong>{selectedTeam?.name}</strong>
              </Text>
            </Stack>

            <TextInput
              label={t('workspace.teams.renameTeam.newTeamName')}
              placeholder={t('workspace.teams.renameTeam.newTeamNamePlaceholder')}
              value={renameTeamName}
              onChange={(e) => setRenameTeamName(e.currentTarget.value)}
              required
            />

            <Button onClick={handleRenameTeam} loading={processing} fullWidth size="md" mt="md">
              {t('workspace.teams.renameTeam.submit')}
            </Button>
          </Stack>
        </div>
      </Modal>

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
              zIndex: 1
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
                {t('workspace.teams.addMemberToTeam.addingTo')} <strong>{selectedTeam?.name}</strong>
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
    </Stack>
  );
}
