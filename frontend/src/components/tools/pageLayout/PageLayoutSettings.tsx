import { Divider, Select, Stack, Switch, SegmentedControl, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PageLayoutParameters } from '../../../hooks/tools/pageLayout/usePageLayoutParameters';
import { getPagesPerSheetOptions } from './constants';

export default function PageLayoutSettings({
  parameters,
  onParameterChange,
  disabled,
}: {
  parameters: PageLayoutParameters;
  onParameterChange: <K extends keyof PageLayoutParameters>(
    key: K,
    value: PageLayoutParameters[K]
  ) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  const options = getPagesPerSheetOptions(t);
  const selected = options.find((o) => o.value === parameters.pagesPerSheet) || options[0];

  return (
    <Stack gap="sm">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('pageLayout.processingMode.label', 'Processing mode')}
        </Text>
        <SegmentedControl
          value={parameters.processingMode}
          onChange={(value) => onParameterChange('processingMode', value as PageLayoutParameters['processingMode'])}
          data={[
            { label: t('pageLayout.processingMode.backend', 'Backend'), value: 'backend' },
            { label: t('pageLayout.processingMode.frontend', 'Browser'), value: 'frontend' }
          ]}
          fullWidth
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.processingMode === 'frontend'
            ? t('pageLayout.processingMode.frontendDescription', 'Lay out pages directly in your browser for quick previews.')
            : t('pageLayout.processingMode.backendDescription', 'Use the server for large documents or advanced layouts.')}
        </Text>
      </Stack>

      <Select
        label={t('pageLayout.pagesPerSheet', 'Pages per sheet:')}
        data={options.map(o => ({ value: String(o.value), label: o.label }))}
        value={String(parameters.pagesPerSheet)}
        onChange={(v) => onParameterChange('pagesPerSheet', Number(v))}
        disabled={disabled}
      />

      {selected && (
        <div
          style={{
            backgroundColor: 'var(--information-text-bg)',
            color: 'var(--information-text-color)',
            padding: '8px 12px',
            borderRadius: '8px',
            marginTop: '4px',
            fontSize: '0.75rem',
            textAlign: 'center',
          }}
        >
          {selected.description}
        </div>
      )}

      <Divider />

      <Switch
        checked={parameters.addBorder}
        onChange={(e) => onParameterChange('addBorder', e.currentTarget.checked)}
        label={t('pageLayout.addBorder', 'Add Borders')}
        disabled={disabled}
      />
    </Stack>
  );
}


