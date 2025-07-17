import { Stack, TextInput, Select, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SPLIT_MODES, SPLIT_TYPES, type SplitMode, type SplitType } from '../../../constants/splitConstants';

export interface SplitParameters {
  pages: string;
  hDiv: string;
  vDiv: string;
  merge: boolean;
  splitType: SplitType | '';
  splitValue: string;
  bookmarkLevel: string;
  includeMetadata: boolean;
  allowDuplicates: boolean;
}

export interface SplitSettingsProps {
  mode: SplitMode | '';
  onModeChange: (mode: SplitMode | '') => void;
  parameters: SplitParameters;
  onParameterChange: (parameter: keyof SplitParameters, value: string | boolean) => void;
  disabled?: boolean;
}

const SplitSettings = ({
  mode,
  onModeChange,
  parameters,
  onParameterChange,
  disabled = false
}: SplitSettingsProps) => {
  const { t } = useTranslation();

  const renderByPagesForm = () => (
    <TextInput
      label={t("split.splitPages", "Pages")}
      placeholder={t("pageSelectionPrompt", "e.g. 1,3,5-10")}
      value={parameters.pages}
      onChange={(e) => onParameterChange('pages', e.target.value)}
      disabled={disabled}
    />
  );

  const renderBySectionsForm = () => (
    <Stack gap="sm">
      <TextInput
        label={t("split-by-sections.horizontal.label", "Horizontal Divisions")}
        type="number"
        min="0"
        max="300"
        value={parameters.hDiv}
        onChange={(e) => onParameterChange('hDiv', e.target.value)}
        placeholder={t("split-by-sections.horizontal.placeholder", "Enter number of horizontal divisions")}
        disabled={disabled}
      />
      <TextInput
        label={t("split-by-sections.vertical.label", "Vertical Divisions")}
        type="number"
        min="0"
        max="300"
        value={parameters.vDiv}
        onChange={(e) => onParameterChange('vDiv', e.target.value)}
        placeholder={t("split-by-sections.vertical.placeholder", "Enter number of vertical divisions")}
        disabled={disabled}
      />
      <Checkbox
        label={t("split-by-sections.merge", "Merge sections into one PDF")}
        checked={parameters.merge}
        onChange={(e) => onParameterChange('merge', e.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );

  const renderBySizeOrCountForm = () => (
    <Stack gap="sm">
      <Select
        label={t("split-by-size-or-count.type.label", "Split Type")}
        value={parameters.splitType}
        onChange={(v) => v && onParameterChange('splitType', v)}
        disabled={disabled}
        data={[
          { value: SPLIT_TYPES.SIZE, label: t("split-by-size-or-count.type.size", "By Size") },
          { value: SPLIT_TYPES.PAGES, label: t("split-by-size-or-count.type.pageCount", "By Page Count") },
          { value: SPLIT_TYPES.DOCS, label: t("split-by-size-or-count.type.docCount", "By Document Count") },
        ]}
      />
      <TextInput
        label={t("split-by-size-or-count.value.label", "Split Value")}
        placeholder={t("split-by-size-or-count.value.placeholder", "e.g. 10MB or 5 pages")}
        value={parameters.splitValue}
        onChange={(e) => onParameterChange('splitValue', e.target.value)}
        disabled={disabled}
      />
    </Stack>
  );

  const renderByChaptersForm = () => (
    <Stack gap="sm">
      <TextInput
        label={t("splitByChapters.bookmarkLevel", "Bookmark Level")}
        type="number"
        value={parameters.bookmarkLevel}
        onChange={(e) => onParameterChange('bookmarkLevel', e.target.value)}
        disabled={disabled}
      />
      <Checkbox
        label={t("splitByChapters.includeMetadata", "Include Metadata")}
        checked={parameters.includeMetadata}
        onChange={(e) => onParameterChange('includeMetadata', e.currentTarget.checked)}
        disabled={disabled}
      />
      <Checkbox
        label={t("splitByChapters.allowDuplicates", "Allow Duplicate Bookmarks")}
        checked={parameters.allowDuplicates}
        onChange={(e) => onParameterChange('allowDuplicates', e.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );

  return (
    <Stack gap="md">
      {/* Mode Selector */}
      <Select
        label="Choose split method"
        placeholder="Select how to split the PDF"
        value={mode}
        onChange={(v) => v && onModeChange(v)}
        disabled={disabled}
        data={[
          { value: SPLIT_MODES.BY_PAGES, label: t("split.header", "Split by Pages") + " (e.g. 1,3,5-10)" },
          { value: SPLIT_MODES.BY_SECTIONS, label: t("split-by-sections.title", "Split by Grid Sections") },
          { value: SPLIT_MODES.BY_SIZE_OR_COUNT, label: t("split-by-size-or-count.title", "Split by Size or Count") },
          { value: SPLIT_MODES.BY_CHAPTERS, label: t("splitByChapters.title", "Split by Chapters") },
        ]}
      />

      {/* Parameter Form */}
      {mode === SPLIT_MODES.BY_PAGES && renderByPagesForm()}
      {mode === SPLIT_MODES.BY_SECTIONS && renderBySectionsForm()}
      {mode === SPLIT_MODES.BY_SIZE_OR_COUNT && renderBySizeOrCountForm()}
      {mode === SPLIT_MODES.BY_CHAPTERS && renderByChaptersForm()}
    </Stack>
  );
}

export default SplitSettings;
