import { Divider, Stack, NumberInput, Switch } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PageLayoutParameters } from '@app/hooks/tools/pageLayout/usePageLayoutParameters';

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

  return (
    <Stack gap="sm">
      <NumberInput
        label={t('pageLayout.top', 'Top Margin')}
        placeholder="Enter top margin"
        value={parameters.topMargin}
        onChange={(v) => onParameterChange('topMargin', Number(v))}
        min={0}
        disabled={disabled}
        style={{ flex: 1 }}
      />
      <NumberInput
        label={t('pageLayout.bottom', 'Bottom Margin')}
        placeholder="Enter bottom margin"
        value={parameters.bottomMargin}
        onChange={(v) => onParameterChange('bottomMargin', Number(v))}
        min={0}
        disabled={disabled}
        style={{ flex: 1 }}
      />
      <NumberInput
        label={t('pageLayout.left', 'Left Margin')}
        placeholder="Enter left margin"
        value={parameters.leftMargin}
        onChange={(v) => onParameterChange('leftMargin', Number(v))}
        min={0}
        disabled={disabled}
      />
      <NumberInput
        label={t('pageLayout.right', 'Right Margin')}
        placeholder="Enter right margin"
        value={parameters.rightMargin}
        onChange={(v) => onParameterChange('rightMargin', Number(v))}
        min={0}
        disabled={disabled}
        style={{ flex: 1 }}
      />
      <NumberInput
        label={t('pageLayout.innerMargin', 'Inner Margin')}
        placeholder="Enter inner margin"
        value={parameters.innerMargin}
        onChange={(v) => onParameterChange('innerMargin', Number(v))}
        min={0}
        disabled={disabled}
        style={{ flex: 1 }}
      />

    <Divider />

    <Switch
      checked={parameters.addBorder}
      onChange={(e) => onParameterChange('addBorder', e.currentTarget.checked)}
      label={t('pageLayout.addBorder', 'Add Borders')}
      disabled={disabled}
    />

    {parameters.addBorder && (
      <NumberInput
        label={t('pageLayout.borderWidth', 'Border Thickness')}
        placeholder="Enter border thickness"
        value={parameters.borderWidth}
        onChange={(v) => onParameterChange('borderWidth', Number(v))}
        min={1}
        disabled={disabled}
        style={{ flex: 1 }}
      />
    )}

    </Stack>
  );
}


