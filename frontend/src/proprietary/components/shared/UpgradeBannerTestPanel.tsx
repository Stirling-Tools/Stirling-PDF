import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import {
  UPGRADE_BANNER_TEST_EVENT,
  type UpgradeBannerTestScenario,
} from '@core/constants/events';

export function UpgradeBannerTestPanel() {
  if (import.meta.env.PROD) {
    return null;
  }

  const triggerScenario = (scenario: UpgradeBannerTestScenario) => () => {
    window.dispatchEvent(
      new CustomEvent(UPGRADE_BANNER_TEST_EVENT, { detail: { scenario } }),
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        zIndex: 2000,
        pointerEvents: 'none',
      }}
    >
      <Paper shadow="lg" p="sm" radius="md" withBorder style={{ pointerEvents: 'auto' }}>
        <Stack gap="xs">
          <Text size="xs" fw={600}>
            Banner test scenarios
          </Text>
          <Group gap="xs" wrap="wrap">
            <Button size="xs" variant="light" onClick={triggerScenario('friendly')}>
              Friendly (&lt;5 admin)
            </Button>
            <Button size="xs" variant="light" onClick={triggerScenario('urgent-admin')}>
              Urgent (admin)
            </Button>
            <Button size="xs" variant="light" onClick={triggerScenario('urgent-user')}>
              Urgent (user)
            </Button>
            <Button size="xs" variant="default" onClick={triggerScenario(null)}>
              Reset
            </Button>
          </Group>
        </Stack>
      </Paper>
    </div>
  );
}

