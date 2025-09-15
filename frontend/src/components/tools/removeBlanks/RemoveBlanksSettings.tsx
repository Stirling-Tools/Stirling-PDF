import { Stack, Text, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import NumberInputWithUnit from "../shared/NumberInputWithUnit";
import { RemoveBlanksParameters } from "../../../hooks/tools/removeBlanks/useRemoveBlanksParameters";

interface RemoveBlanksSettingsProps {
  parameters: RemoveBlanksParameters;
  onParameterChange: <K extends keyof RemoveBlanksParameters>(key: K, value: RemoveBlanksParameters[K]) => void;
  disabled?: boolean;
}

const RemoveBlanksSettings = ({ parameters, onParameterChange, disabled = false }: RemoveBlanksSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <NumberInputWithUnit
          label={t('removeBlanks.threshold.label', 'Pixel Whiteness Threshold')}
          value={parameters.threshold}
          onChange={(v) => onParameterChange('threshold', typeof v === 'string' ? Number(v) : v)}
          unit={t('removeBlanks.threshold.unit', '')}
          min={0}
          max={255}
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {t('removeBlanks.threshold.desc', "Threshold for determining how white a white pixel must be to be classed as 'White'. 0 = Black, 255 pure white.")}
        </Text>
      </Stack>

      <Stack gap="xs">
        <NumberInputWithUnit
          label={t('removeBlanks.whitePercent.label', 'White Percent')}
          value={parameters.whitePercent}
          onChange={(v) => onParameterChange('whitePercent', typeof v === 'string' ? Number(v) : v)}
          unit={t('removeBlanks.whitePercent.unit', '%')}
          min={0.1}
          max={100}
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {t('removeBlanks.whitePercent.desc', "Percent of page that must be 'white' pixels to be removed")}
        </Text>
      </Stack>

      <Stack gap="xs">
        <Checkbox
          checked={parameters.includeBlankPages}
          onChange={(event) => onParameterChange('includeBlankPages', event.currentTarget.checked)}
          disabled={disabled}
          label={
            <div>
              <Text size="sm">{t('removeBlanks.includeBlankPages.label', 'Include detected blank pages')}</Text>
              <Text size="xs" c="dimmed">
                {t('removeBlanks.includeBlankPages.desc', 'Include the detected blank pages as a separate PDF in the output')}
              </Text>
            </div>
          }
        />
      </Stack>
    </Stack>
  );
};

export default RemoveBlanksSettings;


