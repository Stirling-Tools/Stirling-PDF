import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "../types/tool";
import { useAddPageNumbersParameters } from "../components/tools/addPageNumbers/useAddPageNumbersParameters";
import { useAddPageNumbersOperation } from "../components/tools/addPageNumbers/useAddPageNumbersOperation";
import { useAccordionSteps } from "../hooks/tools/shared/useAccordionSteps";
import AddPageNumbersPositionSettings from "../components/tools/addPageNumbers/AddPageNumbersPositionSettings";
import AddPageNumbersAppearanceSettings from "../components/tools/addPageNumbers/AddPageNumbersAppearanceSettings";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";

const AddPageNumbers = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'addPageNumbers',
    useAddPageNumbersParameters,
    useAddPageNumbersOperation,
    props
  );

  const hasFiles = base.hasFiles;
  const hasResults = base.hasResults;

  enum AddPageNumbersStep {
    NONE = 'none',
    POSITION_AND_PAGES = 'position_and_pages',
    CUSTOMIZE = 'customize'
  }

  const accordion = useAccordionSteps<AddPageNumbersStep>({
    noneValue: AddPageNumbersStep.NONE,
    initialStep: AddPageNumbersStep.POSITION_AND_PAGES,
    stateConditions: {
      hasFiles: base.hasFiles,
      hasResults: base.hasResults
    },
    afterResults: base.handleSettingsReset
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
        <AddPageNumbersPositionSettings
          parameters={base.params.parameters}
          onParameterChange={base.params.updateParameter}
          disabled={base.endpointLoading}
          file={base.selectedFiles[0] || null}
          showQuickGrid={true}
        />
      ),
    });

    // Step 2: Customize Appearance
    steps.push({
      title: t("addPageNumbers.customize", "Customize Appearance"),
      isCollapsed: accordion.getCollapsedState(AddPageNumbersStep.CUSTOMIZE),
      onCollapsedClick: () => accordion.handleStepToggle(AddPageNumbersStep.CUSTOMIZE),
      isVisible: hasFiles || hasResults,
      content: (
        <AddPageNumbersAppearanceSettings
          parameters={base.params.parameters}
          onParameterChange={base.params.updateParameter}
          disabled={base.endpointLoading}
        />
      ),
    });

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: hasResults,
    },
    steps: getSteps(),
    executeButton: {
      text: t('addPageNumbers.submit', 'Add Page Numbers'),
      isVisible: !hasResults,
      loadingText: t('loading'),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: hasResults,
      operation: base.operation,
      title: t('addPageNumbers.results.title', 'Page Number Results'),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

AddPageNumbers.tool = () => useAddPageNumbersOperation;

export default AddPageNumbers as ToolComponent;