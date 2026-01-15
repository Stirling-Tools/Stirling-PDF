import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Tabs, Text as MantineText } from '@mantine/core';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import SigningCollaborationSettings from '@app/components/tools/certSign/SigningCollaborationSettings';
import SessionListView from '@app/components/tools/certSign/SessionListView';
import SessionDetailView from '@app/components/tools/certSign/SessionDetailView';
import SignRequestListView from '@app/components/tools/certSign/SignRequestListView';
import SignRequestWorkbenchView from '@app/components/tools/certSign/SignRequestWorkbenchView';
import { useSigningWorkflowParameters } from '@app/hooks/tools/certSign/useSigningWorkflowParameters';
import { useSigningWorkflowOperation } from '@app/hooks/tools/certSign/useSigningWorkflowOperation';
import { useSigningSessionManagement } from '@app/hooks/tools/certSign/useSigningSessionManagement';
import { useSignRequestManagement } from '@app/hooks/tools/certSign/useSignRequestManagement';
import { useFileManagement, useFileSelection } from '@app/contexts/file/fileHooks';
import { alert } from '@app/components/toast';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useAuth } from '@app/auth/UseSession';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { FileId } from '@app/types/file';

const SigningWorkflow = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const base = useBaseTool(
    'signingWorkflow',
    useSigningWorkflowParameters,
    useSigningWorkflowOperation,
    props,
  );

  const sessionMgmt = useSigningSessionManagement();
  const signRequestMgmt = useSignRequestManagement();
  const { addFiles, removeFiles } = useFileManagement();
  const { setSelectedFiles } = useFileSelection();
  const { openFilesModal } = useFilesModalContext();
  const { actions: navActions } = useNavigationActions();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
    customWorkbenchViews,
  } = useToolWorkflow();

  // Track loaded session PDFs to prevent duplicate fetches
  const loadedSessionsRef = useRef<Set<string>>(new Set());
  // Track loaded file IDs by sessionId for cleanup
  const sessionFileIdsRef = useRef<Map<string, string>>(new Map());

  // Custom workbench ID (must use custom: prefix for WorkbenchType)
  const SIGN_REQUEST_WORKBENCH_ID = 'signRequestWorkbench';
  const SIGN_REQUEST_WORKBENCH_TYPE = 'custom:signRequestWorkbench';

  // Tab states: 'sessions' | 'signRequests'
  const [activeTab, setActiveTab] = useState<'sessions' | 'signRequests'>('sessions');
  // View states: 'list' | 'create' | 'detail'
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');

  // Register custom workbench on mount
  useEffect(() => {
    registerCustomWorkbenchView({
      id: SIGN_REQUEST_WORKBENCH_ID,
      workbenchId: SIGN_REQUEST_WORKBENCH_TYPE,
      // Use a static label at registration time to avoid re-registering on i18n changes
      label: 'Sign Request',
      component: SignRequestWorkbenchView,
    });

    return () => {
      unregisterCustomWorkbenchView(SIGN_REQUEST_WORKBENCH_ID);
    };
    // Register once; avoid re-registering on translation/prop changes which clears data mid-flight
  }, []);

  // On mount: fetch sessions and sign requests
  useEffect(() => {
    sessionMgmt.fetchSessions();
    signRequestMgmt.fetchSignRequests();
  }, []);

  // Fetch data when switching tabs
  useEffect(() => {
    if (activeTab === 'sessions') {
      sessionMgmt.fetchSessions();
    } else {
      signRequestMgmt.fetchSignRequests();
    }
  }, [activeTab]);

  // Load PDF and set data when viewing sign request detail
  useEffect(() => {
    if (view === 'detail' && activeTab === 'signRequests' && signRequestMgmt.activeRequest) {
      // Fetch PDF directly without adding to FileContext
      signRequestMgmt.fetchSessionPdf(
        signRequestMgmt.activeRequest.sessionId,
        signRequestMgmt.activeRequest.documentName
      ).then((pdfFile) => {
        console.log('[SigningWorkflow] PDF fetched for custom workbench:', pdfFile.name);
        // Set custom workbench data with the PDF file directly
        console.log('[SigningWorkflow] Setting custom workbench data for:', SIGN_REQUEST_WORKBENCH_ID);
        setCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID, {
          signRequest: signRequestMgmt.activeRequest,
          pdfFile,
          onSign: async (certData: FormData) => {
            if (!user?.id) {
              alert({
                alertType: 'error',
                title: t('error'),
                body: t('certSign.collab.signRequest.noUser', 'User not authenticated'),
              });
              return;
            }
            const sessionId = signRequestMgmt.activeRequest!.sessionId;
            await signRequestMgmt.signRequest(
              sessionId,
              parseInt(user.id, 10),
              certData
            );
            // Clear custom workbench data (no FileContext cleanup needed since we didn't add file there)
            clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
            navActions.setWorkbench('viewer');
            setView('list');
          },
          onDecline: async () => {
            const sessionId = signRequestMgmt.activeRequest!.sessionId;
            await signRequestMgmt.declineRequest(sessionId);
            // Clear custom workbench data (no FileContext cleanup needed since we didn't add file there)
            clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
            navActions.setWorkbench('viewer');
            setView('list');
          },
          onBack: () => {
            signRequestMgmt.setActiveRequest(null);
            // Clear custom workbench data (no FileContext cleanup needed since we didn't add file there)
            clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
            navActions.setWorkbench('viewer');
            setView('list');
          },
          canSign:
            signRequestMgmt.activeRequest?.myStatus === 'PENDING' ||
            signRequestMgmt.activeRequest?.myStatus === 'NOTIFIED' ||
            signRequestMgmt.activeRequest?.myStatus === 'VIEWED',
        });

        // Navigate after React re-renders with updated customWorkbenchViews
        // Use requestAnimationFrame to defer until after render cycle completes
        requestAnimationFrame(() => {
          console.log('[SigningWorkflow] Navigating to custom workbench:', SIGN_REQUEST_WORKBENCH_TYPE);
          navActions.setWorkbench(SIGN_REQUEST_WORKBENCH_TYPE);
        });
      }).catch((error) => {
        console.error('[SigningWorkflow] Failed to fetch PDF for sign request:', error);
      });
    }
  }, [view, activeTab, signRequestMgmt.activeRequest]);

  // Custom execute handler that navigates back after success
  const handleCreateSession = async () => {
    try {
      // Clear any previous errors first
      base.operation.clearError();

      // Call operation directly
      await base.operation.executeOperation(base.params.parameters, base.selectedFiles);

      // If we get here without throwing, it succeeded
      await sessionMgmt.fetchSessions();

      // Clear files and set view to list
      await base.handleUndo();
      setView('list');

      alert({
        alertType: 'success',
        title: t('success'),
        body: t('certSign.collab.sessionCreated', 'Signing session created successfully'),
      });
    } catch (error) {
      // Operation hook already displays error, just log
      console.error('Session creation error:', error);
    }
  };

  // Removed auto-switch to create - user must explicitly click "Create New"

  const handleBackToList = () => {
    sessionMgmt.setActiveSession(null);
    sessionMgmt.fetchSessions();
    base.handleUndo();
    setView('list');
  };

  const handleCreateNew = () => {
    setView('create');
    // Only open file picker if no files selected
    if (!base.hasFiles) {
      openFilesModal();
    }
  };

  const handleLoadPdf = useCallback(async (sessionId: string, documentName: string) => {
    // Check if we've already loaded this session's PDF
    if (loadedSessionsRef.current.has(sessionId)) {
      console.log('[SigningWorkflow] PDF already loaded for session:', sessionId);
      // Still select the file if it's already loaded
      const fileId = sessionFileIdsRef.current.get(sessionId);
      if (fileId) {
        setSelectedFiles([fileId as FileId]);
        console.log('[SigningWorkflow] Re-selected already loaded file:', fileId);
      }
      return null as any;
    }

    // Mark this session as loading immediately to prevent race condition
    loadedSessionsRef.current.add(sessionId);
    console.log('[SigningWorkflow] Loading PDF for session:', sessionId);

    const pdfFile = await signRequestMgmt.fetchSessionPdf(sessionId, documentName);
    console.log('[SigningWorkflow] PDF fetched:', pdfFile.name, pdfFile.size);

    const stirlingFiles = await addFiles([pdfFile]);
    console.log('[SigningWorkflow] Added to FileContext:', stirlingFiles.length, 'files');

    // Track the file ID for cleanup and select the file
    if (stirlingFiles.length > 0) {
      const fileId = stirlingFiles[0].fileId;
      sessionFileIdsRef.current.set(sessionId, fileId);
      console.log('[SigningWorkflow] Tracked fileId for cleanup:', fileId, 'session:', sessionId);
      console.log('[SigningWorkflow] Current tracked sessions:', Array.from(sessionFileIdsRef.current.keys()));

      // Select the file to display it in the viewer
      setSelectedFiles([fileId]);
      console.log('[SigningWorkflow] Selected file:', fileId);
    }

    return pdfFile;
  }, [signRequestMgmt.fetchSessionPdf, addFiles, setSelectedFiles]);

  const cleanupSessionPdf = useCallback((sessionId: string) => {
    console.log('[SigningWorkflow] cleanupSessionPdf called for session:', sessionId);
    console.log('[SigningWorkflow] Tracked sessions before cleanup:', Array.from(sessionFileIdsRef.current.keys()));

    const fileId = sessionFileIdsRef.current.get(sessionId);
    console.log('[SigningWorkflow] FileId to remove:', fileId);

    if (fileId) {
      console.log('[SigningWorkflow] Calling removeFiles with fileId:', fileId);
      removeFiles([fileId as FileId]);
      sessionFileIdsRef.current.delete(sessionId);
      loadedSessionsRef.current.delete(sessionId);
      console.log('[SigningWorkflow] Cleanup complete. Remaining tracked sessions:', Array.from(sessionFileIdsRef.current.keys()));
    } else {
      console.warn('[SigningWorkflow] No fileId found for session:', sessionId);
    }
  }, [removeFiles]);

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
      onClick: handleCreateSession,
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
      {view === 'create' && base.hasFiles ? (
        // Creating a new session
        toolFlowContent
      ) : view === 'detail' && activeTab === 'sessions' && sessionMgmt.activeSession ? (
        // Viewing session detail (owner view)
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
            } catch (_error) {
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
          onRemoveParticipant={(userId) =>
            sessionMgmt.removeParticipant(sessionMgmt.activeSession!.sessionId, userId)
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
            } catch (_error) {
              // Error already handled by sessionMgmt
            }
          }}
          onBack={handleBackToList}
          onRefresh={() => sessionMgmt.fetchSessionDetail(sessionMgmt.activeSession!.sessionId)}
        />
      ) : view === 'detail' && activeTab === 'signRequests' ? (
        // Sign request detail is now handled by custom workbench (SignRequestWorkbenchView)
        // Navigation happens automatically via useEffect above
        <Stack gap="sm" align="center" justify="center" style={{ minHeight: '200px' }}>
          <MantineText size="sm" c="dimmed">
            {t('certSign.collab.signRequest.loading', 'Loading sign request...')}
          </MantineText>
        </Stack>
      ) : (
        // List views with tabs
        <Tabs value={activeTab} onChange={(val) => setActiveTab(val as 'sessions' | 'signRequests')}>
          <Tabs.List>
            <Tabs.Tab value="sessions">
              {t('certSign.collab.tabs.mySessions', 'My Sessions')}
            </Tabs.Tab>
            <Tabs.Tab value="signRequests">
              {t('certSign.collab.tabs.signRequests', 'Sign Requests')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="sessions" pt="md">
            <SessionListView
              sessions={sessionMgmt.sessions}
              onSessionSelect={(id) => {
                sessionMgmt.fetchSessionDetail(id);
                setView('detail');
              }}
              onCreateNew={handleCreateNew}
              loading={sessionMgmt.loading}
            />
          </Tabs.Panel>

          <Tabs.Panel value="signRequests" pt="md">
            <SignRequestListView
              signRequests={signRequestMgmt.signRequests}
              onRequestSelect={(id) => {
                signRequestMgmt.fetchSignRequestDetail(id);
                setView('detail');
              }}
              loading={signRequestMgmt.loading}
            />
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
};

SigningWorkflow.tool = () => useSigningWorkflowOperation;

export default SigningWorkflow as ToolComponent;
