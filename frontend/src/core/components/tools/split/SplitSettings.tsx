import { Stack, TextInput, Checkbox, Anchor, Text, Radio, Group } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useTranslation } from 'react-i18next';
import { SPLIT_METHODS } from '@app/constants/splitConstants';
import { SplitParameters } from '@app/hooks/tools/split/useSplitParameters';

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
      <Radio.Group
        name="splitMode"
        label={t("split-by-sections.splitMode.label", "Split Mode")}
        value={parameters.splitMode || 'SPLIT_ALL'}
        onChange={(value) => onParameterChange('splitMode', value)}
        description={t("split-by-sections.splitMode.description", "Choose how to split the pages")}
      >
        <Group mt="xs">
          <Radio value="SPLIT_ALL" label={t("split-by-sections.splitMode.splitAll", "Split all pages")} />
          <Radio value="SPLIT_ALL_EXCEPT_FIRST" label={t("split-by-sections.splitMode.splitAllExceptFirst", "Split all except first")} />
          <Radio value="SPLIT_ALL_EXCEPT_LAST" label={t("split-by-sections.splitMode.splitAllExceptLast", "Split all except last")} />
          <Radio value="SPLIT_ALL_EXCEPT_FIRST_AND_LAST" label={t("split-by-sections.splitMode.splitAllExceptFirstAndLast", "Split all except first and last")} />
          <Radio value="CUSTOM" label={t("split-by-sections.splitMode.custom", "Custom pages")} />
        </Group>
      </Radio.Group>
      {parameters.splitMode === 'CUSTOM' && (
        <TextInput
          label={t("split-by-sections.customPages.label", "Custom Page Numbers")}
          placeholder={t("split-by-sections.customPages.placeholder", "e.g. 2,4,6")}
          value={parameters.customPages || ''}
          onChange={(e) => onParameterChange('customPages', e.target.value)}
          disabled={disabled}
        />
      )}
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

  const renderByPageDividerForm = () => (
    <Stack gap="sm">
      <Anchor
        href="https://stirlingpdf.io/files/Auto%20Splitter%20Divider%20(with%20instructions).pdf"
        target="_blank"
        size="sm"
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
      >
        <LocalIcon icon="download-rounded" width="2rem" height="2rem" />
        {t("autoSplitPDF.dividerDownload2", "Download 'Auto Splitter Divider (with instructions).pdf'")}
      </Anchor>

      <Checkbox
        label={t("autoSplitPDF.duplexMode", "Duplex Mode (Front and back scanning)")}
        checked={parameters.duplexMode}
        onChange={(e) => onParameterChange('duplexMode', e.currentTarget.checked)}
        disabled={disabled}
      />
    </Stack>
  );

  // Don't render anything if no method is selected
  if (!parameters.method) {
    return (
      <Stack gap="sm">
        <Text c="dimmed" ta="center">
          {t("split.settings.selectMethodFirst", "Please select a split method first")}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Method-Specific Form */}
      {parameters.method === SPLIT_METHODS.BY_PAGES && renderByPagesForm()}
      {parameters.method === SPLIT_METHODS.BY_SECTIONS && renderBySectionsForm()}
      {(parameters.method === SPLIT_METHODS.BY_SIZE ||
        parameters.method === SPLIT_METHODS.BY_PAGE_COUNT ||
        parameters.method === SPLIT_METHODS.BY_DOC_COUNT) && renderSplitValueForm()}
      {parameters.method === SPLIT_METHODS.BY_CHAPTERS && renderByChaptersForm()}
      {parameters.method === SPLIT_METHODS.BY_PAGE_DIVIDER && renderByPageDividerForm()}
    </Stack>
  );
};

export default SplitSettings;
