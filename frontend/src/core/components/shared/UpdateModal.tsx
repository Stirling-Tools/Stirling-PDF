import React, { useState, useEffect } from 'react';
import { Modal, Stack, Text, Badge, Button, Group, Loader, Center, Divider, Box, Collapse } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { updateService, UpdateSummary, FullUpdateInfo, MachineInfo } from '@app/services/updateService';
import { Z_INDEX_OVER_CONFIG_MODAL } from '@app/styles/zIndex';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface UpdateModalProps {
  opened: boolean;
  onClose: () => void;
  currentVersion: string;
  updateSummary: UpdateSummary;
  machineInfo: MachineInfo;
}

const UpdateModal: React.FC<UpdateModalProps> = ({
  opened,
  onClose,
  currentVersion,
  updateSummary,
  machineInfo,
}) => {
  const { t } = useTranslation();
  const [fullUpdateInfo, setFullUpdateInfo] = useState<FullUpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    if (opened) {
      setLoading(true);
      setExpandedVersions(new Set([0]));
      updateService.getFullUpdateInfo(currentVersion, machineInfo).then((info) => {
        setFullUpdateInfo(info);
        setLoading(false);
      });
    }
  }, [opened, currentVersion, machineInfo]);

  const toggleVersion = (index: number) => {
    setExpandedVersions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority?.toLowerCase()) {
      case 'urgent':
        return 'red';
      case 'normal':
        return 'blue';
      case 'minor':
        return 'cyan';
      case 'low':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const getPriorityLabel = (priority: string): string => {
    const key = priority?.toLowerCase();
    return t(`update.priority.${key}`, priority || 'Normal');
  };

  const downloadUrl = updateService.getDownloadUrl(machineInfo);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={600} size="lg">
          {t('update.modalTitle', 'Update Available')}
        </Text>
      }
      centered
      size="xl"
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
      styles={{
        body: {
          maxHeight: '75vh',
          overflowY: 'auto',
        },
      }}
    >
      <Stack gap="lg" pt="md">
        {/* Version Summary Section */}
        <Box>
          <Group justify="space-between" align="flex-start" wrap="nowrap" mb="md">
            <Stack gap={4} style={{ flex: 1 }}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                {t('update.current', 'Current Version')}
              </Text>
              <Text fw={600} size="xl">
                {currentVersion}
              </Text>
            </Stack>

            <Stack gap={4} style={{ flex: 1 }} ta="center">
              <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                {t('update.priorityLabel', 'Priority')}
              </Text>
              <Badge
                color={getPriorityColor(updateSummary.max_priority)}
                size="lg"
                variant="filled"
                style={{ alignSelf: 'center' }}
              >
                {getPriorityLabel(updateSummary.max_priority)}
              </Badge>
            </Stack>

            <Stack gap={4} style={{ flex: 1 }} ta="right">
              <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                {t('update.latest', 'Latest Version')}
              </Text>
              <Text fw={600} size="xl" c="blue">
                {updateSummary.latest_version}
              </Text>
            </Stack>
          </Group>

          {updateSummary.latest_stable_version && (
            <Box
              style={{
                background: 'var(--mantine-color-green-0)',
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--mantine-color-green-2)',
              }}
            >
              <Group gap="xs" justify="center">
                <Text size="sm" fw={500}>
                  {t('update.latestStable', 'Latest Stable')}:
                </Text>
                <Text size="sm" fw={600} c="green">
                  {updateSummary.latest_stable_version}
                </Text>
              </Group>
            </Box>
          )}
        </Box>

        {/* Recommended action */}
        {updateSummary.recommended_action && (
          <Box
            style={{
              background: 'var(--mantine-color-blue-light)',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid var(--mantine-color-blue-outline)',
            }}
          >
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <InfoOutlinedIcon style={{ fontSize: 18, color: 'var(--mantine-color-blue-filled)', marginTop: 2 }} />
              <Box style={{ flex: 1 }}>
                <Text size="xs" fw={600} mb={4} tt="uppercase">
                  {t('update.recommendedAction', 'Recommended Action')}
                </Text>
                <Text size="sm">
                  {updateSummary.recommended_action}
                </Text>
              </Box>
            </Group>
          </Box>
        )}

        {/* Breaking changes warning */}
        {updateSummary.any_breaking && (
          <Box
            style={{
              background: 'var(--mantine-color-orange-light)',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid var(--mantine-color-orange-outline)',
            }}
          >
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <WarningAmberIcon style={{ fontSize: 18, color: 'var(--mantine-color-orange-filled)', marginTop: 2 }} />
              <Box style={{ flex: 1 }}>
                <Text size="xs" fw={600} mb={4} tt="uppercase">
                  {t('update.breakingChangesDetected', 'Breaking Changes Detected')}
                </Text>
                <Text size="sm">
                  {t(
                    'update.breakingChangesMessage',
                    'Some versions contain breaking changes. Please review the migration guides below before updating.'
                  )}
                </Text>
              </Box>
            </Group>
          </Box>
        )}

        {/* Migration guides */}
        {updateSummary.migration_guides && updateSummary.migration_guides.length > 0 && (
          <>
            <Divider />
            <Stack gap="xs">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                {t('update.migrationGuides', 'Migration Guides')}
              </Text>
              {updateSummary.migration_guides.map((guide, idx) => (
                <Box
                  key={idx}
                  style={{
                    border: '1px solid var(--mantine-color-gray-3)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'var(--mantine-color-gray-0)',
                  }}
                >
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Box style={{ flex: 1 }}>
                      <Text fw={600} size="sm">
                        {t('update.version', 'Version')} {guide.version}
                      </Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {guide.notes}
                      </Text>
                    </Box>
                    <Button
                      component="a"
                      href={guide.url}
                      target="_blank"
                      variant="light"
                      size="xs"
                      rightSection={<OpenInNewIcon style={{ fontSize: 14 }} />}
                    >
                      {t('update.viewGuide', 'View Guide')}
                    </Button>
                  </Group>
                </Box>
              ))}
            </Stack>
          </>
        )}

        {/* Version details */}
        <Divider />
        {loading ? (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <Loader size="md" />
              <Text size="sm" c="dimmed">
                {t('update.loadingDetailedInfo', 'Loading detailed information...')}
              </Text>
            </Stack>
          </Center>
        ) : fullUpdateInfo && fullUpdateInfo.new_versions && fullUpdateInfo.new_versions.length > 0 ? (
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                {t('update.availableUpdates', 'Available Updates')}
              </Text>
              <Badge variant="light" color="gray">
                {fullUpdateInfo.new_versions.length} {fullUpdateInfo.new_versions.length === 1 ? 'version' : 'versions'}
              </Badge>
            </Group>
            <Stack gap="xs">
              {fullUpdateInfo.new_versions.map((version, index) => {
                const isExpanded = expandedVersions.has(index);
                return (
                  <Box
                    key={index}
                    style={{
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    <Group
                      justify="space-between"
                      align="center"
                      p="md"
                      style={{
                        cursor: 'pointer',
                        background: isExpanded ? 'var(--mantine-color-gray-0)' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                      onClick={() => toggleVersion(index)}
                    >
                      <Group gap="md" style={{ flex: 1 }}>
                        <Box>
                          <Text fw={600} size="sm" c="dimmed" mb={2}>
                            {t('update.version', 'Version')}
                          </Text>
                          <Text fw={700} size="lg">
                            {version.version}
                          </Text>
                        </Box>
                        <Badge color={getPriorityColor(version.priority)} size="md">
                          {getPriorityLabel(version.priority)}
                        </Badge>
                      </Group>
                      <Group gap="xs">
                        <Button
                          component="a"
                          href={`https://github.com/Stirling-Tools/Stirling-PDF/releases/tag/v${version.version}`}
                          target="_blank"
                          variant="light"
                          size="xs"
                          onClick={(e) => e.stopPropagation()}
                          rightSection={<OpenInNewIcon style={{ fontSize: 14 }} />}
                        >
                          {t('update.releaseNotes', 'Release Notes')}
                        </Button>
                        {isExpanded ? (
                          <ExpandLessIcon style={{ fontSize: 20, color: 'var(--mantine-color-gray-6)' }} />
                        ) : (
                          <ExpandMoreIcon style={{ fontSize: 20, color: 'var(--mantine-color-gray-6)' }} />
                        )}
                      </Group>
                    </Group>

                    <Collapse in={isExpanded}>
                      <Box p="md" pt={0} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                        <Stack gap="md" mt="md">
                          <Box>
                            <Text fw={600} size="sm" mb={6}>
                              {version.announcement.title}
                            </Text>
                            <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
                              {version.announcement.message}
                            </Text>
                          </Box>

                          {version.compatibility.breaking_changes && (
                            <Box
                              style={{
                                background: 'var(--mantine-color-orange-light)',
                                padding: '12px',
                                borderRadius: '6px',
                                border: '1px solid var(--mantine-color-orange-outline)',
                              }}
                            >
                              <Group gap="xs" align="flex-start" wrap="nowrap" mb="xs">
                                <WarningAmberIcon style={{ fontSize: 16, color: 'var(--mantine-color-orange-filled)', marginTop: 2 }} />
                                <Text size="xs" fw={600} tt="uppercase">
                                  {t('update.breakingChanges', 'Breaking Changes')}
                                </Text>
                              </Group>
                              <Text size="sm" mb="xs">
                                {version.compatibility.breaking_description ||
                                  t('update.breakingChangesDefault', 'This version contains breaking changes.')}
                              </Text>
                              {version.compatibility.migration_guide_url && (
                                <Button
                                  component="a"
                                  href={version.compatibility.migration_guide_url}
                                  target="_blank"
                                  variant="light"
                                  color="orange"
                                  size="xs"
                                  rightSection={<OpenInNewIcon style={{ fontSize: 14 }} />}
                                >
                                  {t('update.migrationGuide', 'Migration Guide')}
                                </Button>
                              )}
                            </Box>
                          )}
                        </Stack>
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Stack>
          </Stack>
        ) : null}

        {/* Action buttons */}
        <Divider />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t('update.close', 'Close')}
          </Button>
          <Button
            variant="light"
            component="a"
            href="https://github.com/Stirling-Tools/Stirling-PDF/releases"
            target="_blank"
            rightSection={<OpenInNewIcon style={{ fontSize: 16 }} />}
          >
            {t('update.viewAllReleases', 'View All Releases')}
          </Button>
          {downloadUrl && (
            <Button
              component="a"
              href={downloadUrl}
              target="_blank"
              color="green"
              leftSection={<DownloadIcon style={{ fontSize: 16 }} />}
            >
              {t('update.downloadLatest', 'Download Latest')}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};

export default UpdateModal;
