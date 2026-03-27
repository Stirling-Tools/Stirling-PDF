import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Stack, Text } from '@mantine/core';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';

import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import { useSignParameters, DEFAULT_PARAMETERS } from '@app/hooks/tools/sign/useSignParameters';
import { useSignOperation, signOperationConfig } from '@app/hooks/tools/sign/useSignOperation';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import CombinedSignEditor, { CombinedSignEditorData } from '@app/components/tools/combinedSign/CombinedSignEditor';
import { LocalIcon } from '@app/components/shared/LocalIcon';

const EDITOR_VIEW_ID = 'combinedSignEditor';
const EDITOR_WORKBENCH_ID = 'custom:combinedSignEditor' as const;

const CombinedSign = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();

  const base = useBaseTool('sign', useSignParameters, useSignOperation, props);

  const editorIcon = useMemo(
    () => <LocalIcon icon="signature-rounded" width="1rem" height="1rem" />,
    [],
  );

  // Register the full-screen editor as a custom workbench view (once on mount)
  useEffect(() => {
    registerCustomWorkbenchView({
      id: EDITOR_VIEW_ID,
      workbenchId: EDITOR_WORKBENCH_ID,
      label: t('sign.editor.title', 'Sign Editor'),
      icon: editorIcon,
      component: CombinedSignEditor,
      hideToolPanel: true,
    });
    return () => {
      clearCustomWorkbenchViewData(EDITOR_VIEW_ID);
      unregisterCustomWorkbenchView(EDITOR_VIEW_ID);
    };
  }, [clearCustomWorkbenchViewData, editorIcon, registerCustomWorkbenchView, t, unregisterCustomWorkbenchView]);

  const handleOpenEditor = useCallback(() => {
    if (base.selectedFiles.length === 0) return;

    const file = base.selectedFiles[0]; // StirlingFile extends File — works directly

    const editorData: CombinedSignEditorData = {
      file,
      onComplete: (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        navigationActions.setWorkbench('viewer');
      },
      onBack: () => {
        navigationActions.setWorkbench('viewer');
      },
    };

    setCustomWorkbenchViewData(EDITOR_VIEW_ID, editorData);
    navigationActions.setWorkbench(EDITOR_WORKBENCH_ID);
  }, [base.selectedFiles, navigationActions, setCustomWorkbenchViewData]);

  const isEditorOpen = navigationState.workbench === EDITOR_WORKBENCH_ID;

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: isEditorOpen,
    },
    steps: base.selectedFiles.length > 0
      ? [
          {
            title: t('sign.editor.openStep', 'Open Sign Editor'),
            isCollapsed: false,
            content: (
              <Stack gap="xs">
                <Text size="sm" c="dimmed">
                  {t(
                    'sign.editor.hint',
                    'Open the editor to place wet signatures, apply a digital certificate, or both.',
                  )}
                </Text>
                <Button
                  leftSection={<OpenInFullIcon fontSize="small" />}
                  onClick={handleOpenEditor}
                  disabled={base.endpointLoading || isEditorOpen}
                >
                  {t('sign.editor.open', 'Open Sign Editor')}
                </Button>
              </Stack>
            ),
          },
        ]
      : [],
    executeButton: {
      text: t('sign.editor.open', 'Open Sign Editor'),
      loadingText: t('loading', 'Loading...'),
      onClick: async () => handleOpenEditor(),
      isVisible: false,
      endpointEnabled: base.endpointEnabled,
      paramsValid: true,
    },
    review: {
      isVisible: false,
      operation: base.operation,
      title: '',
      onUndo: base.handleUndo,
    },
  });
};

const CombinedSignTool = CombinedSign as ToolComponent;
CombinedSignTool.tool = () => useSignOperation;
CombinedSignTool.getDefaultParameters = () => ({ ...DEFAULT_PARAMETERS });

export default CombinedSignTool;
