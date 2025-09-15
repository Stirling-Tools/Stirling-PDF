import { Stack, TextInput, Select, Checkbox } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { isSplitMethod, SPLIT_METHODS } from '../../../constants/splitConstants';
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

  const renderSplitValueForm = () => {
    let label, placeholder;

    switch (parameters.method) {
      case SPLIT_METHODS.BY_SIZE:
        label = t("split.value.fileSize.label", "File Size");
        placeholder = t("split.value.fileSize.placeholder", "e.g. 10MB, 500KB");
        break;
      case SPLIT_METHODS.BY_PAGE_COUNT:
        label = t("split.value.pageCount.label", "Pages per File");
        placeholder = t("split.value.pageCount.placeholder", "e.g. 5, 10");
        break;
      case SPLIT_METHODS.BY_DOC_COUNT:
        label = t("split.value.docCount.label", "Number of Files");
        placeholder = t("split.value.docCount.placeholder", "e.g. 3, 5");
        break;
      default:
        label = t("split-by-size-or-count.value.label", "Split Value");
        placeholder = t("split-by-size-or-count.value.placeholder", "e.g. 10MB or 5 pages");
    }

    return (
      <TextInput
        label={label}
        placeholder={placeholder}
        value={parameters.splitValue}
        onChange={(e) => onParameterChange('splitValue', e.target.value)}
        disabled={disabled}
      />
    );
  };

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
          { value: SPLIT_METHODS.BY_PAGES, label: t("split.methods.byPages", "Split at Pages Numbers") },
          { value: SPLIT_METHODS.BY_SECTIONS, label: t("split.methods.bySections", "Split by Sections") },
          { value: SPLIT_METHODS.BY_SIZE, label: t("split.methods.bySize", "Split by Size") },
          { value: SPLIT_METHODS.BY_PAGE_COUNT, label: t("split.methods.byPageCount", "Split by Page Count") },
          { value: SPLIT_METHODS.BY_DOC_COUNT, label: t("split.methods.byDocCount", "Split by Document Count") },
          { value: SPLIT_METHODS.BY_CHAPTERS, label: t("split.methods.byChapters", "Split by Chapters") },
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
