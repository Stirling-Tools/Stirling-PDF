import { useEffect, useState } from 'react';
import { Badge, Button, Card, Group, Modal, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { usePreferences } from '@app/contexts/PreferencesContext';
import '@app/components/tools/ToolPanelModePrompt.css';
import { type ToolPanelMode } from '@app/constants/toolPanel';

interface ToolPanelModePromptProps {
  onComplete?: () => void;
  /** If true, the modal will be forced open (used by orchestrator) */
  forceOpen?: boolean;
}

/**
 * ToolPanelModePrompt - Lets users choose between sidebar and fullscreen tool modes
 * 
 * The orchestrator controls this via forceOpen prop. When shown standalone (legacy),
 * it uses internal state based on preferences.
 */
const ToolPanelModePrompt = ({ onComplete, forceOpen }: ToolPanelModePromptProps = {}) => {
  const { t } = useTranslation();
  const { toolPanelMode, setToolPanelMode } = useToolWorkflow();
  const { preferences, updatePreference } = usePreferences();
  const [internalOpened, setInternalOpened] = useState(false);

  // Only show after the intro onboarding has been completed (legacy standalone mode)
  const shouldShowPrompt = !preferences.toolPanelModePromptSeen && preferences.hasSeenIntroOnboarding;

  useEffect(() => {
    if (shouldShowPrompt && forceOpen === undefined) {
      setInternalOpened(true);
    }
  }, [shouldShowPrompt, forceOpen]);

  // If forceOpen is provided, use it; otherwise use internal state
  const opened = forceOpen ?? internalOpened;
  const setOpened = forceOpen !== undefined ? () => {} : setInternalOpened;

  const handleSelect = (mode: ToolPanelMode) => {
    setToolPanelMode(mode);
    updatePreference('defaultToolPanelMode', mode);
    updatePreference('toolPanelModePromptSeen', true);
    updatePreference('hasSelectedToolPanelMode', true);
    setOpened(false);
    onComplete?.();
  };

  const handleDismiss = () => {
    const defaultMode: ToolPanelMode = 'sidebar';
    if (toolPanelMode !== defaultMode) {
      setToolPanelMode(defaultMode);
      updatePreference('defaultToolPanelMode', defaultMode);
    }
    updatePreference('hasSelectedToolPanelMode', true);
    updatePreference('toolPanelModePromptSeen', true);
    setOpened(false);
    onComplete?.();
  };

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
                <Text fw={600}>{t('toolPanel.modePrompt.sidebarTitle', 'Sidebar mode')}</Text>
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
                {t('toolPanel.modePrompt.chooseSidebar', 'Use sidebar mode')}
              </Button>
            </Stack>
          </Card>
          <Card withBorder radius="lg" shadow="xs" padding="lg" className="tool-panel-mode-prompt__card">
            <Stack gap="md" className="tool-panel-mode-prompt__card-content">
              <Stack gap={2}>
                <Text fw={600}>{t('toolPanel.modePrompt.fullscreenTitle', 'Fullscreen mode')}</Text>
                <Text size="sm" c="dimmed">
                  {t('toolPanel.modePrompt.fullscreenDescription', 'Browse every tool in a catalogue that covers the workspace until you pick one.')}
                </Text>
              </Stack>
              <div className="tool-panel-mode-prompt__preview tool-panel-mode-prompt__preview--fullscreen" aria-hidden>
                <div className="tool-panel-mode-prompt__fullscreen-columns">
                  <div className="tool-panel-mode-prompt__fullscreen-column">
                    <span className="tool-panel-mode-prompt__fullscreen-card" />
                    <span className="tool-panel-mode-prompt__fullscreen-card" />
                    <span className="tool-panel-mode-prompt__fullscreen-card tool-panel-mode-prompt__fullscreen-card--muted" />
                  </div>
                  <div className="tool-panel-mode-prompt__fullscreen-column">
                    <span className="tool-panel-mode-prompt__fullscreen-card" />
                    <span className="tool-panel-mode-prompt__fullscreen-card" />
                    <span className="tool-panel-mode-prompt__fullscreen-card tool-panel-mode-prompt__fullscreen-card--muted" />
                  </div>
                  <div className="tool-panel-mode-prompt__fullscreen-column">
                    <span className="tool-panel-mode-prompt__fullscreen-card" />
                    <span className="tool-panel-mode-prompt__fullscreen-card" />
                    <span className="tool-panel-mode-prompt__fullscreen-card tool-panel-mode-prompt__fullscreen-card--muted" />
                  </div>
                </div>
              </div>
              <Button
                variant={toolPanelMode === 'fullscreen' ? 'filled' : 'outline'}
                color="blue"
                radius="md"
                className="tool-panel-mode-prompt__action"
                onClick={() => handleSelect('fullscreen')}
              >
                {t('toolPanel.modePrompt.chooseFullscreen', 'Use fullscreen mode')}
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
