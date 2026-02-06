import { useTranslation } from 'react-i18next';
import { Stack, Paper, Text, Group, Badge } from '@mantine/core';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

interface SignatureSettingsDisplayProps {
  showSignature: boolean;
  pageNumber?: number | null;
  reason?: string | null;
  location?: string | null;
  showLogo: boolean;
}

const SignatureSettingsDisplay = ({
  showSignature,
  pageNumber,
  reason,
  location,
  showLogo,
}: SignatureSettingsDisplayProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Paper p="sm" withBorder>
        <Stack gap="xs">
          <Group gap="xs" justify="space-between">
            <Text size="xs" c="dimmed">
              {t('certSign.appearance.visibility', 'Visibility')}
            </Text>
            <Group gap="xs">
              {showSignature ? (
                <>
                  <VisibilityIcon style={{ fontSize: '16px', color: 'var(--mantine-color-green-6)' }} />
                  <Badge size="sm" color="green" variant="light">
                    {t('certSign.appearance.visible', 'Visible')}
                  </Badge>
                </>
              ) : (
                <>
                  <VisibilityOffIcon style={{ fontSize: '16px', color: 'var(--mantine-color-gray-6)' }} />
                  <Badge size="sm" color="gray" variant="light">
                    {t('certSign.appearance.invisible', 'Invisible')}
                  </Badge>
                </>
              )}
            </Group>
          </Group>

          {showSignature && (
            <>
              {pageNumber && (
                <Group gap="xs" justify="space-between">
                  <Text size="xs" c="dimmed">
                    {t('certSign.pageNumber', 'Page Number')}
                  </Text>
                  <Text size="xs" fw={600}>
                    {pageNumber}
                  </Text>
                </Group>
              )}

              {reason && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    {t('certSign.reason', 'Reason')}
                  </Text>
                  <Paper p="xs" withBorder bg="gray.0">
                    <Text size="xs">{reason}</Text>
                  </Paper>
                </Stack>
              )}

              {location && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    {t('certSign.location', 'Location')}
                  </Text>
                  <Paper p="xs" withBorder bg="gray.0">
                    <Text size="xs">{location}</Text>
                  </Paper>
                </Stack>
              )}

              <Group gap="xs" justify="space-between">
                <Text size="xs" c="dimmed">
                  {t('certSign.logoTitle', 'Logo')}
                </Text>
                <Group gap="xs">
                  {showLogo ? (
                    <>
                      <CheckIcon style={{ fontSize: '16px', color: 'var(--mantine-color-green-6)' }} />
                      <Badge size="sm" color="green" variant="light">
                        {t('certSign.showLogo', 'Show Logo')}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <CloseIcon style={{ fontSize: '16px', color: 'var(--mantine-color-gray-6)' }} />
                      <Badge size="sm" color="gray" variant="light">
                        {t('certSign.noLogo', 'No Logo')}
                      </Badge>
                    </>
                  )}
                </Group>
              </Group>
            </>
          )}
        </Stack>
      </Paper>

      <Paper p="xs" withBorder bg="blue.0">
        <Text size="xs" c="blue.9">
          {t(
            'certSign.collab.signRequest.signatureInfo',
            'These settings are configured by the document owner'
          )}
        </Text>
      </Paper>
    </Stack>
  );
};

export default SignatureSettingsDisplay;
