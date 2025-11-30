import { useTranslation } from 'react-i18next';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import SigningCollaborationSettings from '@app/components/tools/certSign/SigningCollaborationSettings';
import { useSigningWorkflowParameters } from '@app/hooks/tools/certSign/useSigningWorkflowParameters';
import { useSigningWorkflowOperation } from '@app/hooks/tools/certSign/useSigningWorkflowOperation';

const SigningWorkflow = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'signingWorkflow',
    useSigningWorkflowParameters,
    useSigningWorkflowOperation,
    props,
  );

  return createToolFlow({
    forceStepNumbers: true,
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t('certSign.collab.stepTitle', 'Share for signing'),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: (
          <SigningCollaborationSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t('certSign.collab.submit', 'Create shared session'),
      isVisible: !base.hasResults,
      loadingText: t('loading'),
      onClick: base.handleExecute,
      disabled: !base.params.validateParameters() || !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t('certSign.collab.results', 'Session summary'),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

SigningWorkflow.tool = () => useSigningWorkflowOperation;

export default SigningWorkflow as ToolComponent;
