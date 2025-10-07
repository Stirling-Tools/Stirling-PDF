import { ActionIcon, Drawer, Radio, SegmentedControl, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { useState } from 'react';

export interface FullscreenToolStyleSettings {
  iconBackground: 'none' | 'hover' | 'always';
  iconColorScheme: 'colored' | 'vibrant' | 'monochrome';
  sectionTitleColor: 'colored' | 'neutral';
  headerIconColor: 'colored' | 'monochrome';
  headerBadgeColor: 'colored' | 'neutral';
  toolItemBorder: 'visible' | 'hidden';
  hoverIntensity: 'subtle' | 'moderate' | 'prominent';
}

export const defaultFullscreenToolSettings: FullscreenToolStyleSettings = {
  iconBackground: 'always',
  iconColorScheme: 'colored',
  sectionTitleColor: 'colored',
  headerIconColor: 'colored',
  headerBadgeColor: 'colored',
  toolItemBorder: 'visible',
  hoverIntensity: 'moderate',
};

interface FullscreenToolSettingsProps {
  settings: FullscreenToolStyleSettings;
  onChange: (settings: FullscreenToolStyleSettings) => void;
}

const FullscreenToolSettings = ({ settings, onChange }: FullscreenToolSettingsProps) => {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);

  const updateSetting = <K extends keyof FullscreenToolStyleSettings>(
    key: K,
    value: FullscreenToolStyleSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <>
      <ActionIcon
        variant="subtle"
        radius="xl"
        size="md"
        onClick={() => setOpened(true)}
        aria-label={t('toolPanel.fullscreen.settings.title', 'Customize appearance')}
        style={{ color: 'var(--right-rail-icon)' }}
      >
        <TuneRoundedIcon fontSize="small" />
      </ActionIcon>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title={t('toolPanel.fullscreen.settings.title', 'Customize appearance')}
        position="right"
        size="md"
        styles={{
          root: { zIndex: 1300 },
          overlay: { zIndex: 1300 },
          inner: { zIndex: 1300 },
        }}
      >
        <Stack gap="xl">
          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.fullscreen.settings.iconBackground.label', 'Tool icon background')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.fullscreen.settings.iconBackground.description', 'When to show colored backgrounds behind tool icons')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.iconBackground}
              onChange={(value) => updateSetting('iconBackground', value as any)}
              data={[
                { label: t('toolPanel.fullscreen.settings.iconBackground.none', 'None'), value: 'none' },
                { label: t('toolPanel.fullscreen.settings.iconBackground.hover', 'On hover'), value: 'hover' },
                { label: t('toolPanel.fullscreen.settings.iconBackground.always', 'Always'), value: 'always' },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.fullscreen.settings.iconColor.label', 'Tool icon color')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.fullscreen.settings.iconColor.description', 'Color scheme for tool icons')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.iconColorScheme}
              onChange={(value) => updateSetting('iconColorScheme', value as any)}
              data={[
                { label: t('toolPanel.fullscreen.settings.iconColor.colored', 'Colored'), value: 'colored' },
                { label: t('toolPanel.fullscreen.settings.iconColor.vibrant', 'Vibrant'), value: 'vibrant' },
                { label: t('toolPanel.fullscreen.settings.iconColor.monochrome', 'Monochrome'), value: 'monochrome' },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.fullscreen.settings.sectionTitle.label', 'Section titles')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.fullscreen.settings.sectionTitle.description', 'Color for category section titles')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.sectionTitleColor}
              onChange={(value) => updateSetting('sectionTitleColor', value as any)}
              data={[
                { label: t('toolPanel.fullscreen.settings.sectionTitle.colored', 'Colored'), value: 'colored' },
                { label: t('toolPanel.fullscreen.settings.sectionTitle.neutral', 'Neutral'), value: 'neutral' },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.fullscreen.settings.headerIcon.label', 'Section header icons')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.fullscreen.settings.headerIcon.description', 'Color for Favorites/Recent icons')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.headerIconColor}
              onChange={(value) => updateSetting('headerIconColor', value as any)}
              data={[
                { label: t('toolPanel.fullscreen.settings.headerIcon.colored', 'Colored'), value: 'colored' },
                { label: t('toolPanel.fullscreen.settings.headerIcon.monochrome', 'Monochrome'), value: 'monochrome' },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.fullscreen.settings.headerBadge.label', 'Section header badges')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.fullscreen.settings.headerBadge.description', 'Color for count badges in section headers')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.headerBadgeColor}
              onChange={(value) => updateSetting('headerBadgeColor', value as any)}
              data={[
                { label: t('toolPanel.fullscreen.settings.headerBadge.colored', 'Colored'), value: 'colored' },
                { label: t('toolPanel.fullscreen.settings.headerBadge.neutral', 'Neutral'), value: 'neutral' },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.fullscreen.settings.border.label', 'Tool item borders')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.fullscreen.settings.border.description', 'Show borders around tool items')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.toolItemBorder}
              onChange={(value) => updateSetting('toolItemBorder', value as any)}
              data={[
                { label: t('toolPanel.fullscreen.settings.border.visible', 'Visible'), value: 'visible' },
                { label: t('toolPanel.fullscreen.settings.border.hidden', 'Hidden'), value: 'hidden' },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.fullscreen.settings.hover.label', 'Hover effect intensity')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.fullscreen.settings.hover.description', 'How prominent the hover effect should be')}
            </Text>
            <Radio.Group
              value={settings.hoverIntensity}
              onChange={(value) => updateSetting('hoverIntensity', value as any)}
            >
              <Stack gap="xs">
                <Radio value="subtle" label={t('toolPanel.fullscreen.settings.hover.subtle', 'Subtle')} />
                <Radio value="moderate" label={t('toolPanel.fullscreen.settings.hover.moderate', 'Moderate')} />
                <Radio value="prominent" label={t('toolPanel.fullscreen.settings.hover.prominent', 'Prominent')} />
              </Stack>
            </Radio.Group>
          </div>
        </Stack>
      </Drawer>
    </>
  );
};

export default FullscreenToolSettings;


