import { useTranslation } from 'react-i18next';
import { createToolFlow } from '../components/tools/shared/createToolFlow';
import { BaseToolProps, ToolComponent } from '../types/tool';
import { useBaseTool } from '../hooks/tools/shared/useBaseTool';
import { useAdjustContrastParameters } from '../hooks/tools/adjustContrast/useAdjustContrastParameters';
import { useAdjustContrastOperation } from '../hooks/tools/adjustContrast/useAdjustContrastOperation';
import AdjustContrastBasicSettings from '../components/tools/adjustContrast/AdjustContrastBasicSettings';
import AdjustContrastColorSettings from '../components/tools/adjustContrast/AdjustContrastColorSettings';
import AdjustContrastPreview from '../components/tools/adjustContrast/AdjustContrastPreview';
import { useAccordionSteps } from '../hooks/tools/shared/useAccordionSteps';

const AdjustContrast = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'adjustContrast',
    useAdjustContrastParameters,
    useAdjustContrastOperation,
    props
  );

  enum Step { NONE='none', BASIC='basic', COLORS='colors' }
  const accordion = useAccordionSteps<Step>({
    noneValue: Step.NONE,
    initialStep: Step.BASIC,
    stateConditions: { hasFiles: base.hasFiles, hasResults: base.hasResults },
    afterResults: base.handleSettingsReset
  });

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t('adjustContrast.basic', 'Basic Adjustments'),
        isCollapsed: accordion.getCollapsedState(Step.BASIC),
        onCollapsedClick: () => accordion.handleStepToggle(Step.BASIC),
        content: (
          <AdjustContrastBasicSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t('adjustContrast.adjustColors', 'Adjust Colors'),
        isCollapsed: accordion.getCollapsedState(Step.COLORS),
        onCollapsedClick: () => accordion.handleStepToggle(Step.COLORS),
        content: (
          <AdjustContrastColorSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    preview: (
      <AdjustContrastPreview
        file={base.selectedFiles[0] || null}
        parameters={base.params.parameters}
      />
    ),
    executeButton: {
      text: t('adjustContrast.confirm', 'Confirm'),
      isVisible: !base.hasResults,
      loadingText: t('loading'),
      onClick: base.handleExecute,
      disabled: !base.hasFiles,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t('adjustContrast.results.title', 'Adjusted PDF'),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
    forceStepNumbers: true,
  });
};

export default AdjustContrast as ToolComponent;


