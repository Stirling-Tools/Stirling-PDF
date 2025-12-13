import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Stack,
  Text,
  Button,
  TextInput,
  Select,
  Paper,
  Checkbox,
  Textarea,
  SegmentedControl,
  Tooltip,
  CloseButton,
  Box,
  Group,
} from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { alert } from '@app/components/toast';
import { userManagementService } from '@app/services/userManagementService';
import { teamService, Team } from '@app/services/teamService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useNavigate } from 'react-router-dom';

interface InviteMembersModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function InviteMembersModal({ opened, onClose, onSuccess }: InviteMembersModalProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
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
  const hasNoSlots = licenseInfo ? licenseInfo.availableSlots <= 0 : false;

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

  // Fetch teams and license info
  useEffect(() => {
    if (opened) {
      const fetchData = async () => {
        try {
          const [adminData, teamsData] = await Promise.all([
            userManagementService.getUsers(),
            teamService.getTeams(),
          ]);

          setTeams(teamsData);

          setLicenseInfo({
            maxAllowedUsers: adminData.maxAllowedUsers,
            availableSlots: adminData.availableSlots,
            grandfatheredUserCount: adminData.grandfatheredUserCount,
            licenseMaxUsers: adminData.licenseMaxUsers,
            premiumEnabled: adminData.premiumEnabled,
            totalUsers: adminData.totalUsers,
          });
        } catch (error) {
          console.error('Failed to fetch data:', error);
        }
      };
      fetchData();
    }
  }, [opened]);

  const roleOptions = [
    {
      value: 'ROLE_USER',
      label: t('workspace.people.roleDescriptions.user', 'User'),
    },
    {
      value: 'ROLE_ADMIN',
      label: t('workspace.people.roleDescriptions.admin', 'Admin'),
    },
  ];

  const teamOptions = teams.map((team) => ({
    value: team.id.toString(),
    label: team.name,
  }));

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
      onClose();
      onSuccess?.();
      // Reset form
      setInviteForm({
        username: '',
        password: '',
        role: 'ROLE_USER',
        teamId: undefined,
        forceChange: false,
      });
    } catch (error: any) {
      console.error('Failed to invite user:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || t('workspace.people.addMember.error');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const handleEmailInvite = async () => {
    if (!emailInviteForm.emails.trim()) {
      alert({ alertType: 'error', title: t('workspace.people.emailInvite.emailsRequired', 'Email addresses are required') });
      return;
    }

    try {
      setProcessing(true);
      const response = await userManagementService.inviteUsers({
        emails: emailInviteForm.emails, // comma-separated string as required by API
        role: emailInviteForm.role,
        teamId: emailInviteForm.teamId,
      });

      if (response.successCount > 0) {
        // Show success message
        alert({
          alertType: 'success',
          title: t('workspace.people.emailInvite.success', { count: response.successCount, defaultValue: `Successfully invited ${response.successCount} user(s)` })
        });

        // Show warning if there were partial failures
        if (response.failureCount > 0 && response.errors) {
          alert({
            alertType: 'warning',
            title: t('workspace.people.emailInvite.partialFailure', 'Some invites failed'),
            body: response.errors
          });
        }

        onClose();
        onSuccess?.();
        setEmailInviteForm({
          emails: '',
          role: 'ROLE_USER',
          teamId: undefined,
        });
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
        email: inviteLinkForm.email || undefined,
        role: inviteLinkForm.role,
        teamId: inviteLinkForm.teamId,
        expiryHours: inviteLinkForm.expiryHours,
        sendEmail: inviteLinkForm.sendEmail,
      });
      setGeneratedInviteLink(response.inviteUrl);
      onSuccess?.();
      if (inviteLinkForm.sendEmail && inviteLinkForm.email) {
        alert({ alertType: 'success', title: t('workspace.people.inviteLink.emailSent', 'Invite link generated and sent via email') });
      }
    } catch (error: any) {
      console.error('Failed to generate invite link:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || t('workspace.people.inviteLink.error', 'Failed to generate invite link');
      alert({ alertType: 'error', title: errorMessage });
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setGeneratedInviteLink(null);
    setInviteMode('direct');
    setInviteForm({
      username: '',
      password: '',
      role: 'ROLE_USER',
      teamId: undefined,
      forceChange: false,
    });
    setEmailInviteForm({
      emails: '',
      role: 'ROLE_USER',
      teamId: undefined,
    });
    setInviteLinkForm({
      email: '',
      role: 'ROLE_USER',
      teamId: undefined,
      expiryHours: 72,
      sendEmail: false,
    });
    onClose();
  };

  const handleGoToPlan = () => {
    handleClose();
    navigate('/settings/adminPlan');
  };

  const handlePrimaryAction = () => {
    if (inviteMode === 'email') {
      handleEmailInvite();
    } else if (inviteMode === 'link') {
      handleGenerateInviteLink();
    } else {
      handleInviteUser();
    }
  };
  
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="md"
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      centered
      padding="xl"
      withCloseButton={false}
    >
      <Box pos="relative">
        <CloseButton
          onClick={handleClose}
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
              {t('workspace.people.inviteMembers.label', 'Invite Members')}
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
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap">
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
                  {licenseInfo.availableSlots === 0 && (
                    <Button size="xs" variant="light" onClick={handleGoToPlan}>
                      {t('workspace.people.actions.upgrade', 'Upgrade')}
                    </Button>
                  )}
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
            onClick={handlePrimaryAction}
            loading={!hasNoSlots && processing}
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
  );
}

