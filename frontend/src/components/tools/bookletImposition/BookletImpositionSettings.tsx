import React from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, Divider } from "@mantine/core";
import { BookletImpositionParameters } from "../../../hooks/tools/bookletImposition/useBookletImpositionParameters";
import ButtonSelector from "../../shared/ButtonSelector";

interface BookletImpositionSettingsProps {
  parameters: BookletImpositionParameters;
  onParameterChange: (key: keyof BookletImpositionParameters, value: any) => void;
  disabled?: boolean;
}

const BookletImpositionSettings = ({ parameters, onParameterChange, disabled = false }: BookletImpositionSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Divider ml='-md'></Divider>
      
      {/* Booklet Type */}
      <Stack gap="sm">
        <ButtonSelector
          label={t('bookletImposition.bookletType.label', 'Booklet Type')}
          value={parameters.bookletType}
          onChange={(value) => onParameterChange('bookletType', value)}
          options={[
            { value: 'BOOKLET', label: t('bookletImposition.bookletType.standard', 'Standard Booklet') },
            { value: 'SIDE_STITCH_BOOKLET', label: t('bookletImposition.bookletType.sideStitch', 'Side-Stitch Booklet') }
          ]}
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.bookletType === 'BOOKLET'
            ? t('bookletImposition.bookletType.standardDesc', 'Standard booklet for saddle-stitched binding (fold in half)')
            : t('bookletImposition.bookletType.sideStitchDesc', 'Side-stitched booklet for binding along the edge')}
        </Text>
      </Stack>

      <Divider />

      {/* Pages Per Sheet */}
      <Stack gap="sm">
        <ButtonSelector
          label={t('bookletImposition.pagesPerSheet.label', 'Pages Per Sheet')}
          value={parameters.pagesPerSheet}
          onChange={(value) => onParameterChange('pagesPerSheet', value)}
          options={[
            { value: 2, label: t('bookletImposition.pagesPerSheet.two', '2 Pages') },
            { value: 4, label: t('bookletImposition.pagesPerSheet.four', '4 Pages') }
          ]}
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.pagesPerSheet === 2
            ? t('bookletImposition.pagesPerSheet.twoDesc', 'Two pages side by side on each sheet (most common)')
            : t('bookletImposition.pagesPerSheet.fourDesc', 'Four pages arranged in a 2x2 grid on each sheet')}
        </Text>
      </Stack>

      <Divider />

      {/* Page Orientation */}
      <Stack gap="sm">
        <ButtonSelector
          label={t('bookletImposition.pageOrientation.label', 'Page Orientation')}
          value={parameters.pageOrientation}
          onChange={(value) => onParameterChange('pageOrientation', value)}
          options={[
            { value: 'LANDSCAPE', label: t('bookletImposition.pageOrientation.landscape', 'Landscape') },
            { value: 'PORTRAIT', label: t('bookletImposition.pageOrientation.portrait', 'Portrait') }
          ]}
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.pageOrientation === 'LANDSCAPE'
            ? t('bookletImposition.pageOrientation.landscapeDesc', 'A4 landscape → A5 portrait when folded (recommended, standard booklet size)')
            : t('bookletImposition.pageOrientation.portraitDesc', 'A4 portrait → A6 when folded (smaller booklet)')}
        </Text>
      </Stack>

      <Divider />

      {/* Add Border Option */}
      <Stack gap="sm">
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--mantine-spacing-xs)' }}
          title={t('bookletImposition.addBorder.tooltip', 'Adds borders around each page section to help with cutting and alignment')}
        >
          <input
            type="checkbox"
            checked={parameters.addBorder}
            onChange={(e) => onParameterChange('addBorder', e.target.checked)}
            disabled={disabled}
          />
          <Text size="sm">{t('bookletImposition.addBorder.label', 'Add borders around pages')}</Text>
        </label>
        <Text size="xs" c="dimmed" style={{ marginLeft: 'var(--mantine-spacing-lg)' }}>
          {t('bookletImposition.addBorder.description', 'Helpful for cutting and alignment when printing')}
        </Text>
      </Stack>
    </Stack>
  );
};

export default BookletImpositionSettings;