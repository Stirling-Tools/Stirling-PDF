import { useTranslation } from "react-i18next";
import { Stack, Textarea, TextInput, Select, Button, Text, Divider } from "@mantine/core";
import { AddStampParameters } from "@app/components/tools/addStamp/useAddStampParameters";
import ButtonSelector from "@app/components/shared/ButtonSelector";
import styles from "@app/components/tools/addStamp/StampPreview.module.css";
import { getDefaultFontSizeForAlphabet } from "@app/components/tools/addStamp/StampPreviewUtils";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface StampSetupSettingsProps {
  parameters: AddStampParameters;
  onParameterChange: <K extends keyof AddStampParameters>(key: K, value: AddStampParameters[K]) => void;
  disabled?: boolean;
}

const StampSetupSettings = ({ parameters, onParameterChange, disabled = false }: StampSetupSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <TextInput
        label={t('pageSelectionPrompt', 'Page Selection (e.g. 1,3,2 or 4-8,2,10-12 or 2n-1)')}
        value={parameters.pageNumbers}
        onChange={(e) => onParameterChange('pageNumbers', e.currentTarget.value)}
        disabled={disabled}
      />
      <Divider/>
      <div>
        <Text size="sm" fw={500} mb="xs">{t('AddStampRequest.stampType', 'Stamp Type')}</Text>
        <ButtonSelector
          value={parameters.stampType}
          onChange={(v: 'text' | 'image') => onParameterChange('stampType', v)}
          options={[
            { value: 'text', label: t('watermark.type.1', 'Text') },
            { value: 'image', label: t('watermark.type.2', 'Image') },
          ]}
          disabled={disabled}
          buttonClassName={styles.modeToggleButton}
          textClassName={styles.modeToggleButtonText}
        />
      </div>

      {parameters.stampType === 'text' && (
        <>
          <Textarea
            label={t('AddStampRequest.stampText', 'Stamp Text')}
            value={parameters.stampText}
            onChange={(e) => onParameterChange('stampText', e.currentTarget.value)}
            autosize
            minRows={2}
            disabled={disabled}
          />
          <Select
            label={t('AddStampRequest.alphabet', 'Alphabet')}
            value={parameters.alphabet}
            onChange={(v) => {
              const nextAlphabet = (v as any) || 'roman';
              onParameterChange('alphabet', nextAlphabet);
              const nextDefault = getDefaultFontSizeForAlphabet(nextAlphabet);
              onParameterChange('fontSize', nextDefault);
            }}
            data={[
              { value: 'roman', label: 'Roman' },
              { value: 'arabic', label: 'العربية' },
              { value: 'japanese', label: '日本語' },
              { value: 'korean', label: '한국어' },
              { value: 'chinese', label: '简体中文' },
              { value: 'thai', label: 'ไทย' },
            ]}
            disabled={disabled}
            comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
          />
        </>
      )}

      {parameters.stampType === 'image' && (
        <Stack gap="xs">
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.bmp,.tiff,.tif,.webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onParameterChange('stampImage', file);
            }}
            disabled={disabled}
            style={{ display: 'none' }}
            id="stamp-image-input"
          />
          <Button
            size="xs"
            component="label"
            htmlFor="stamp-image-input"
            disabled={disabled}
          >
            {t('chooseFile', 'Choose File')}
          </Button>
          {parameters.stampImage && (
            <Stack gap="xs">
              <img
                src={URL.createObjectURL(parameters.stampImage)}
                alt="Selected stamp image"
                className="max-h-24 w-full object-contain border border-gray-200 rounded bg-gray-50"
              />
              <Text size="xs" c="dimmed">
                {parameters.stampImage.name}
              </Text>
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
};

export default StampSetupSettings;
