import { useTranslation } from 'react-i18next';
import { createToolFlow } from '../components/tools/shared/createToolFlow';
import { BaseToolProps, ToolComponent } from '../types/tool';
import { useBaseTool } from '../hooks/tools/shared/useBaseTool';
import { useAdjustContrastParameters } from '../hooks/tools/adjustContrast/useAdjustContrastParameters';
import { useAdjustContrastOperation } from '../hooks/tools/adjustContrast/useAdjustContrastOperation';
import AdjustContrastSettings from '../components/tools/adjustContrast/AdjustContrastSettings';
import { useAccordionSteps } from '../hooks/tools/shared/useAccordionSteps';

const AdjustContrast = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'adjustContrast',
    useAdjustContrastParameters,
    useAdjustContrastOperation,
    props
  );

  enum Step { NONE='none', SETTINGS='settings' }
  const accordion = useAccordionSteps<Step>({
    noneValue: Step.NONE,
    initialStep: Step.SETTINGS,
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
        title: t('adjustContrast.title', 'Adjust Colors/Contrast'),
        isCollapsed: accordion.getCollapsedState(Step.SETTINGS),
        onCollapsedClick: () => accordion.handleStepToggle(Step.SETTINGS),
        content: (
          <AdjustContrastSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
            file={base.selectedFiles[0] || null}
          />
        ),
      },
    ],
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


