import { useTranslation } from 'react-i18next';
import { createToolFlow } from '../components/tools/shared/createToolFlow';
import { BaseToolProps, ToolComponent } from '../types/tool';
import { useBaseTool } from '../hooks/tools/shared/useBaseTool';
import { useFakeScanParameters } from '../hooks/tools/fakeScan/useFakeScanParameters';
import { useFakeScanOperation } from '../hooks/tools/fakeScan/useFakeScanOperation';
import FakeScanBasicSettings from '../components/tools/fakeScan/FakeScanBasicSettings';
import FakeScanAdvancedPanel from '../components/tools/fakeScan/FakeScanAdvancedPanel';
import FakeScanPreview from '../components/tools/fakeScan/FakeScanPreview';
import { useAccordionSteps } from '../hooks/tools/shared/useAccordionSteps';

const FakeScan = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'fakeScan',
    useFakeScanParameters,
    useFakeScanOperation,
    props
  );

  enum FakeScanStep {
    NONE = 'none',
    BASIC = 'basic',
    ADVANCED = 'advanced'
  }

  const accordion = useAccordionSteps<FakeScanStep>({
    noneValue: FakeScanStep.NONE,
    initialStep: FakeScanStep.BASIC,
    stateConditions: {
      hasFiles: base.hasFiles,
      hasResults: base.hasResults
    },
    afterResults: base.handleSettingsReset
  });

  const firstFile = base.selectedFiles[0] || null;
  const canPreview = !!firstFile && firstFile.type === 'application/pdf';

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("scannerEffect.basicSettings", "Basic Settings"),
        isCollapsed: accordion.getCollapsedState(FakeScanStep.BASIC),
        onCollapsedClick: () => accordion.handleStepToggle(FakeScanStep.BASIC),
        content: (
          <FakeScanBasicSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("scannerEffect.advancedSettings", "Advanced Settings"),
        isCollapsed: accordion.getCollapsedState(FakeScanStep.ADVANCED),
        onCollapsedClick: () => accordion.handleStepToggle(FakeScanStep.ADVANCED),
        content: (
          <FakeScanAdvancedPanel
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    preview: !base.hasResults ? (

        <FakeScanPreview
          parameters={base.params.parameters}
          file={canPreview ? firstFile : null}
        />

    ) : null,
    executeButton: {
      text: t('fakeScan.submit', 'Create Scanner Effect'),
      isVisible: !base.hasResults,
      loadingText: t('loading'),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t('fakeScan.title', 'Scanner Effect Results'),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
    forceStepNumbers: true,
  });
};

export default FakeScan as ToolComponent;


