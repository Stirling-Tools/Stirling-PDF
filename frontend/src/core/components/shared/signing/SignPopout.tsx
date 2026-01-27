import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import ActiveSessionsPanel from './ActiveSessionsPanel';
import CompletedSessionsPanel from './CompletedSessionsPanel';
import CreateSessionPanel from './CreateSessionPanel';
import apiClient from '@app/services/apiClient';
import { alert } from '@app/components/toast';
import { SignRequestSummary, SignRequestDetail, SessionSummary, SessionDetail } from '@app/types/signingSession';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { useFileSelection } from '@app/contexts/file/fileHooks';
import { fileStorage } from '@app/services/fileStorage';
import { uploadHistoryChain } from '@app/services/serverStorageUpload';
import { useFileActions } from '@app/contexts/FileContext';
import SignRequestWorkbenchView from '@app/components/tools/certSign/SignRequestWorkbenchView';
import SessionDetailWorkbenchView from '@app/components/tools/certSign/SessionDetailWorkbenchView';
import type { StirlingFileStub } from '@app/types/fileContext';
import type { FileId } from '@app/types/file';
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from '@app/styles/zIndex';

interface SignPopoutProps {
  isOpen: boolean;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLDivElement>;
  isRTL: boolean;
}

type SessionItem = (SignRequestSummary | SessionSummary) & {
  itemType: 'signRequest' | 'mySession';
};

