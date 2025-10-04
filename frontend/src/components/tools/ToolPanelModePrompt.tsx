import { useEffect, useState } from 'react';
import { Badge, Button, Card, Group, Modal, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow, TOOL_PANEL_MODE_KEY } from '../../contexts/ToolWorkflowContext';
import './ToolPanelModePrompt.css';

type ToolPanelModeOption = 'sidebar' | 'fullscreen';

const PROMPT_STORAGE_KEY = 'toolPanelModePromptSeen';

const ToolPanelModePrompt = () => {
  const { t } = useTranslation();
  const { toolPanelMode, setToolPanelMode } = useToolWorkflow();
  const [opened, setOpened] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasSeenPrompt = window.localStorage.getItem(PROMPT_STORAGE_KEY);
    const hasStoredPreference = window.localStorage.getItem(TOOL_PANEL_MODE_KEY);
    if (!hasSeenPrompt && !hasStoredPreference) {
      setOpened(true);
    }
    setHydrated(true);
  }, []);

  const persistPromptState = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PROMPT_STORAGE_KEY, 'true');
    }
  };

  const handleClose = () => {
    persistPromptState();
    setOpened(false);
  };

  const handleSelect = (mode: ToolPanelModeOption) => {
    setToolPanelMode(mode);
    persistPromptState();
    setOpened(false);
  };

  if (!hydrated) {
    return null;
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="lg"
      centered
      title={t('toolPanel.modePrompt.title', 'Choose your tools view')}
      overlayProps={{ blur: 4, opacity: 0.45 }}
    >
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {t('toolPanel.modePrompt.description', 'Preview both layouts and choose how you want to explore Stirling PDF tools.')}
        </Text>
        <div className="tool-panel-mode-prompt__previews">
          <Card shadow="lg" padding="md" radius="lg" withBorder className="tool-panel-mode-prompt__card tool-panel-mode-prompt__card--recommended">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={600}>{t('toolPanel.modePrompt.advancedTitle', 'Advanced sidebar')}</Text>
                <Badge color="pink" variant="filled">
                  {t('toolPanel.modePrompt.advancedBadge', 'Recommended')}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {t('toolPanel.modePrompt.advancedDescription', 'Stay in the enhanced sidebar with quick access to tools alongside your workspace.')}
              </Text>
              <div className="tool-panel-mode-prompt__preview tool-panel-mode-prompt__preview--sidebar" aria-hidden>
                <div className="tool-panel-mode-prompt__preview-sidebar" />
                <div className="tool-panel-mode-prompt__preview-canvas" />
              </div>
              <Button
                variant={toolPanelMode === 'sidebar' ? 'filled' : 'outline'}
                color="pink"
                onClick={() => handleSelect('sidebar')}
                aria-label={t('toolPanel.modePrompt.chooseAdvanced', 'Use advanced sidebar mode')}
              >
                {t('toolPanel.modePrompt.chooseAdvanced', 'Use advanced sidebar mode')}
              </Button>
            </Stack>
          </Card>
          <Card shadow="sm" padding="md" radius="lg" withBorder className="tool-panel-mode-prompt__card">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={600}>{t('toolPanel.modePrompt.legacyTitle', 'Legacy fullscreen')}</Text>
                <Badge color="gray" variant="light">
                  {t('toolPanel.modePrompt.legacyBadge', 'Not recommended')}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {t('toolPanel.modePrompt.legacyDescription', 'Open a fullscreen catalog of tools that hides the workspace until a tool is chosen.')}
              </Text>
              <div className="tool-panel-mode-prompt__preview tool-panel-mode-prompt__preview--fullscreen" aria-hidden>
                <div className="tool-panel-mode-prompt__preview-grid">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <Button
                variant={toolPanelMode === 'fullscreen' ? 'filled' : 'outline'}
                onClick={() => handleSelect('fullscreen')}
                aria-label={t('toolPanel.modePrompt.chooseLegacy', 'Use legacy fullscreen mode')}
              >
                {t('toolPanel.modePrompt.chooseLegacy', 'Use legacy fullscreen mode')}
              </Button>
            </Stack>
          </Card>
        </div>
        <Button variant="subtle" color="gray" onClick={handleClose} aria-label={t('toolPanel.modePrompt.dismiss', 'Maybe later')}>
          {t('toolPanel.modePrompt.dismiss', 'Maybe later')}
        </Button>
      </Stack>
    </Modal>
  );
};

export default ToolPanelModePrompt;
