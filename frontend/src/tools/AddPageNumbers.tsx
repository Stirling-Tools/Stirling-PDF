import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFileSelection } from "../contexts/FileContext";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";
import { useAddPageNumbersParameters } from "../components/tools/addPageNumbers/useAddPageNumbersParameters";
import { useAddPageNumbersOperation } from "../components/tools/addPageNumbers/useAddPageNumbersOperation";
import { Select, Stack, TextInput, NumberInput, Divider, Text } from "@mantine/core";
import { Tooltip } from "../components/shared/Tooltip";
import PageNumberPreview from "../components/tools/addPageNumbers/PageNumberPreview";
import { useAccordionSteps } from "../hooks/tools/shared/useAccordionSteps";

const AddPageNumbers = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useFileSelection();

  const params = useAddPageNumbersParameters();
  const operation = useAddPageNumbersOperation();

  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("add-page-numbers");

  useEffect(() => {
    operation.resetResults();
    onPreviewFile?.(null);
  }, [params.parameters]);

  const handleExecute = async () => {
    try {
      await operation.executeOperation(params.parameters, selectedFiles);
      if (operation.files && onComplete) {
        onComplete(operation.files);
      }
    } catch (error: any) {
      onError?.(error?.message || t("addPageNumbers.error.failed", "Add page numbers operation failed"));
    }
  };

  const hasFiles = selectedFiles.length > 0;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;

  enum AddPageNumbersStep {
    NONE = 'none',
    POSITION_AND_PAGES = 'position_and_pages',
    CUSTOMIZE = 'customize'
  }

  const accordion = useAccordionSteps<AddPageNumbersStep>({
    noneValue: AddPageNumbersStep.NONE,
    initialStep: AddPageNumbersStep.POSITION_AND_PAGES,
    stateConditions: {
      hasFiles,
      hasResults
    },
    afterResults: () => {
      operation.resetResults();
      onPreviewFile?.(null);
    }
  });

  const getSteps = () => {
    const steps: any[] = [];

    // Step 1: Position Selection & Pages/Starting Number
    steps.push({
      title: t("addPageNumbers.positionAndPages", "Position & Pages"),
      isCollapsed: accordion.getCollapsedState(AddPageNumbersStep.POSITION_AND_PAGES),
      onCollapsedClick: () => accordion.handleStepToggle(AddPageNumbersStep.POSITION_AND_PAGES),
      isVisible: hasFiles || hasResults,
      content: (
        <Stack gap="lg">
          {/* Position Selection */}
          <Stack gap="md">
            <PageNumberPreview
              parameters={params.parameters}
              onParameterChange={params.updateParameter}
              file={selectedFiles[0] || null}
              showQuickGrid={true}
            />
          </Stack>

          <Divider />

          {/* Pages & Starting Number Section */}
          <Stack gap="md">
            <Text size="sm" fw={500} mb="xs">{t('addPageNumbers.pagesAndStarting', 'Pages & Starting Number')}</Text>

            <Tooltip content={t('pageSelectionPrompt', 'Specify which pages to add numbers to. Examples: "1,3,5" for specific pages, "1-5" for ranges, "2n" for even pages, or leave blank for all pages.')}>
              <TextInput
                label={t('addPageNumbers.selectText.5', 'Pages to Number')}
                value={params.parameters.pagesToNumber}
                onChange={(e) => params.updateParameter('pagesToNumber', e.currentTarget.value)}
                placeholder={t('addPageNumbers.numberPagesDesc', 'e.g., 1,3,5-8 or leave blank for all pages')}
                disabled={endpointLoading}
              />
            </Tooltip>

            <Tooltip content={t('startingNumberTooltip', 'The first number to display. Subsequent pages will increment from this number.')}>
              <NumberInput
                label={t('addPageNumbers.selectText.4', 'Starting Number')}
                value={params.parameters.startingNumber}
                onChange={(v) => params.updateParameter('startingNumber', typeof v === 'number' ? v : 1)}
                min={1}
                disabled={endpointLoading}
              />
            </Tooltip>
          </Stack>
        </Stack>
      ),
    });

    // Step 2: Customize Appearance
    steps.push({
      title: t("addPageNumbers.customize", "Customize Appearance"),
      isCollapsed: accordion.getCollapsedState(AddPageNumbersStep.CUSTOMIZE),
      onCollapsedClick: () => accordion.handleStepToggle(AddPageNumbersStep.CUSTOMIZE),
      isVisible: hasFiles || hasResults,
      content: (
        <Stack gap="md">
          <Tooltip content={t('marginTooltip', 'Distance between the page number and the edge of the page.')}>
            <Select
              label={t('addPageNumbers.selectText.2', 'Margin')}
              value={params.parameters.customMargin}
              onChange={(v) => params.updateParameter('customMargin', (v as any) || 'medium')}
              data={[
                { value: 'small', label: t('sizes.small', 'Small') },
                { value: 'medium', label: t('sizes.medium', 'Medium') },
                { value: 'large', label: t('sizes.large', 'Large') },
                { value: 'x-large', label: t('sizes.x-large', 'Extra Large') },
              ]}
              disabled={endpointLoading}
            />
          </Tooltip>

          <Tooltip content={t('fontSizeTooltip', 'Size of the page number text in points. Larger numbers create bigger text.')}>
            <NumberInput
              label={t('addPageNumbers.fontSize', 'Font Size')}
              value={params.parameters.fontSize}
              onChange={(v) => params.updateParameter('fontSize', typeof v === 'number' ? v : 12)}
              min={1}
              disabled={endpointLoading}
            />
          </Tooltip>

          <Tooltip content={t('fontTypeTooltip', 'Font family for the page numbers. Choose based on your document style.')}>
            <Select
              label={t('addPageNumbers.fontName', 'Font Type')}
              value={params.parameters.fontType}
              onChange={(v) => params.updateParameter('fontType', (v as any) || 'Times')}
              data={[
                { value: 'Times', label: 'Times Roman' },
                { value: 'Helvetica', label: 'Helvetica' },
                { value: 'Courier', label: 'Courier New' },
              ]}
              disabled={endpointLoading}
            />
          </Tooltip>

          <Tooltip content={t('customTextTooltip', 'Optional custom format for page numbers. Use {n} as placeholder for the number. Example: "Page {n}" will show "Page 1", "Page 2", etc.')}>
            <TextInput
              label={t('addPageNumbers.selectText.6', 'Custom Text Format')}
              value={params.parameters.customText}
              onChange={(e) => params.updateParameter('customText', e.currentTarget.value)}
              placeholder={t('addPageNumbers.customNumberDesc', 'e.g., "Page {n}" or leave blank for just numbers')}
              disabled={endpointLoading}
            />
          </Tooltip>
        </Stack>
      ),
    });

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles,
      isCollapsed: hasResults,
    },
    steps: getSteps(),
    executeButton: {
      text: t('addPageNumbers.submit', 'Add Page Numbers'),
      isVisible: !hasResults,
      loadingText: t('loading'),
      onClick: handleExecute,
      disabled: !params.validateParameters() || !hasFiles || !endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: operation,
      title: t('addPageNumbers.results.title', 'Page Number Results'),
      onFileClick: (file) => onPreviewFile?.(file),
      onUndo: async () => {
        await operation.undoOperation();
        onPreviewFile?.(null);
      },
    },
  });
};

AddPageNumbers.tool = () => useAddPageNumbersOperation;

export default AddPageNumbers as ToolComponent;