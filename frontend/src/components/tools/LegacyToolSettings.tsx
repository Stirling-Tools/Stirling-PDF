import { ActionIcon, Drawer, Radio, SegmentedControl, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { useState } from 'react';

export interface LegacyToolStyleSettings {
  iconBackground: 'none' | 'hover' | 'always';
  iconColorScheme: 'colored' | 'vibrant' | 'monochrome';
  sectionTitleColor: 'colored' | 'neutral';
  headerIconColor: 'colored' | 'monochrome';
  headerBadgeColor: 'colored' | 'neutral';
  toolItemBorder: 'visible' | 'hidden';
  hoverIntensity: 'subtle' | 'moderate' | 'prominent';
}

export const defaultLegacyToolSettings: LegacyToolStyleSettings = {
  iconBackground: 'always',
  iconColorScheme: 'colored',
  sectionTitleColor: 'colored',
  headerIconColor: 'colored',
  headerBadgeColor: 'colored',
  toolItemBorder: 'visible',
  hoverIntensity: 'moderate',
};

interface LegacyToolSettingsProps {
  settings: LegacyToolStyleSettings;
  onChange: (settings: LegacyToolStyleSettings) => void;
}

const LegacyToolSettings = ({ settings, onChange }: LegacyToolSettingsProps) => {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);

  const updateSetting = <K extends keyof LegacyToolStyleSettings>(
    key: K,
    value: LegacyToolStyleSettings[K]
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
        aria-label={t('toolPanel.legacy.settings.title', 'Customize appearance')}
      >
        <TuneRoundedIcon fontSize="small" />
      </ActionIcon>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title={t('toolPanel.legacy.settings.title', 'Customize appearance')}
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
              {t('toolPanel.legacy.settings.iconBackground.label', 'Tool icon background')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.legacy.settings.iconBackground.description', 'When to show colored backgrounds behind tool icons')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.iconBackground}
              onChange={(value) => updateSetting('iconBackground', value as any)}
              data={[
                {
                  label: t('toolPanel.legacy.settings.iconBackground.none', 'None'),
                  value: 'none',
                },
                {
                  label: t('toolPanel.legacy.settings.iconBackground.hover', 'On hover'),
                  value: 'hover',
                },
                {
                  label: t('toolPanel.legacy.settings.iconBackground.always', 'Always'),
                  value: 'always',
                },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.legacy.settings.iconColor.label', 'Tool icon color')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.legacy.settings.iconColor.description', 'Color scheme for tool icons')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.iconColorScheme}
              onChange={(value) => updateSetting('iconColorScheme', value as any)}
              data={[
                {
                  label: t('toolPanel.legacy.settings.iconColor.colored', 'Colored'),
                  value: 'colored',
                },
                {
                  label: t('toolPanel.legacy.settings.iconColor.vibrant', 'Vibrant'),
                  value: 'vibrant',
                },
                {
                  label: t('toolPanel.legacy.settings.iconColor.monochrome', 'Monochrome'),
                  value: 'monochrome',
                },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.legacy.settings.sectionTitle.label', 'Section titles')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.legacy.settings.sectionTitle.description', 'Color for category section titles')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.sectionTitleColor}
              onChange={(value) => updateSetting('sectionTitleColor', value as any)}
              data={[
                {
                  label: t('toolPanel.legacy.settings.sectionTitle.colored', 'Colored'),
                  value: 'colored',
                },
                {
                  label: t('toolPanel.legacy.settings.sectionTitle.neutral', 'Neutral'),
                  value: 'neutral',
                },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.legacy.settings.headerIcon.label', 'Section header icons')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.legacy.settings.headerIcon.description', 'Color for Favorites/Recent icons')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.headerIconColor}
              onChange={(value) => updateSetting('headerIconColor', value as any)}
              data={[
                {
                  label: t('toolPanel.legacy.settings.headerIcon.colored', 'Colored'),
                  value: 'colored',
                },
                {
                  label: t('toolPanel.legacy.settings.headerIcon.monochrome', 'Monochrome'),
                  value: 'monochrome',
                },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.legacy.settings.headerBadge.label', 'Section header badges')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.legacy.settings.headerBadge.description', 'Color for count badges in section headers')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.headerBadgeColor}
              onChange={(value) => updateSetting('headerBadgeColor', value as any)}
              data={[
                {
                  label: t('toolPanel.legacy.settings.headerBadge.colored', 'Colored'),
                  value: 'colored',
                },
                {
                  label: t('toolPanel.legacy.settings.headerBadge.neutral', 'Neutral'),
                  value: 'neutral',
                },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.legacy.settings.border.label', 'Tool item borders')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.legacy.settings.border.description', 'Show borders around tool items')}
            </Text>
            <SegmentedControl
              fullWidth
              value={settings.toolItemBorder}
              onChange={(value) => updateSetting('toolItemBorder', value as any)}
              data={[
                {
                  label: t('toolPanel.legacy.settings.border.visible', 'Visible'),
                  value: 'visible',
                },
                {
                  label: t('toolPanel.legacy.settings.border.hidden', 'Hidden'),
                  value: 'hidden',
                },
              ]}
            />
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              {t('toolPanel.legacy.settings.hover.label', 'Hover effect intensity')}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t('toolPanel.legacy.settings.hover.description', 'How prominent the hover effect should be')}
            </Text>
            <Radio.Group
              value={settings.hoverIntensity}
              onChange={(value) => updateSetting('hoverIntensity', value as any)}
            >
              <Stack gap="xs">
                <Radio
                  value="subtle"
                  label={t('toolPanel.legacy.settings.hover.subtle', 'Subtle')}
                />
                <Radio
                  value="moderate"
                  label={t('toolPanel.legacy.settings.hover.moderate', 'Moderate')}
                />
                <Radio
                  value="prominent"
                  label={t('toolPanel.legacy.settings.hover.prominent', 'Prominent')}
                />
              </Stack>
            </Radio.Group>
          </div>
        </Stack>
      </Drawer>
    </>
  );
};

export default LegacyToolSettings;
