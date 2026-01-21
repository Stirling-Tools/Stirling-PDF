import { Divider, Select, Stack, Switch } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PageLayoutParameters } from '@app/hooks/tools/pageLayout/usePageLayoutParameters';
import { getPagesPerSheetOptions } from '@app/components/tools/pageLayout/constants';
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

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
      <Select
        label={t('pageLayout.pagesPerSheet', 'Pages per sheet:')}
        data={options.map(o => ({ value: String(o.value), label: o.label }))}
        value={String(parameters.pagesPerSheet)}
        onChange={(v) => onParameterChange('pagesPerSheet', Number(v))}
        disabled={disabled}
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
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