const SignPopout = ({ isOpen, onClose, buttonRef, isRTL }: SignPopoutProps) => {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 160, left: 84 });
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  // Tab state
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [showCreatePanel, setShowCreatePanel] = useState(false);

  // Data state
  const [signRequests, setSignRequests] = useState<SignRequestSummary[]>([]);
  const [mySessions, setMySessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Create form state
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Hooks
  const { selectedFiles } = useFileSelection();
  const { actions: fileActions } = useFileActions();
  const { actions: navigationActions } = useNavigationActions();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();

  // Workbench IDs
  const SIGN_REQUEST_WORKBENCH_ID = 'signRequestWorkbench';
  const SIGN_REQUEST_WORKBENCH_TYPE = 'custom:signRequestWorkbench' as const;
  const SESSION_DETAIL_WORKBENCH_ID = 'sessionDetailWorkbench';
  const SESSION_DETAIL_WORKBENCH_TYPE = 'custom:sessionDetailWorkbench' as const;

  // Register workbenches
  useEffect(() => {
    registerCustomWorkbenchView({
      id: SIGN_REQUEST_WORKBENCH_ID,
      workbenchId: SIGN_REQUEST_WORKBENCH_TYPE,
      label: t('certSign.collab.signRequest.workbenchTitle', 'Sign Request'),
      component: SignRequestWorkbenchView,
    });

    registerCustomWorkbenchView({
      id: SESSION_DETAIL_WORKBENCH_ID,
      workbenchId: SESSION_DETAIL_WORKBENCH_TYPE,
      label: t('certSign.collab.sessionDetail.workbenchTitle', 'Session Management'),
      component: SessionDetailWorkbenchView,
    });

    return () => {
      unregisterCustomWorkbenchView(SIGN_REQUEST_WORKBENCH_ID);
      unregisterCustomWorkbenchView(SESSION_DETAIL_WORKBENCH_ID);
    };
  }, []);

  // Position popover
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const anchor = buttonRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const left = isRTL ? Math.max(16, rect.left - 360) : rect.right + 12;
      const viewportHeight = window.innerHeight;

      // Start at button position with small offset
      let top = rect.top - 24;

      // Ensure minimum top margin
      top = Math.max(24, top);

      // Calculate available height from top position to bottom of viewport
      const availableHeight = viewportHeight - top - 24; // 24px bottom margin

      setPopoverPosition({ top, left });
      setMaxHeight(availableHeight);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, { capture: true });

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, { capture: true });
    };
  }, [isOpen, isRTL, buttonRef]);

  // Handle outside clicks
  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;

      const mantineDropdown = (target as Element).closest?.(
        '.mantine-Combobox-dropdown, .mantine-Popover-dropdown'
      );
      if (mantineDropdown) return;

      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, buttonRef]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [requestsResponse, sessionsResponse] = await Promise.all([
        apiClient.get<SignRequestSummary[]>('/api/v1/security/cert-sign/sign-requests'),
        apiClient.get<SessionSummary[]>('/api/v1/security/cert-sign/sessions'),
      ]);
      setSignRequests(requestsResponse.data);
      setMySessions(sessionsResponse.data);
    } catch (error) {
      console.error('Failed to fetch signing data:', error);
      alert({
        alertType: 'warning',
        title: t('error'),
        body: t('certSign.fetchFailed', 'Failed to load signing data'),
        expandable: false,
        durationMs: 2500,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Fetch data when opened
  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  // Auto-refresh Active tab every 15 seconds to show updated signature status
  useEffect(() => {
    if (isOpen && activeTab === 'active' && !showCreatePanel) {
      const interval = setInterval(() => {
        fetchData();
      }, 15000); // Refresh every 15 seconds

      return () => clearInterval(interval);
    }
  }, [isOpen, activeTab, showCreatePanel, fetchData]);

  // Combine and filter sessions
  const activeSessions: SessionItem[] = [
    // Sign requests where user hasn't signed or declined yet
    ...signRequests
      .filter(req => req.myStatus !== 'SIGNED' && req.myStatus !== 'DECLINED')
      .map(req => ({ ...req, itemType: 'signRequest' as const })),
    // Sessions user created that aren't finalized yet
    ...mySessions
      .filter(s => !s.finalized)
      .map(s => ({ ...s, itemType: 'mySession' as const })),
  ];

  const completedSessions: SessionItem[] = [
    // Sign requests where user has signed or declined
    ...signRequests
      .filter(req => req.myStatus === 'SIGNED' || req.myStatus === 'DECLINED')
      .map(req => ({ ...req, itemType: 'signRequest' as const })),
    // Sessions user created that have been finalized
    ...mySessions
      .filter(s => s.finalized)
      .map(s => ({ ...s, itemType: 'mySession' as const })),
  ];

  // Helper to ensure file is stored
  const ensureStoredFile = useCallback(async (fileStub: StirlingFileStub): Promise<number> => {
    const localUpdatedAt = fileStub.createdAt ?? fileStub.lastModified ?? 0;
    const isUpToDate =
      Boolean(fileStub.remoteStorageId) &&
      Boolean(fileStub.remoteStorageUpdatedAt) &&
      (fileStub.remoteStorageUpdatedAt as number) >= localUpdatedAt;

    if (isUpToDate && fileStub.remoteStorageId) {
      return fileStub.remoteStorageId as number;
    }

    const originalFileId = (fileStub.originalFileId || fileStub.id) as FileId;
    const remoteId = fileStub.remoteStorageId as number | undefined;
    const { remoteId: storedId, updatedAt, chain } = await uploadHistoryChain(
      originalFileId,
      remoteId
    );

    for (const stub of chain) {
      fileActions.updateStirlingFileStub(stub.id, {
        remoteStorageId: storedId,
        remoteStorageUpdatedAt: updatedAt,
        remoteOwnedByCurrentUser: true,
        remoteSharedViaLink: false,
      });
      await fileStorage.updateFileMetadata(stub.id, {
        remoteStorageId: storedId,
        remoteStorageUpdatedAt: updatedAt,
        remoteOwnedByCurrentUser: true,
        remoteSharedViaLink: false,
      });
    }

    return storedId;
  }, [fileActions]);

  // Create session handler
  const handleCreateSession = useCallback(async () => {
    if (selectedUserIds.length === 0 || selectedFiles.length !== 1) return;

    setCreating(true);
    try {
      const selectedFile = selectedFiles[0];
      const stirlingFile = await fileStorage.getStirlingFile(selectedFile.fileId);
      if (!stirlingFile) throw new Error('File not found');

      const formData = new FormData();
      formData.append('file', stirlingFile, selectedFile.name);
      formData.append('workflowType', 'SIGNING');
      formData.append('documentName', selectedFile.name);
      selectedUserIds.forEach((userId, index) => {
        formData.append(`participantUserIds[${index}]`, userId.toString());
      });
      if (dueDate) formData.append('dueDate', dueDate);
      formData.append('notifyOnCreate', 'true');

      await apiClient.post('/api/v1/security/cert-sign/sessions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      alert({
        alertType: 'success',
        title: t('success'),
        body: t('signSession.created', 'Signing request sent'),
        expandable: false,
        durationMs: 2500,
      });

      setSelectedUserIds([]);
      setDueDate('');
      setShowCreatePanel(false);
      await fetchData();
    } catch (error) {
      console.error('Failed to create session:', error);
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('signSession.createFailed', 'Failed to create signing request'),
        expandable: false,
        durationMs: 3000,
      });
    } finally {
      setCreating(false);
    }
  }, [selectedUserIds, dueDate, selectedFiles, fetchData, t]);

  // Handle clicking a sign request
  const handleSignRequestClick = useCallback(async (request: SignRequestSummary) => {
    onClose();
    try {
      const [detailResponse, pdfResponse] = await Promise.all([
        apiClient.get<SignRequestDetail>(`/api/v1/security/cert-sign/sign-requests/${request.sessionId}`),
        apiClient.get(`/api/v1/security/cert-sign/sign-requests/${request.sessionId}/document`, {
          responseType: 'blob',
        }),
      ]);

      const pdfFile = new File([pdfResponse.data], detailResponse.data.documentName, {
        type: 'application/pdf',
      });

      const canSign =
        detailResponse.data.myStatus === 'PENDING' ||
        detailResponse.data.myStatus === 'NOTIFIED' ||
        detailResponse.data.myStatus === 'VIEWED';

      setCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID, {
        signRequest: detailResponse.data,
        pdfFile,
        onSign: (certData: FormData) => handleSign(request.sessionId, certData),
        onDecline: () => handleDecline(request.sessionId),
        onBack: () => {
          clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
          navigationActions.setWorkbench('viewer');
        },
        canSign,
      });

      requestAnimationFrame(() => {
        navigationActions.setWorkbench(SIGN_REQUEST_WORKBENCH_TYPE);
      });
    } catch (error) {
      console.error('Failed to load sign request:', error);
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('signRequest.fetchFailed', 'Failed to load sign request'),
        expandable: false,
        durationMs: 3000,
      });
    }
  }, [onClose, setCustomWorkbenchViewData, clearCustomWorkbenchViewData, navigationActions, t]);

  // Handle clicking a session
  const handleSessionClick = useCallback(async (session: SessionSummary) => {
    onClose();
    try {
      // First fetch session detail
      const detailResponse = await apiClient.get<SessionDetail>(
        `/api/v1/security/cert-sign/sessions/${session.sessionId}`
      );

      // Determine which endpoint to use based on session state
      let pdfFile: File | null = null;

      if (detailResponse.data.finalized) {
        // Finalized sessions have signed PDF available
        try {
          const pdfResponse = await apiClient.get(
            `/api/v1/security/cert-sign/sessions/${session.sessionId}/signed-pdf`,
            { responseType: 'blob' }
          );
          pdfFile = new File([pdfResponse.data], session.documentName, { type: 'application/pdf' });
        } catch (pdfError: any) {
          if (pdfError?.response?.status === 404) {
            // Finalized but signed PDF not available - backend issue
            alert({
              alertType: 'warning',
              title: t('certSign.sessions.pdfNotReady', 'PDF Not Ready'),
              body: t('certSign.sessions.pdfNotReadyDesc', 'The signed PDF is being generated. Please try again in a moment.'),
              expandable: false,
              durationMs: 3000,
            });
            return;
          }
          throw pdfError;
        }
      } else {
        // For non-finalized sessions, get original PDF (always available)
        try {
          const pdfResponse = await apiClient.get(
            `/api/v1/security/cert-sign/sessions/${session.sessionId}/pdf`,
            { responseType: 'blob' }
          );
          pdfFile = new File([pdfResponse.data], session.documentName, { type: 'application/pdf' });
        } catch (error: any) {
          // Fallback if PDF not available
          console.warn('PDF not available, session can still be managed:', error);
          pdfFile = null;
        }
      }

      setCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID, {
        session: detailResponse.data,
        pdfFile,
        onFinalize: () => handleFinalize(session.sessionId, session.documentName),
        onLoadSignedPdf: () => handleLoadSignedPdf(session.sessionId, session.documentName),
        onAddParticipants: (userIds: number[], settings: any) =>
          handleAddParticipants(session.sessionId, userIds, settings),
        onRemoveParticipant: (userId: number) => handleRemoveParticipant(session.sessionId, userId),
        onDelete: () => handleDeleteSession(session.sessionId),
        onBack: () => {
          clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
          navigationActions.setWorkbench('viewer');
        },
        onRefresh: () => handleRefreshSession(session.sessionId),
      });

      requestAnimationFrame(() => {
        navigationActions.setWorkbench(SESSION_DETAIL_WORKBENCH_TYPE);
      });
    } catch (error) {
      console.error('Failed to load session:', error);
      alert({
        alertType: 'error',
        title: t('error'),
        body: t('certSign.sessions.fetchFailed', 'Failed to load session details'),
        expandable: false,
        durationMs: 3000,
      });
    }
  }, [onClose, setCustomWorkbenchViewData, clearCustomWorkbenchViewData, navigationActions, t]);

  // Action handlers
  const handleSign = async (sessionId: string, certificateData: FormData) => {
    await apiClient.post(`/api/v1/security/cert-sign/sign-requests/${sessionId}/sign`, certificateData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    alert({
      alertType: 'success',
      title: t('success'),
      body: t('signRequest.signed', 'Document signed successfully'),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
    navigationActions.setWorkbench('viewer');
    await fetchData();
  };

  const handleDecline = async (sessionId: string) => {
    await apiClient.post(`/api/v1/security/cert-sign/sign-requests/${sessionId}/decline`);
    alert({
      alertType: 'success',
      title: t('success'),
      body: t('signRequest.declined', 'Sign request declined'),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
    navigationActions.setWorkbench('viewer');
    await fetchData();
  };

  const handleFinalize = async (sessionId: string, documentName: string) => {
    const response = await apiClient.post(
      `/api/v1/security/cert-sign/sessions/${sessionId}/finalize`,
      null,
      { responseType: 'blob' }
    );
    const contentDisposition = response.headers['content-disposition'];
    const filenameMatch = contentDisposition?.match(/filename="?(.+?)"?$/);
    const filename = filenameMatch ? filenameMatch[1] : `${documentName}_signed.pdf`;
    const signedFile = new File([response.data], filename, { type: 'application/pdf' });
    await fileActions.addFiles([signedFile]);
    alert({
      alertType: 'success',
      title: t('success'),
      body: t('certSign.sessions.finalized', 'Session finalized'),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
    navigationActions.setWorkbench('viewer');
    await fetchData();
  };

  const handleLoadSignedPdf = async (sessionId: string, documentName: string) => {
    const response = await apiClient.get(
      `/api/v1/security/cert-sign/sessions/${sessionId}/signed-pdf`,
      { responseType: 'blob' }
    );
    const contentDisposition = response.headers['content-disposition'];
    const filenameMatch = contentDisposition?.match(/filename="?(.+?)"?$/);
    const filename = filenameMatch ? filenameMatch[1] : `${documentName}_signed.pdf`;
    const signedFile = new File([response.data], filename, { type: 'application/pdf' });
    await fileActions.addFiles([signedFile]);
    alert({
      alertType: 'success',
      title: t('success'),
      body: t('certSign.sessions.loaded', 'Signed PDF loaded'),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
    navigationActions.setWorkbench('viewer');
  };

  const handleAddParticipants = async (sessionId: string, userIds: number[], settings: any) => {
    await apiClient.post(`/api/v1/security/cert-sign/sessions/${sessionId}/participants`, {
      participantUserIds: userIds,
      showSignature: settings.showSignature,
      pageNumber: settings.pageNumber,
      reason: settings.reason,
      location: settings.location,
      showLogo: settings.showLogo,
    });
    await handleRefreshSession(sessionId);
  };

  const handleRemoveParticipant = async (sessionId: string, userId: number) => {
    await apiClient.delete(`/api/v1/security/cert-sign/sessions/${sessionId}/participants/${userId}`);
    await handleRefreshSession(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await apiClient.delete(`/api/v1/security/cert-sign/sessions/${sessionId}`);
    alert({
      alertType: 'success',
      title: t('success'),
      body: t('certSign.sessions.deleted', 'Session deleted'),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
    navigationActions.setWorkbench('viewer');
    await fetchData();
  };

  const handleRefreshSession = async (sessionId: string) => {
    const response = await apiClient.get<SessionDetail>(
      `/api/v1/security/cert-sign/sessions/${sessionId}`
    );
    // Update workbench data, preserving PDF and callbacks
    setCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID, (prevData: any) => ({
      ...prevData,
      session: response.data,
    }));
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={`quick-access-popout quick-access-sign-popout ${isOpen ? 'is-open' : ''}`}
      style={{
        position: 'fixed',
        top: `${popoverPosition.top}px`,
        left: `${popoverPosition.left}px`,
        zIndex: Z_INDEX_OVER_FULLSCREEN_SURFACE,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="quick-access-popout__card" style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined }}>
        {/* Header */}
        <div className="quick-access-popout__header">
          <button
            type="button"
            className={`quick-access-popout__back ${showCreatePanel ? 'is-visible' : ''}`}
            onClick={() => setShowCreatePanel(false)}
            aria-label={t('quickAccess.back', 'Back')}
          >
            <LocalIcon icon="arrow-back-rounded" width="1rem" height="1rem" />
          </button>
          <div className="quick-access-popout__title">
            {showCreatePanel
              ? t('quickAccess.createSession', 'Create Signing Request')
              : activeTab === 'active'
              ? t('quickAccess.activeSessions', 'Active Sessions')
              : t('quickAccess.completedSessions', 'Completed Sessions')}
          </div>
          <div className="quick-access-popout__header-actions">
            {!showCreatePanel && (
              <button
                type="button"
                className="quick-access-popout__header-action"
                onClick={fetchData}
                disabled={loading}
                aria-label={t('quickAccess.refresh', 'Refresh')}
                style={{ opacity: loading ? 0.5 : 0.7 }}
              >
                <LocalIcon icon="refresh-rounded" width="1rem" height="1rem" />
              </button>
            )}
            <button
              type="button"
              className="quick-access-popout__header-action"
              onClick={onClose}
              aria-label={t('close', 'Close')}
            >
              <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {!showCreatePanel && (
          <div className="quick-access-popout__tab-nav">
            <button
              className={`quick-access-popout__tab-button ${activeTab === 'active' ? 'active' : ''}`}
              onClick={() => setActiveTab('active')}
            >
              {t('quickAccess.activeTab', 'Active')}
              {activeSessions.length > 0 && (
                <Badge size="xs" circle ml={4}>
                  {activeSessions.length}
                </Badge>
              )}
            </button>
            <button
              className={`quick-access-popout__tab-button ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              {t('quickAccess.completedTab', 'Completed')}
              {completedSessions.length > 0 && (
                <Badge size="xs" circle ml={4}>
                  {completedSessions.length}
                </Badge>
              )}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="quick-access-popout__body">
          {showCreatePanel ? (
            <CreateSessionPanel
              selectedFiles={selectedFiles}
              selectedUserIds={selectedUserIds}
              onSelectedUserIdsChange={setSelectedUserIds}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              creating={creating}
            />
          ) : activeTab === 'active' ? (
            <ActiveSessionsPanel
              sessions={activeSessions}
              loading={loading}
              onSessionClick={(item) => {
                if (item.itemType === 'signRequest') {
                  handleSignRequestClick(item as SignRequestSummary);
                } else {
                  handleSessionClick(item as SessionSummary);
                }
              }}
              onCreateNew={() => setShowCreatePanel(true)}
            />
          ) : (
            <CompletedSessionsPanel
              sessions={completedSessions}
              loading={loading}
              onSessionClick={(item) => {
                if (item.itemType === 'signRequest') {
                  handleSignRequestClick(item as SignRequestSummary);
                } else {
                  handleSessionClick(item as SessionSummary);
                }
              }}
            />
          )}
        </div>

        {/* Footer */}
        {showCreatePanel && (
          <div className="quick-access-popout__footer">
            <button
              type="button"
              className="quick-access-popout__primary"
              onClick={handleCreateSession}
              disabled={selectedFiles.length !== 1 || selectedUserIds.length === 0 || creating}
            >
              <LocalIcon icon="send-rounded" width="1rem" height="1rem" />
              {creating
                ? t('quickAccess.sendingRequest', 'Sending...')
                : t('quickAccess.requestSignatures', 'Request Signatures')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SignPopout;
