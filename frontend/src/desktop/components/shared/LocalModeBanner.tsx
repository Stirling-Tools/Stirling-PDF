import { useState, useEffect } from 'react';
import { Paper, Group, Text, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { connectionModeService, type ConnectionMode } from '@app/services/connectionModeService';
import { OPEN_SIGN_IN_EVENT } from '@app/components/SignInModal';

const BANNER_BG = 'var(--mantine-color-gray-1)';
const BANNER_BORDER = 'var(--mantine-color-gray-3)';
const BANNER_TEXT = 'var(--mantine-color-gray-7)';
const BANNER_ICON = 'var(--mantine-color-gray-5)';

/**
 * Desktop-only banner shown when the user is in local-only mode.
 * Not dismissable. Prompts the user to sign in to unlock all tools.
 */
export function LocalModeBanner() {
  const { t } = useTranslation();
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(null);

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
    const unsubscribe = connectionModeService.subscribeToModeChanges((config) => {
      setConnectionMode(config.mode);
    });
    return unsubscribe;
  }, []);

  if (connectionMode !== 'local') return null;

  return (
    <Paper
      radius={0}
      style={{
        background: BANNER_BG,
        borderBottom: `1px solid ${BANNER_BORDER}`,
      }}
    >
      <Group gap="xs" align="center" wrap="nowrap" justify="space-between" px="sm" py={6}>
        <Group gap="xs" align="center" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <LocalIcon
            icon="computer"
            width="1rem"
            height="1rem"
            style={{ color: BANNER_ICON, flexShrink: 0 }}
          />
          <Text size="xs" fw={600} style={{ color: BANNER_TEXT, flexShrink: 0 }}>
            {t('localMode.banner.title', 'Running locally')}
          </Text>
          <Text size="xs" style={{ color: BANNER_TEXT, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('localMode.banner.message', 'Sign in to unlock all tools.')}
          </Text>
        </Group>
        <Button
          size="compact-xs"
          variant="light"
          color="gray"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT))}
          style={{ flexShrink: 0 }}
        >
          {t('localMode.banner.signIn', 'Sign In')}
        </Button>
      </Group>
    </Paper>
  );
}
