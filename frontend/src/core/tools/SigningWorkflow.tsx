import { useState, useMemo, useEffect } from 'react';
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
  const [detectedJsonSession, setDetectedJsonSession] = useState(false);

  // Detect if user uploaded a JSON session file
  useEffect(() => {
    const checkForJsonSession = async () => {
      console.log('SigningWorkflow: checking files', {
        fileCount: base.selectedFiles.length,
        hasResults: base.hasResults,
        detectedJsonSession,
      });

      if (base.selectedFiles.length === 1 && !base.hasResults && !detectedJsonSession) {
        const stirlingFile = base.selectedFiles[0];
        const file = stirlingFile;
        console.log('SigningWorkflow: checking file:', file.name, file.type);

        if (file.name.endsWith('.json') || file.type === 'application/json') {
          try {
            const text = await file.text();
            const json = JSON.parse(text);
            console.log('SigningWorkflow: parsed JSON:', json);

            if (json.sessionId) {
              console.log('SigningWorkflow: detected signing session JSON, sessionId:', json.sessionId);
              // This is a session JSON file - show finalization button
              setDetectedJsonSession(true);
            }
          } catch (e) {
            console.log('SigningWorkflow: not a valid JSON session file:', e);
          }
        }
      }
    };

    checkForJsonSession();
  }, [base.selectedFiles, base.hasResults, detectedJsonSession]);

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
    // Get the JSON file from either operation results or selected files
    const jsonFile = base.operation.files?.[0] || base.selectedFiles[0];
    if (!jsonFile) {
      console.error('SigningWorkflow: No JSON file found for finalization');
      return;
    }

    console.log('SigningWorkflow: Starting finalization with file:', jsonFile.name);

    setIsFinalizing(true);
    setFinalizeError(null);

    try {
      // Extract sessionId from JSON file
      const extractedSessionId = await extractSessionIdFromFile(jsonFile);

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

  return (
    <>
      {createToolFlow({
        forceStepNumbers: true,
        files: {
          selectedFiles: base.selectedFiles,
          isCollapsed: base.hasResults || detectedJsonSession,
        },
        steps: [
          {
            title: t('certSign.collab.stepTitle', 'Share for signing'),
            isCollapsed: base.settingsCollapsed,
            onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
            isVisible: !detectedJsonSession,
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
          isVisible: !base.hasResults && !detectedJsonSession,
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
      })}

      {/* Finalization button - shown after review OR when JSON session detected */}
      {(base.hasResults || detectedJsonSession) && (
        <Stack gap="sm" mt="md" p="sm">
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
      )}
    </>
  );
};

SigningWorkflow.tool = () => useSigningWorkflowOperation;

export default SigningWorkflow as ToolComponent;
