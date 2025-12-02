import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Button, Alert } from '@mantine/core';
import InfoIcon from '@mui/icons-material/Info';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import SigningCollaborationSettings from '@app/components/tools/certSign/SigningCollaborationSettings';
import { useSigningWorkflowParameters } from '@app/hooks/tools/certSign/useSigningWorkflowParameters';
import { useSigningWorkflowOperation } from '@app/hooks/tools/certSign/useSigningWorkflowOperation';
import apiClient from '@app/services/apiClient';

const SigningWorkflow = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'signingWorkflow',
    useSigningWorkflowParameters,
    useSigningWorkflowOperation,
    props,
  );

  // Finalization state
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  // Extract sessionId from result JSON file
  const sessionId = useMemo(() => {
    if (base.operation.files && base.operation.files.length > 0) {
      const jsonFile = base.operation.files[0];
      // Read file synchronously using FileReader
      return null; // Will be read async in effect
    }
    return null;
  }, [base.operation.files]);

  // Helper to read JSON file and extract sessionId
  const extractSessionIdFromFile = async (file: File): Promise<string | null> => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      return json.sessionId || null;
    } catch {
      return null;
    }
  };

  // Finalization handler
  const handleFinalize = async () => {
    if (!base.operation.files || base.operation.files.length === 0) return;

    setIsFinalizing(true);
    setFinalizeError(null);

    try {
      // Extract sessionId from JSON file
      const extractedSessionId = await extractSessionIdFromFile(base.operation.files[0]);

      if (!extractedSessionId) {
        setFinalizeError(t('certSign.collab.finalize.error', 'Failed to read session ID from file'));
        return;
      }

      const response = await apiClient.post(
        `/api/v1/security/cert-sign/sessions/${extractedSessionId}/finalize`,
        {},
        { responseType: 'blob' }
      );

      // Download PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `signed-${extractedSessionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error: any) {
      console.error('Finalization error:', error);
      setFinalizeError(
        error.response?.data?.message ||
        t('certSign.collab.finalize.error', 'Failed to finalize signatures. Some participants may not have submitted certificates.')
      );
    } finally {
      setIsFinalizing(false);
    }
  };

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
      additionalContent: base.hasResults ? (
        <Stack gap="sm" mt="md">
          <Alert icon={<InfoIcon />} color="blue" variant="light">
            {t('certSign.collab.finalize.tooltip', 'Apply all collected certificates and download the final signed document')}
          </Alert>

          <Button
            onClick={handleFinalize}
            loading={isFinalizing}
            leftSection={<CheckCircleIcon />}
            fullWidth
            color="green"
            size="md"
          >
            {t('certSign.collab.finalize.button', 'Finalize and download signed PDF')}
          </Button>

          {finalizeError && (
            <Alert icon={<ErrorIcon />} color="red">
              {finalizeError}
            </Alert>
          )}
        </Stack>
      ) : undefined,
    },
  });
};

SigningWorkflow.tool = () => useSigningWorkflowOperation;

export default SigningWorkflow as ToolComponent;
