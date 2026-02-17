import React, { useState, useEffect } from 'react';
import { Button, TextInput, Group, Text, Stack, Alert, Table, Badge, ActionIcon, Menu, List, ThemeIcon, Modal, CloseButton, Anchor } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useSaaSTeam } from '@app/contexts/SaaSTeamContext';
import { useDesktopBilling } from '@app/hooks/useDesktopBilling';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import apiClient from '@app/services/apiClient';

/**
 * Desktop SaaS Teams Section
 * Allows team management for users connected to SaaS backend
 * CRITICAL: Only shown when in SaaS mode (enforced by navigation)
 */
export function SaaSTeamsSection() {
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

  // Check Pro status via desktop billing
  const { tier } = useDesktopBilling();
  const isPro = tier !== 'free';

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [featuresModalOpened, setFeaturesModalOpened] = useState(false);

  // Team rename state
  const [isEditingName, setIsEditingName] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
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

  const navigateToPlan = () => {
    window.dispatchEvent(new CustomEvent('appConfig:navigate', { detail: { key: 'planBilling' } }));
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      await inviteUser(inviteEmail);
      setSuccess(t('team.inviteSent', 'Invitation sent to {{email}}', { email: inviteEmail }));
      setInviteEmail('');
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || t('team.inviteError', 'Failed to send invitation'));
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: number, memberEmail: string) => {
    if (!window.confirm(t('team.confirmRemove', 'Remove {{email}} from the team?', { email: memberEmail }))) return;

    try {
      await removeMember(memberId);
      setSuccess(t('team.memberRemoved', 'Member removed successfully'));
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || t('team.removeError', 'Failed to remove member'));
    }
  };

  const handleCancelInvitation = async (invitationId: number, email: string) => {
    if (!window.confirm(t('team.confirmCancelInvite', 'Cancel invitation for {{email}}?', { email }))) return;

    try {
      await cancelInvitation(invitationId);
      setSuccess(t('team.inviteCancelled', 'Invitation for {{email}} cancelled', { email }));
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || t('team.cancelInviteError', 'Failed to cancel invitation'));
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
    setNewTeamName('');
  };

  const handleRenameSubmit = async () => {
    if (!currentTeam || !newTeamName.trim()) return;

    setRenamingTeam(true);
    setError(null);

    try {
      await apiClient.post(`/api/v1/team/${currentTeam.teamId}/rename`, {
        newName: newTeamName.trim(),
      });

      setSuccess(t('team.renameSuccess', 'Team renamed successfully'));
      setIsEditingName(false);
      await refreshTeams();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setError(error.response?.data?.error || error.message || t('team.renameError', 'Failed to rename team'));
    } finally {
      setRenamingTeam(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!currentTeam || isPersonalTeam) return;

    const confirmMessage = isTeamLeader
      ? t('team.confirmLeaveLeader', 'Are you sure you want to leave "{{name}}"? You are a team leader. Make sure there are other leaders before leaving.', { name: currentTeam.name })
      : t('team.confirmLeave', 'Are you sure you want to leave "{{name}}"?', { name: currentTeam.name });

    if (!window.confirm(confirmMessage)) return;

    try {
      await leaveTeam();
      setSuccess(t('team.leaveSuccess', 'Successfully left team'));
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setError(error.response?.data?.error || error.message || t('team.leaveError', 'Failed to leave team'));
    }
  };

  if (!currentTeam) {
    return (
      <Alert color="gray">
        <Text>{t('team.loading', 'Loading team information...')}</Text>
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
                  placeholder={t('team.namePlaceholder', 'Team name')}
                  style={{ flex: 1, maxWidth: 300 }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit();
                    if (e.key === 'Escape') handleCancelRename();
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
                <Text fw={600} size="lg">{currentTeam.name}</Text>
                {isTeamLeader && !isPersonalTeam && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handleStartRename}
                    aria-label={t('team.editName', 'Edit team name')}
                  >
                    <LocalIcon icon="edit" width="1rem" height="1rem" />
                  </ActionIcon>
                )}
                {isTeamLeader && <Badge color='blue'>{t('team.leader', 'LEADER')}</Badge>}
                {isPersonalTeam && (
                  <Badge color="gray" variant="light" size="xs">{t('team.personal', 'Personal')}</Badge>
                )}
              </Group>
            )}
            {!isEditingName && !isPersonalTeam && (
              <Text size="sm" c="dimmed" mt={4}>
                {t('team.memberCount', '{{count}} team members', { count: currentTeam.seatsUsed })}
              </Text>
            )}
          </div>
          {!isPersonalTeam && !isTeamLeader && !isEditingName && (
            <Button
              color="red"
              variant="outline"
              size="xs"
              onClick={handleLeaveTeam}
              leftSection={<LocalIcon icon="logout" width="1rem" height="1rem" />}
            >
              {t('team.leaveButton', 'Leave Team')}
            </Button>
          )}
        </Group>
      </div>

      {/* Upgrade Banner for Free Users */}
      {isPersonalTeam && !isPro && (
        <Alert color="blue" icon={<LocalIcon icon="info" width={16} height={16} />}>
          <Group justify="space-between" align="center">
            <div>
              <Text fw={500} size="sm">{t('team.upgrade.title', 'Upgrade to Pro to unlock team features')}</Text>
              <Text size="xs" c="dimmed" mt={2}>
                {t('team.upgrade.description', 'Invite members, share credits, and more.')}{' '}
                <Anchor size="xs" onClick={() => setFeaturesModalOpened(true)} style={{ cursor: 'pointer' }}>
                  {t('common.learnMore', 'Learn more')}
                </Anchor>
              </Text>
            </div>
            <Button
              size="sm"
              variant="light"
              onClick={navigateToPlan}
            >
              {t('team.upgrade.button', 'Upgrade to Pro')}
            </Button>
          </Group>
        </Alert>
      )}

      {/* Team Features Modal */}
      <Modal
        opened={featuresModalOpened}
        onClose={() => setFeaturesModalOpened(false)}
        size="md"
        centered
        padding="xl"
        withCloseButton={false}
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      >
        <div style={{ position: 'relative' }}>
          <CloseButton
            onClick={() => setFeaturesModalOpened(false)}
            size="lg"
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              zIndex: 1
            }}
          />
          <Stack gap="lg" pt="md">
            {/* Header */}
            <Stack gap="md" align="center">
              <Badge size="lg" color="violet" variant="filled">{t('team.features.badge', 'PRO FEATURE')}</Badge>
              <Text size="xl" fw={700} ta="center">
                {t('team.features.title', 'Team Collaboration')}
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                {t('team.features.subtitle', 'Upgrade to Pro and unlock powerful team features')}
              </Text>
            </Stack>

            {/* Features List */}
            <List
              spacing="md"
              size="sm"
              icon={
                <ThemeIcon color="violet" size={24} radius="xl" variant="light">
                  <LocalIcon icon="check" width={14} height={14} />
                </ThemeIcon>
              }
            >
              <List.Item>
                <Text fw={500}>{t('team.features.invite.title', 'Invite team members')}</Text>
                <Text size="xs" c="dimmed">{t('team.features.invite.description', 'Add unlimited users with additional seat purchases')}</Text>
              </List.Item>
              <List.Item>
                <Text fw={500}>{t('team.features.credits.title', 'Share credits across your team')}</Text>
                <Text size="xs" c="dimmed">{t('team.features.credits.description', 'Pool resources for collaborative work')}</Text>
              </List.Item>
              <List.Item>
                <Text fw={500}>{t('team.features.dashboard.title', 'Team management dashboard')}</Text>
                <Text size="xs" c="dimmed">{t('team.features.dashboard.description', 'Control permissions, monitor usage, and manage members')}</Text>
              </List.Item>
              <List.Item>
                <Text fw={500}>{t('team.features.billing.title', 'Centralized billing')}</Text>
                <Text size="xs" c="dimmed">{t('team.features.billing.description', 'One invoice for all team seats and usage')}</Text>
              </List.Item>
            </List>

            {/* CTA Button */}
            <Button
              size="md"
              fullWidth
              onClick={() => {
                setFeaturesModalOpened(false);
                navigateToPlan();
              }}
            >
              {t('team.features.viewPlans', 'View Pro Plans')}
            </Button>
          </Stack>
        </div>
      </Modal>

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

      {/* Invite Members (Pro Users) */}
      {isTeamLeader && isPro && (
        <div>
          <Text fw={600} size="md" mb="sm">{t('team.invite.title', 'Invite Team Member')}</Text>
          <form onSubmit={handleInvite}>
            <Group>
              <TextInput
                type="email"
                placeholder={t('team.invite.placeholder', 'email@example.com')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                style={{ flex: 1 }}
                required
                error={inviteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail) ? t('team.invite.invalidEmail', 'Invalid email format') : undefined}
              />
              <Button
                type="submit"
                loading={inviting}
                disabled={!inviteEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)}
              >
                {t('team.invite.sendButton', 'Send Invite')}
              </Button>
            </Group>
          </form>
        </div>
      )}

      {/* Team Members Table */}
      <div>
        <Text fw={600} size="md" mb="sm">{t('team.members.title', 'Team Members')}</Text>
        <Table
          horizontalSpacing="md"
          verticalSpacing="sm"
          withRowBorders
          highlightOnHover
          style={{
            '--table-border-color': 'var(--mantine-color-gray-3)',
          } as React.CSSProperties}
        >
          <Table.Thead>
            <Table.Tr style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
              <Table.Th style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--mantine-color-gray-7)' }}>
                {t('team.members.nameColumn', 'Name')}
              </Table.Th>
              <Table.Th style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--mantine-color-gray-7)' }}>
                {t('team.members.emailColumn', 'Email')}
              </Table.Th>
              <Table.Th style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--mantine-color-gray-7)' }}>
                {t('team.members.roleColumn', 'Role')}
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
                    {t('team.members.empty', 'No team members yet.')}
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
                        color={member.role === 'LEADER' ? 'blue' : undefined}
                        style={member.role !== 'LEADER' ? {
                          backgroundColor: 'var(--tool-header-badge-bg)',
                          color: 'var(--tool-header-badge-text)',
                        } : undefined}
                      >
                        {member.role}
                      </Badge>
                    </Table.Td>
                    {isTeamLeader && !isPersonalTeam && (
                      <Table.Td>
                        {member.role !== 'LEADER' && (
                          <Menu position="bottom-end" withinPortal zIndex={Z_INDEX_OVER_CONFIG_MODAL}>
                            <Menu.Target>
                              <ActionIcon variant="subtle">
                                <LocalIcon icon="more-vert" width="1rem" height="1rem" />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                color="red"
                                leftSection={<LocalIcon icon="person-remove" width="1rem" height="1rem" />}
                                onClick={() => handleRemove(member.id, member.email)}
                              >
                                {t('team.members.remove', 'Remove from Team')}
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
                  .filter(inv => inv.status === 'PENDING')
                  .map((invitation) => (
                    <Table.Tr key={`invitation-${invitation.invitationId}`}>
                      <Table.Td>
                        <Text size="sm" fw={500} c="dimmed" fs="italic">
                          {invitation.inviteeEmail.split('@')[0]}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {invitation.inviteeEmail}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" color="yellow" variant="light">
                          {t('team.members.pending', 'PENDING')}
                        </Badge>
                      </Table.Td>
                      {isTeamLeader && !isPersonalTeam && (
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleCancelInvitation(invitation.invitationId, invitation.inviteeEmail)}
                            aria-label={t('team.invite.cancelLabel', 'Cancel invitation')}
                          >
                            <LocalIcon icon="close" width="1rem" height="1rem" />
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
}
