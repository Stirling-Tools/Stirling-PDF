import { Divider, Select, Stack, Switch, NumberInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PageLayoutParameters } from '@app/hooks/tools/pageLayout/usePageLayoutParameters';
import { getPagesPerSheetOptions } from '@app/components/tools/pageLayout/constants';
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";
import ButtonSelector from '@app/components/shared/ButtonSelector';

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

  const pagesPerSheetOptions = getPagesPerSheetOptions(t);
  const selectedPagesPerSheetOption = pagesPerSheetOptions.find((o) => o.value === parameters.pagesPerSheet) || pagesPerSheetOptions[0];


  return (
    <Stack gap="sm">
      <ButtonSelector
        label={'Mode'}
        options={[
          {value: "DEFAULT", label: 'Default'},
          {value: "CUSTOM", label: 'Custom'}
        ]}
        value={String(parameters.mode)}
        onChange={(v) => {
          if (v ===  "CUSTOM" || v === "DEFAULT") {
            onParameterChange('mode', v)
          }
        }}
        disabled={disabled}
      />

      {parameters.mode === "DEFAULT" && <>
        <Select
          label={t('pageLayout.pagesPerSheet', 'Pages per sheet:')}
          data={pagesPerSheetOptions.map(o => ({ value: String(o.value), label: o.label }))}
          value={String(parameters.pagesPerSheet)}
          onChange={(v) => onParameterChange('pagesPerSheet', Number(v))}
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
        />
        {selectedPagesPerSheetOption && (
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
            {selectedPagesPerSheetOption.description}
          </div>
        )}
      </>}

      {parameters.mode === "CUSTOM" && <>
        <NumberInput
          label={t('pageLayout.rows', 'Rows')}
          placeholder="Enter rows"
          value={parameters.rows}
          onChange={(v) => onParameterChange('rows', Number(v))}
          min={1}
          disabled={disabled}
          style={{ flex: 1 }}
        />

        <NumberInput
          label={t('pageLayout.cols', 'Columns')}
          placeholder="Enter columns"
          value={parameters.cols}
          onChange={(v) => onParameterChange('cols', Number(v))}
          min={1}
          disabled={disabled}
          style={{ flex: 1 }}
        />
      </>}

      <Divider />

      <Select
        label={t('pageLayout.orientation', 'Orientation:')}
        data={[
          { value: 'PORTRAIT', label: t('pageLayout.orientation.portrait', 'Portrait') },
          { value: 'LANDSCAPE', label: t('pageLayout.orientation.landscape', 'Landscape') },
        ]}
        value={String(parameters.orientation)}
        onChange={(v) => {
          if (v === "PORTRAIT" || v == "LANDSCAPE") {
            onParameterChange('orientation', v)
          }
        }}
        disabled={disabled}
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />

      <Divider />

      <Select
        label={t('pageLayout.arrangement', 'Page arrangement:')}
        data={[
          { value: 'BY_ROWS', label: t('pageLayout.arrangement.byRows', 'By Rows') },
          { value: 'BY_COLUMNS', label: t('pageLayout.arrangement.byColumns', 'By Columns') },
        ]}
        value={String(parameters.arrangement)}
        onChange={(v) => {
          if (v === "BY_COLUMNS" || v == "BY_ROWS") {
            onParameterChange('arrangement', v)
          }
        }}
        disabled={disabled}
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />

      <Select
        label={t('pageLayout.readingDirection', 'Reading Direction:')}
        data={[
          { value: 'LTR', label: t('pageLayout.readingDirection.ltr', 'Left to Right') },
          { value: 'RTL', label: t('pageLayout.readingDirection.rtl', 'Right to Left') },
        ]}
        value={String(parameters.readingDirection)}
        onChange={(v) => {
          if (v === "LTR" || v == "RTL") {
            onParameterChange('readingDirection', v)
          }
        }}
        disabled={disabled}
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />

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


