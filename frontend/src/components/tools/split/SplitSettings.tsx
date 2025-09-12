import { Stack, TextInput, Select, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { isSplitMethod, SPLIT_METHODS, METHOD_TO_SPLIT_TYPE, SPLIT_TYPES } from '../../../constants/splitConstants';
import { SplitParameters } from '../../../hooks/tools/split/useSplitParameters';

export interface SplitSettingsProps {
  parameters: SplitParameters;
  onParameterChange: <K extends keyof SplitParameters>(key: K, value: SplitParameters[K]) => void;
  disabled?: boolean;
}

const SplitSettings = ({
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

  const renderSplitValueForm = () => (
    <TextInput
      label={t("split-by-size-or-count.value.label", "Split Value")}
      placeholder={t("split-by-size-or-count.value.placeholder", "e.g. 10MB or 5 pages")}
      value={parameters.splitValue}
      onChange={(e) => onParameterChange('splitValue', e.target.value)}
      disabled={disabled}
    />
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
      {/* Method Selector */}
      <Select
        label={t("split.method.label", "Choose split method")}
        placeholder={t("split.method.placeholder", "Select how to split the PDF")}
        value={parameters.method}
        onChange={(v) => isSplitMethod(v) && onParameterChange('method', v)}
        disabled={disabled}
        data={[
          { value: SPLIT_METHODS.BY_PAGES, label: t("split.header", "Split by Pages") + " (e.g. 1,3,5-10)" },
          { value: SPLIT_METHODS.BY_SECTIONS, label: t("split-by-sections.title", "Split by Grid Sections") },
          { value: SPLIT_METHODS.BY_SIZE, label: t("split-by-size-or-count.type.size", "By Size") },
          { value: SPLIT_METHODS.BY_PAGE_COUNT, label: t("split-by-size-or-count.type.pageCount", "By Page Count") },
          { value: SPLIT_METHODS.BY_DOC_COUNT, label: t("split-by-size-or-count.type.docCount", "By Document Count") },
          { value: SPLIT_METHODS.BY_CHAPTERS, label: t("splitByChapters.title", "Split by Chapters") },
        ]}
      />

      {/* Parameter Form */}
      {parameters.method === SPLIT_METHODS.BY_PAGES && renderByPagesForm()}
      {parameters.method === SPLIT_METHODS.BY_SECTIONS && renderBySectionsForm()}
      {(parameters.method === SPLIT_METHODS.BY_SIZE || 
        parameters.method === SPLIT_METHODS.BY_PAGE_COUNT || 
        parameters.method === SPLIT_METHODS.BY_DOC_COUNT) && renderSplitValueForm()}
      {parameters.method === SPLIT_METHODS.BY_CHAPTERS && renderByChaptersForm()}
    </Stack>
  );
}

export default SplitSettings;
