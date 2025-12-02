import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from '@mantine/core';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import SigningCollaborationSettings from '@app/components/tools/certSign/SigningCollaborationSettings';
import SessionListView from '@app/components/tools/certSign/SessionListView';
import SessionDetailView from '@app/components/tools/certSign/SessionDetailView';
import { useSigningWorkflowParameters } from '@app/hooks/tools/certSign/useSigningWorkflowParameters';
import { useSigningWorkflowOperation } from '@app/hooks/tools/certSign/useSigningWorkflowOperation';
import { useSigningSessionManagement } from '@app/hooks/tools/certSign/useSigningSessionManagement';
import { useFileManagement } from '@app/contexts/file/fileHooks';
import { alert } from '@app/components/toast';

const SigningWorkflow = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    'signingWorkflow',
    useSigningWorkflowParameters,
    useSigningWorkflowOperation,
    props,
  );

  const sessionMgmt = useSigningSessionManagement();
  const { addFiles } = useFileManagement();

  // View states: 'list' | 'create' | 'detail'
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');

  // On mount: fetch sessions
  useEffect(() => {
    sessionMgmt.fetchSessions();
  }, []);

  // After session creation: show detail view
  useEffect(() => {
    if (base.hasResults && base.operation.data) {
      const sessionData = base.operation.data;
      if (sessionData.sessionId) {
        sessionMgmt.fetchSessionDetail(sessionData.sessionId);
        setView('detail');
      }
    }
  }, [base.hasResults]);

  // When files selected: switch to create view
  useEffect(() => {
    if (base.hasFiles && !base.hasResults && view === 'list') {
      setView('create');
    }
  }, [base.hasFiles, base.hasResults, view]);

  const handleBackToList = () => {
    sessionMgmt.setActiveSession(null);
    sessionMgmt.fetchSessions();
    base.handleUndo();
    setView('list');
  };

  const handleCreateNew = () => {
    base.handleUndo();
    setView('create');
  };

  // Always create toolFlowContent to maintain consistent hook order
  const toolFlowContent = createToolFlow({
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
      isVisible: false, // We go straight to detail view instead of showing results
      operation: base.operation,
      title: t('certSign.collab.results', 'Session Created'),
    },
  });

  return (
    <Stack gap="md">
      {(view === 'list' || (view === 'create' && !base.hasFiles)) && (
        <SessionListView
          sessions={sessionMgmt.sessions}
          onSessionSelect={(id) => {
            sessionMgmt.fetchSessionDetail(id);
            setView('detail');
          }}
          onCreateNew={handleCreateNew}
          loading={sessionMgmt.loading}
        />
      )}

      {view === 'create' && base.hasFiles && toolFlowContent}

      {view === 'detail' && sessionMgmt.activeSession && (
        <SessionDetailView
          session={sessionMgmt.activeSession}
          onFinalize={async () => {
            try {
              const signedFile = await sessionMgmt.finalizeSession(
                sessionMgmt.activeSession!.sessionId,
                sessionMgmt.activeSession!.documentName
              );

              // Add the finalized PDF to active files
              await addFiles([signedFile]);

              alert({
                alertType: 'success',
                title: t('success'),
                body: t('certSign.collab.finalize.success', 'Signed PDF added to active files'),
              });

              await sessionMgmt.fetchSessions();
              setView('list');
            } catch (error) {
              // Error already handled by sessionMgmt
            }
          }}
          onDelete={async () => {
            await sessionMgmt.deleteSession(sessionMgmt.activeSession!.sessionId);
            await sessionMgmt.fetchSessions();
            setView('list');
          }}
          onAddParticipants={(participants) =>
            sessionMgmt.addParticipants(sessionMgmt.activeSession!.sessionId, participants)
          }
          onRemoveParticipant={(email) =>
            sessionMgmt.removeParticipant(sessionMgmt.activeSession!.sessionId, email)
          }
          onLoadSignedPdf={async () => {
            try {
              const signedFile = await sessionMgmt.loadSignedPdf(
                sessionMgmt.activeSession!.sessionId,
                sessionMgmt.activeSession!.documentName
              );

              // Add the signed PDF to active files
              await addFiles([signedFile]);

              alert({
                alertType: 'success',
                title: t('success'),
                body: t('certSign.collab.finalize.success', 'Signed PDF added to active files'),
              });
            } catch (error) {
              // Error already handled by sessionMgmt
            }
          }}
          onBack={handleBackToList}
          onRefresh={() => sessionMgmt.fetchSessionDetail(sessionMgmt.activeSession!.sessionId)}
        />
      )}
    </Stack>
  );
};

SigningWorkflow.tool = () => useSigningWorkflowOperation;

export default SigningWorkflow as ToolComponent;
