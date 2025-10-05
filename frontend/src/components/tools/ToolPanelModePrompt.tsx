import { useEffect, useState } from 'react';
import { Badge, Button, Card, Group, Modal, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow, TOOL_PANEL_MODE_STORAGE_KEY } from '../../contexts/ToolWorkflowContext';
import './ToolPanelModePrompt.css';

type ToolPanelModeOption = 'sidebar' | 'legacy';

const PROMPT_SEEN_KEY = 'toolPanelModePromptSeen';

const ToolPanelModePrompt = () => {
  const { t } = useTranslation();
  const { toolPanelMode, setToolPanelMode } = useToolWorkflow();
  const [opened, setOpened] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const hasSeenPrompt = window.localStorage.getItem(PROMPT_SEEN_KEY);
    const storedPreference = window.localStorage.getItem(TOOL_PANEL_MODE_STORAGE_KEY);

    if (!hasSeenPrompt && !storedPreference) {
      setOpened(true);
    }

    setHydrated(true);
  }, []);

  const persistSeen = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PROMPT_SEEN_KEY, 'true');
  };

  const handleSelect = (mode: ToolPanelModeOption) => {
    setToolPanelMode(mode);
    persistSeen();
    setOpened(false);
  };

  const handleDismiss = () => {
    persistSeen();
    setOpened(false);
  };

  if (!hydrated) {
    return null;
  }

  return (
    <Modal
      opened={opened}
      onClose={handleDismiss}
      centered
      size="xl"
      radius="lg"
      overlayProps={{ blur: 6, opacity: 0.35 }}
      classNames={{ content: 'tool-panel-mode-prompt__modal' }}
      title={t('toolPanel.modePrompt.title', 'Choose how you browse tools')}
    >
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {t('toolPanel.modePrompt.description', 'Preview both layouts and decide how you want to explore Stirling PDF tools.')}
        </Text>
        <div className="tool-panel-mode-prompt__options">
          <Card withBorder radius="lg" shadow="sm" padding="lg" className="tool-panel-mode-prompt__card tool-panel-mode-prompt__card--sidebar">
            <Stack gap="md" className="tool-panel-mode-prompt__card-content">
              <Group justify="space-between">
                <Stack gap={2}>
                  <Text fw={600}>{t('toolPanel.modePrompt.sidebarTitle', 'Advanced sidebar')}</Text>
                  <Text size="sm" c="dimmed">
                    {t('toolPanel.modePrompt.sidebarDescription', 'Keep tools alongside your workspace for quick switching.')}
                  </Text>
                </Stack>
                <Badge color="blue" variant="filled">
                  {t('toolPanel.modePrompt.recommended', 'Recommended')}
                </Badge>
              </Group>
              <div className="tool-panel-mode-prompt__preview tool-panel-mode-prompt__preview--sidebar" aria-hidden>
                <div className="tool-panel-mode-prompt__sidebar-panel">
                  <span className="tool-panel-mode-prompt__sidebar-search" />
                  <span className="tool-panel-mode-prompt__sidebar-item" />
                  <span className="tool-panel-mode-prompt__sidebar-item" />
                  <span className="tool-panel-mode-prompt__sidebar-item" />
                  <span className="tool-panel-mode-prompt__sidebar-item tool-panel-mode-prompt__sidebar-item--muted" />
                </div>
                <div className="tool-panel-mode-prompt__workspace" aria-hidden>
                  <div className="tool-panel-mode-prompt__workspace-page" />
                  <div className="tool-panel-mode-prompt__workspace-page tool-panel-mode-prompt__workspace-page--secondary" />
                </div>
              </div>
              <Button
                variant={toolPanelMode === 'sidebar' ? 'filled' : 'light'}
                color="blue"
                radius="md"
                className="tool-panel-mode-prompt__action"
                onClick={() => handleSelect('sidebar')}
              >
                {t('toolPanel.modePrompt.chooseSidebar', 'Use advanced sidebar')}
              </Button>
            </Stack>
          </Card>
          <Card withBorder radius="lg" shadow="xs" padding="lg" className="tool-panel-mode-prompt__card">
            <Stack gap="md" className="tool-panel-mode-prompt__card-content">
              <Stack gap={2}>
                <Text fw={600}>{t('toolPanel.modePrompt.legacyTitle', 'Legacy fullscreen')}</Text>
                <Text size="sm" c="dimmed">
                  {t('toolPanel.modePrompt.legacyDescription', 'Browse every tool in a catalogue that covers the workspace until you pick one.')}
                </Text>
              </Stack>
              <div className="tool-panel-mode-prompt__preview tool-panel-mode-prompt__preview--legacy" aria-hidden>
                <div className="tool-panel-mode-prompt__legacy-columns">
                  <div className="tool-panel-mode-prompt__legacy-column">
                    <span className="tool-panel-mode-prompt__legacy-card" />
                    <span className="tool-panel-mode-prompt__legacy-card" />
                    <span className="tool-panel-mode-prompt__legacy-card tool-panel-mode-prompt__legacy-card--muted" />
                  </div>
                  <div className="tool-panel-mode-prompt__legacy-column">
                    <span className="tool-panel-mode-prompt__legacy-card" />
                    <span className="tool-panel-mode-prompt__legacy-card" />
                    <span className="tool-panel-mode-prompt__legacy-card tool-panel-mode-prompt__legacy-card--muted" />
                  </div>
                  <div className="tool-panel-mode-prompt__legacy-column">
                    <span className="tool-panel-mode-prompt__legacy-card" />
                    <span className="tool-panel-mode-prompt__legacy-card" />
                    <span className="tool-panel-mode-prompt__legacy-card tool-panel-mode-prompt__legacy-card--muted" />
                  </div>
                </div>
              </div>
              <Button
                variant={toolPanelMode === 'legacy' ? 'filled' : 'outline'}
                color="blue"
                radius="md"
                className="tool-panel-mode-prompt__action"
                onClick={() => handleSelect('legacy')}
              >
                {t('toolPanel.modePrompt.chooseLegacy', 'Use legacy fullscreen')}
              </Button>
            </Stack>
          </Card>
        </div>
        <Button
          variant="subtle"
          color="gray"
          radius="md"
          className="tool-panel-mode-prompt__maybe-later"
          onClick={handleDismiss}
        >
          {t('toolPanel.modePrompt.dismiss', 'Maybe later')}
        </Button>
      </Stack>
    </Modal>
  );
};

export default ToolPanelModePrompt;
