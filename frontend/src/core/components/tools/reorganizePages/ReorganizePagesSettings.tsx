import { Divider, Select, Stack, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ReorganizePagesParameters } from '@app/hooks/tools/reorganizePages/useReorganizePagesParameters';
import { getReorganizePagesModeData } from '@app/components/tools/reorganizePages/constants';

export default function ReorganizePagesSettings({
  parameters,
  onParameterChange,
  disabled,
}: {
  parameters: ReorganizePagesParameters;
  onParameterChange: <K extends keyof ReorganizePagesParameters>(
    key: K,
    value: ReorganizePagesParameters[K]
  ) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const modeData = getReorganizePagesModeData(t);

  const requiresOrder = parameters.customMode === '' || parameters.customMode === 'DUPLICATE';
  const selectedMode = modeData.find(mode => mode.value === parameters.customMode) || modeData[0];
  return (
    <Stack gap="sm">
      <Select
        label={t('pdfOrganiser.mode._value', 'Organization mode')}
        data={modeData}
        value={parameters.customMode}
        onChange={(v) => onParameterChange('customMode', v ?? '')}
        disabled={disabled}
      />
      {selectedMode && (
        <div
          style={{
            backgroundColor: 'var(--information-text-bg)',
            color: 'var(--information-text-color)',
            padding: '8px 12px',
            borderRadius: '8px',
            marginTop: '4px',
            fontSize: '0.75rem',
            textAlign: 'center'
          }}
        >
          {selectedMode.description}
        </div>
      )}

      {requiresOrder && (
        <>
        <Divider/>
        <TextInput
          label={t('pageOrderPrompt', 'Page order / ranges')}
          placeholder={t('pdfOrganiser.placeholder', 'e.g. 1,3,2,4-6')}
          value={parameters.pageNumbers}
          onChange={(e) => onParameterChange('pageNumbers', e.currentTarget.value)}
          disabled={disabled}
        />
        </>
      )}
    </Stack>
  );
}


