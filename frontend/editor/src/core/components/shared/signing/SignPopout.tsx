import { lazy, useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Drawer } from "@mantine/core";
import { useIsPhone } from "@app/hooks/useIsMobile";
import LocalIcon from "@app/components/shared/LocalIcon";
import ActiveSessionsPanel from "@app/components/shared/signing/ActiveSessionsPanel";
import CompletedSessionsPanel from "@app/components/shared/signing/CompletedSessionsPanel";
import CreateSessionPanel from "@app/components/shared/signing/CreateSessionPanel";
import apiClient from "@app/services/apiClient";
import { alert } from "@app/components/toast";
import {
  SignRequestSummary,
  SignRequestDetail,
  SessionSummary,
  SessionDetail,
} from "@app/types/signingSession";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import { useFileSelection } from "@app/contexts/file/fileHooks";
import { fileStorage } from "@app/services/fileStorage";
import { useFileActions } from "@app/contexts/FileContext";
// These workbench views pull in the PDF viewer / pdfium / @embedpdf chain, so
// they are loaded on demand when the certSign collab feature actually opens
// one of them. Workbench wraps custom views in <Suspense>.
const SignRequestWorkbenchView = lazy(
  () => import("@app/components/tools/certSign/SignRequestWorkbenchView"),
);
const SessionDetailWorkbenchView = lazy(
  () => import("@app/components/tools/certSign/SessionDetailWorkbenchView"),
);
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";

export const SIGN_REQUEST_WORKBENCH_TYPE =
  "custom:signRequestWorkbench" as const;
export const SESSION_DETAIL_WORKBENCH_TYPE =
  "custom:sessionDetailWorkbench" as const;

type SessionItem = (SignRequestSummary | SessionSummary) & {
  itemType: "signRequest" | "mySession";
};

function sortSessions(
  sessions: SessionItem[],
  tab: "active" | "completed",
): SessionItem[] {
  return [...sessions].sort((a, b) => {
    if (tab === "active") {
      const aDue = (a as SignRequestSummary).dueDate;
      const bDue = (b as SignRequestSummary).dueDate;
      if (aDue && bDue)
        return new Date(aDue).getTime() - new Date(bDue).getTime();
      if (aDue) return -1;
      if (bDue) return 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

interface SignPopoutProps {
  isOpen: boolean;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLDivElement | null>;
  isRTL: boolean;
  groupSigningEnabled: boolean;
}

const SignPopout = ({
  isOpen,
  onClose,
  buttonRef,
  isRTL,
  groupSigningEnabled,
}: SignPopoutProps) => {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState({
    top: 160,
    left: 84,
  });
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  // Tab state
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [showCreatePanel, setShowCreatePanel] = useState(false);

  // Search / filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const handleTabChange = (tab: "active" | "completed") => {
    setActiveTab(tab);
    setSearchQuery("");
    setActiveFilters(new Set());
  };

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Data state
  const [signRequests, setSignRequests] = useState<SignRequestSummary[]>([]);
  const [mySessions, setMySessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Create form state
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [includeSummaryPage, setIncludeSummaryPage] = useState(false);

  // Hooks
  const { selectedFiles } = useFileSelection();
  const { actions: fileActions } = useFileActions();
  const { actions: navigationActions } = useNavigationActions();
  const { workbench: currentView } = useNavigationState();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
    handleToolSelect,
  } = useToolWorkflow();

  // Workbench IDs
  const SIGN_REQUEST_WORKBENCH_ID = "signRequestWorkbench";
  const SESSION_DETAIL_WORKBENCH_ID = "sessionDetailWorkbench";

  // Register workbenches when group signing is enabled.
  // No cleanup on unmount — registration must persist when this component unmounts
  // on mobile (QuickAccessBar is desktop-only). Re-registering on remount is idempotent.
  useEffect(() => {
    if (!groupSigningEnabled) return;

    registerCustomWorkbenchView({
      id: SIGN_REQUEST_WORKBENCH_ID,
      workbenchId: SIGN_REQUEST_WORKBENCH_TYPE,
      label: t("certSign.collab.signRequest.workbenchTitle", "Sign Request"),
      component: SignRequestWorkbenchView,
      hideTopControls: true,
      hideToolPanel: true,
    });

    registerCustomWorkbenchView({
      id: SESSION_DETAIL_WORKBENCH_ID,
      workbenchId: SESSION_DETAIL_WORKBENCH_TYPE,
      label: t(
        "certSign.collab.sessionDetail.workbenchTitle",
        "Session Management",
      ),
      component: SessionDetailWorkbenchView,
      hideTopControls: true,
      hideToolPanel: true,
    });
  }, [groupSigningEnabled]);

  // Unregister workbenches only when the feature is explicitly disabled
  useEffect(() => {
    if (groupSigningEnabled) return;
    unregisterCustomWorkbenchView(SIGN_REQUEST_WORKBENCH_ID);
    unregisterCustomWorkbenchView(SESSION_DETAIL_WORKBENCH_ID);
  }, [groupSigningEnabled, unregisterCustomWorkbenchView]);

  // Clear sign request workbench data when the user navigates away from it
  useEffect(() => {
    if (currentView !== SIGN_REQUEST_WORKBENCH_TYPE) {
      clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
    }
  }, [currentView]);

  // Clear session detail workbench data when the user navigates away from it
  useEffect(() => {
    if (currentView !== SESSION_DETAIL_WORKBENCH_TYPE) {
      clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
    }
  }, [currentView]);

  // Position popover (desktop/tablet only — phone uses Drawer)
  useEffect(() => {
    if (!isOpen || isPhone) return;

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
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { capture: true });

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, { capture: true });
    };
  }, [isOpen, isRTL, buttonRef]);

  // Handle outside clicks (desktop/tablet only — Drawer handles its own backdrop on phone)
  useEffect(() => {
    if (!isOpen || isPhone) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;

      const mantineDropdown = (target as Element).closest?.(
        ".mantine-Combobox-dropdown, .mantine-Popover-dropdown",
      );
      if (mantineDropdown) return;

      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, buttonRef]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [requestsResponse, sessionsResponse] = await Promise.all([
        apiClient.get<SignRequestSummary[]>(
          "/api/v1/security/cert-sign/sign-requests",
        ),
        apiClient.get<SessionSummary[]>("/api/v1/security/cert-sign/sessions"),
      ]);
      setSignRequests(requestsResponse.data);
      setMySessions(sessionsResponse.data);
    } catch (error) {
      console.error(
        "Failed to fetch signing data:",
        error instanceof Error ? error.message : error,
      );
      alert({
        alertType: "warning",
        title: t("common.error"),
        body: t("certSign.fetchFailed", "Failed to load signing data"),
        expandable: false,
        durationMs: 2500,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Fetch data when opened (only needed for group signing sessions)
  useEffect(() => {
    if (isOpen && groupSigningEnabled) {
      fetchData();
    }
  }, [isOpen, groupSigningEnabled, fetchData]);

  // Auto-refresh Active tab every 15 seconds to show updated signature status
  useEffect(() => {
    if (
      isOpen &&
      groupSigningEnabled &&
      activeTab === "active" &&
      !showCreatePanel
    ) {
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
      .filter((req) => req.myStatus !== "SIGNED" && req.myStatus !== "DECLINED")
      .map((req) => ({ ...req, itemType: "signRequest" as const })),
    // Sessions user created that aren't finalized yet
    ...mySessions
      .filter((s) => !s.finalized)
      .map((s) => ({ ...s, itemType: "mySession" as const })),
  ];

  const completedSessions: SessionItem[] = [
    // Sign requests where user has signed or declined
    ...signRequests
      .filter((req) => req.myStatus === "SIGNED" || req.myStatus === "DECLINED")
      .map((req) => ({ ...req, itemType: "signRequest" as const })),
    // Sessions user created that have been finalized
    ...mySessions
      .filter((s) => s.finalized)
      .map((s) => ({ ...s, itemType: "mySession" as const })),
  ];

  // Filter options vary by tab
  const filterOptions =
    activeTab === "active"
      ? [
          { key: "mine", label: t("quickAccess.filterMine", "Mine") },
          { key: "overdue", label: t("quickAccess.filterOverdue", "Overdue") },
        ]
      : [
          { key: "mine", label: t("quickAccess.filterMine", "Mine") },
          { key: "signed", label: t("quickAccess.filterSigned", "Signed") },
          {
            key: "declined",
            label: t("quickAccess.filterDeclined", "Declined"),
          },
        ];

  const applyFiltersAndSearch = (sessions: SessionItem[]): SessionItem[] => {
    let result = sessions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.documentName.toLowerCase().includes(q));
    }
    const now = new Date();
    if (activeFilters.has("mine"))
      result = result.filter((s) => s.itemType === "mySession");
    if (activeFilters.has("overdue"))
      result = result.filter(
        (s) =>
          (s as SignRequestSummary).dueDate &&
          new Date((s as SignRequestSummary).dueDate) < now,
      );
    if (activeFilters.has("signed"))
      result = result.filter(
        (s) => (s as SignRequestSummary).myStatus === "SIGNED",
      );
    if (activeFilters.has("declined"))
      result = result.filter(
        (s) => (s as SignRequestSummary).myStatus === "DECLINED",
      );
    return result;
  };

  const displayedActiveSessions = applyFiltersAndSearch(
    sortSessions(activeSessions, "active"),
  );
  const displayedCompletedSessions = applyFiltersAndSearch(
    sortSessions(completedSessions, "completed"),
  );

  // Create session handler
  const handleCreateSession = useCallback(async () => {
    if (selectedUserIds.length === 0 || selectedFiles.length !== 1) return;

    setCreating(true);
    try {
      const selectedFile = selectedFiles[0];
      const stirlingFile = await fileStorage.getStirlingFile(
        selectedFile.fileId,
      );
      if (!stirlingFile) throw new Error("File not found");

      const formData = new FormData();
      formData.append("file", stirlingFile, selectedFile.name);
      formData.append("workflowType", "SIGNING");
      formData.append("documentName", selectedFile.name);
      selectedUserIds.forEach((userId, index) => {
        formData.append(`participantUserIds[${index}]`, userId.toString());
      });
      if (dueDate) formData.append("dueDate", dueDate);
      formData.append("notifyOnCreate", "true");

      // Send includeSummaryPage setting as workflowMetadata if enabled
      if (includeSummaryPage) {
        const workflowMetadata = JSON.stringify({
          includeSummaryPage: true,
        });
        formData.append("workflowMetadata", workflowMetadata);
      }

      await apiClient.post("/api/v1/security/cert-sign/sessions", formData);

      alert({
        alertType: "success",
        title: t("success"),
        body: t("signSession.created", "Signing request sent"),
        expandable: false,
        durationMs: 2500,
      });

      setSelectedUserIds([]);
      setDueDate("");
      setIncludeSummaryPage(false);
      setShowCreatePanel(false);
      await fetchData();
    } catch (error) {
      console.error(
        "Failed to create session:",
        error instanceof Error ? error.message : error,
      );
      alert({
        alertType: "error",
        title: t("common.error"),
        body: t("signSession.createFailed", "Failed to create signing request"),
        expandable: false,
        durationMs: 3000,
      });
    } finally {
      setCreating(false);
    }
  }, [
    selectedUserIds,
    dueDate,
    selectedFiles,
    fetchData,
    t,
    includeSummaryPage,
  ]);

  // Handle clicking a sign request
  const handleSignRequestClick = useCallback(
    async (request: SignRequestSummary) => {
      onClose();
      try {
        const [detailResponse, pdfResponse] = await Promise.all([
          apiClient.get<SignRequestDetail>(
            `/api/v1/security/cert-sign/sign-requests/${request.sessionId}`,
          ),
          apiClient.get(
            `/api/v1/security/cert-sign/sign-requests/${request.sessionId}/document`,
            {
              responseType: "blob",
            },
          ),
        ]);

        const pdfFile = new File(
          [pdfResponse.data],
          detailResponse.data.documentName,
          {
            type: "application/pdf",
          },
        );
        const canSign =
          detailResponse.data.myStatus === "PENDING" ||
          detailResponse.data.myStatus === "NOTIFIED" ||
          detailResponse.data.myStatus === "VIEWED";

        setCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID, {
          signRequest: detailResponse.data,
          pdfFile,
          onSign: (certData: FormData) =>
            handleSign(request.sessionId, certData),
          onDecline: () => handleDecline(request.sessionId),
          onBack: () => {
            clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
            navigationActions.setWorkbench("viewer");
          },
          canSign,
        });

        requestAnimationFrame(() => {
          navigationActions.setWorkbench(SIGN_REQUEST_WORKBENCH_TYPE);
        });
      } catch (error) {
        console.error(
          "Failed to load sign request:",
          error instanceof Error ? error.message : error,
        );
        alert({
          alertType: "error",
          title: t("common.error"),
          body: t("signRequest.fetchFailed", "Failed to load sign request"),
          expandable: false,
          durationMs: 3000,
        });
      }
    },
    [
      onClose,
      setCustomWorkbenchViewData,
      clearCustomWorkbenchViewData,
      navigationActions,
      t,
    ],
  );

  // Handle clicking a session
  const handleSessionClick = useCallback(
    async (session: SessionSummary) => {
      onClose();
      try {
        // First fetch session detail
        const detailResponse = await apiClient.get<SessionDetail>(
          `/api/v1/security/cert-sign/sessions/${session.sessionId}`,
        );

        // Determine which endpoint to use based on session state
        let pdfFile: File | null = null;

        if (detailResponse.data.finalized) {
          // Finalized sessions have signed PDF available
          try {
            const pdfResponse = await apiClient.get(
              `/api/v1/security/cert-sign/sessions/${session.sessionId}/signed-pdf`,
              {
                responseType: "blob",
              },
            );
            pdfFile = new File([pdfResponse.data], session.documentName, {
              type: "application/pdf",
            });
          } catch (pdfError: any) {
            if (pdfError?.response?.status === 404) {
              // Finalized but signed PDF not available - backend issue
              alert({
                alertType: "warning",
                title: t("certSign.sessions.pdfNotReady", "PDF Not Ready"),
                body: t(
                  "certSign.sessions.pdfNotReadyDesc",
                  "The signed PDF is being generated. Please try again in a moment.",
                ),
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
              {
                responseType: "blob",
              },
            );
            pdfFile = new File([pdfResponse.data], session.documentName, {
              type: "application/pdf",
            });
          } catch (_error) {
            // Fallback if PDF not available
            pdfFile = null;
          }
        }

        setCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID, {
          session: detailResponse.data,
          pdfFile,
          onFinalize: () =>
            handleFinalize(session.sessionId, session.documentName),
          onLoadSignedPdf: () =>
            handleLoadSignedPdf(session.sessionId, session.documentName),
          onAddParticipants: (userIds: number[], defaultReason?: string) =>
            handleAddParticipants(session.sessionId, userIds, defaultReason),
          onRemoveParticipant: (participantId: number) =>
            handleRemoveParticipant(session.sessionId, participantId),
          onDelete: () => handleDeleteSession(session.sessionId),
          onBack: () => {
            clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
            navigationActions.setWorkbench("viewer");
          },
          onRefresh: () => handleRefreshSession(session.sessionId),
        });

        requestAnimationFrame(() => {
          navigationActions.setWorkbench(SESSION_DETAIL_WORKBENCH_TYPE);
        });
      } catch (error) {
        console.error(
          "Failed to load session:",
          error instanceof Error ? error.message : error,
        );
        alert({
          alertType: "error",
          title: t("common.error"),
          body: t(
            "certSign.sessions.fetchFailed",
            "Failed to load session details",
          ),
          expandable: false,
          durationMs: 3000,
        });
      }
    },
    [
      onClose,
      setCustomWorkbenchViewData,
      clearCustomWorkbenchViewData,
      navigationActions,
      t,
    ],
  );

  // Action handlers
  const handleSign = async (sessionId: string, certificateData: FormData) => {
    await apiClient.post(
      `/api/v1/security/cert-sign/sign-requests/${sessionId}/sign`,
      certificateData,
    );
    alert({
      alertType: "success",
      title: t("success"),
      body: t("signRequest.signed", "Document signed successfully"),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
    navigationActions.setWorkbench("viewer");
    await fetchData();
  };

  const handleDecline = async (sessionId: string) => {
    await apiClient.post(
      `/api/v1/security/cert-sign/sign-requests/${sessionId}/decline`,
    );
    alert({
      alertType: "success",
      title: t("success"),
      body: t("signRequest.declined", "Sign request declined"),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
    navigationActions.setWorkbench("viewer");
    await fetchData();
  };

  const handleFinalize = async (sessionId: string, documentName: string) => {
    const response = await apiClient.post(
      `/api/v1/security/cert-sign/sessions/${sessionId}/finalize`,
      null,
      {
        responseType: "blob",
      },
    );
    const contentDisposition = response.headers["content-disposition"];
    const filenameMatch = contentDisposition?.match(/filename="?(.+?)"?$/);
    const filename = filenameMatch
      ? filenameMatch[1]
      : `${documentName}_signed.pdf`;
    const signedFile = new File([response.data], filename, {
      type: "application/pdf",
    });
    await fileActions.addFiles([signedFile]);
    alert({
      alertType: "success",
      title: t("success"),
      body: t("certSign.sessions.finalized", "Session finalized"),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
    navigationActions.setWorkbench("viewer");
    await fetchData();
  };

  const handleLoadSignedPdf = async (
    sessionId: string,
    documentName: string,
  ) => {
    const response = await apiClient.get(
      `/api/v1/security/cert-sign/sessions/${sessionId}/signed-pdf`,
      {
        responseType: "blob",
      },
    );
    const contentDisposition = response.headers["content-disposition"];
    const filenameMatch = contentDisposition?.match(/filename="?(.+?)"?$/);
    const filename = filenameMatch
      ? filenameMatch[1]
      : `${documentName}_signed.pdf`;
    const signedFile = new File([response.data], filename, {
      type: "application/pdf",
    });
    await fileActions.addFiles([signedFile]);
    alert({
      alertType: "success",
      title: t("success"),
      body: t("certSign.sessions.loaded", "Signed PDF loaded"),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
    navigationActions.setWorkbench("viewer");
  };

  const handleAddParticipants = async (
    sessionId: string,
    userIds: number[],
    defaultReason?: string,
  ) => {
    const requests = userIds.map((userId) => ({
      userId,
      defaultReason: defaultReason || undefined,
      sendNotification: true,
    }));
    await apiClient.post(
      `/api/v1/security/cert-sign/sessions/${sessionId}/participants`,
      requests,
    );
    await handleRefreshSession(sessionId);
  };

  const handleRemoveParticipant = async (
    sessionId: string,
    participantId: number,
  ) => {
    await apiClient.delete(
      `/api/v1/security/cert-sign/sessions/${sessionId}/participants/${participantId}`,
    );
    await handleRefreshSession(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await apiClient.delete(`/api/v1/security/cert-sign/sessions/${sessionId}`);
    alert({
      alertType: "success",
      title: t("success"),
      body: t("certSign.sessions.deleted", "Session deleted"),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
    navigationActions.setWorkbench("viewer");
    await fetchData();
  };

  const handleRefreshSession = async (sessionId: string) => {
    const response = await apiClient.get<SessionDetail>(
      `/api/v1/security/cert-sign/sessions/${sessionId}`,
    );
    // Update workbench data, preserving PDF and callbacks
    setCustomWorkbenchViewData(
      SESSION_DETAIL_WORKBENCH_ID,
      (prevData: any) => ({
        ...prevData,
        session: response.data,
      }),
    );
  };

  if (typeof document === "undefined") return null;

  // Shared card content — rendered inside either the portal (desktop/tablet) or Drawer (phone)
  const popoutCard = (
    <div
      className="quick-access-popout__card"
      style={{
        maxHeight: !isPhone && maxHeight ? `${maxHeight}px` : undefined,
      }}
    >
      {/* Header */}
      <div className="quick-access-popout__header">
        <button
          type="button"
          className={`quick-access-popout__back ${showCreatePanel ? "is-visible" : ""}`}
          onClick={() => setShowCreatePanel(false)}
          aria-label={t("quickAccess.back", "Back")}
        >
          <LocalIcon icon="arrow-back-rounded" width="1rem" height="1rem" />
        </button>
        <div className="quick-access-popout__title">
          {showCreatePanel
            ? t("quickAccess.createSession", "Create Signing Request")
            : groupSigningEnabled && activeTab === "active"
              ? t("quickAccess.activeSessions", "Active Sessions")
              : groupSigningEnabled
                ? t("quickAccess.completedSessions", "Completed Sessions")
                : t("quickAccess.sign", "Sign")}
        </div>
        <div className="quick-access-popout__header-actions">
          {!showCreatePanel && (
            <button
              type="button"
              className="quick-access-popout__header-action"
              onClick={fetchData}
              disabled={loading}
              aria-label={t("quickAccess.refresh", "Refresh")}
              style={{ opacity: loading ? 0.5 : 0.7 }}
            >
              <LocalIcon icon="refresh-rounded" width="1rem" height="1rem" />
            </button>
          )}
          <button
            type="button"
            className="quick-access-popout__header-action"
            onClick={onClose}
            aria-label={t("close", "Close")}
          >
            <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
          </button>
        </div>
      </div>

      {/* Quick sign tools */}
      {!showCreatePanel && (
        <div className="quick-access-popout__quick-sign">
          <div className="quick-access-popout__section-label">
            {t("quickAccess.signYourself", "Sign Yourself")}
          </div>
          <div className="quick-access-popout__quick-sign-actions">
            <button
              type="button"
              className="quick-access-popout__quick-sign-btn"
              onClick={() => {
                onClose();
                handleToolSelect("sign");
              }}
            >
              <LocalIcon icon="signature-rounded" width="1rem" height="1rem" />
              {t("quickAccess.wetSign", "Add Signature")}
            </button>
            <button
              type="button"
              className="quick-access-popout__quick-sign-btn"
              onClick={() => {
                onClose();
                handleToolSelect("certSign");
              }}
            >
              <LocalIcon
                icon="workspace-premium-rounded"
                width="1rem"
                height="1rem"
              />
              {t("quickAccess.certSign", "Certificate Sign")}
            </button>
          </div>
        </div>
      )}

      {/* Signature Requests section label + Tab Navigation */}
      {!showCreatePanel && groupSigningEnabled && (
        <>
          <div className="quick-access-popout__section-label quick-access-popout__section-label--padded quick-access-popout__section-label--row">
            <span>
              {t("quickAccess.signatureRequests", "Signature Requests")}
            </span>
            <button
              type="button"
              className="quick-access-popout__section-action"
              onClick={() => setShowCreatePanel(true)}
              aria-label={t("quickAccess.newRequest", "New request")}
              title={t("quickAccess.newRequest", "New request")}
            >
              <LocalIcon icon="add-rounded" width="1rem" height="1rem" />
            </button>
          </div>
          <div className="quick-access-popout__tab-nav">
            <button
              className={`quick-access-popout__tab-button ${activeTab === "active" ? "active" : ""}`}
              onClick={() => handleTabChange("active")}
            >
              {t("quickAccess.activeTab", "Active")}
            </button>
            <button
              className={`quick-access-popout__tab-button ${activeTab === "completed" ? "active" : ""}`}
              onClick={() => handleTabChange("completed")}
            >
              {t("quickAccess.completedTab", "Completed")}
            </button>
          </div>
        </>
      )}

      {/* Search + filter bar */}
      {!showCreatePanel && groupSigningEnabled && (
        <div className="quick-access-popout__search-filter">
          <input
            type="search"
            className="quick-access-popout__search"
            placeholder={t("quickAccess.searchDocuments", "Search documents…")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="quick-access-popout__filter-chips">
            {filterOptions.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`quick-access-popout__filter-chip ${activeFilters.has(f.key) ? "is-active" : ""}`}
                onClick={() => toggleFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      {groupSigningEnabled && (
        <div className="quick-access-popout__body">
          {showCreatePanel ? (
            <CreateSessionPanel
              selectedFiles={selectedFiles}
              selectedUserIds={selectedUserIds}
              onSelectedUserIdsChange={setSelectedUserIds}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              creating={creating}
              includeSummaryPage={includeSummaryPage}
              onIncludeSummaryPageChange={setIncludeSummaryPage}
            />
          ) : activeTab === "active" ? (
            <ActiveSessionsPanel
              sessions={displayedActiveSessions}
              loading={loading}
              onSessionClick={(item) => {
                if (item.itemType === "signRequest") {
                  handleSignRequestClick(item as SignRequestSummary);
                } else {
                  handleSessionClick(item as SessionSummary);
                }
              }}
            />
          ) : (
            <CompletedSessionsPanel
              sessions={displayedCompletedSessions}
              loading={loading}
              onSessionClick={(item) => {
                if (item.itemType === "signRequest") {
                  handleSignRequestClick(item as SignRequestSummary);
                } else {
                  handleSessionClick(item as SessionSummary);
                }
              }}
            />
          )}
        </div>
      )}

      {/* Footer */}
      {groupSigningEnabled && showCreatePanel && (
        <div className="quick-access-popout__footer">
          <button
            type="button"
            className="quick-access-popout__primary"
            onClick={handleCreateSession}
            disabled={
              selectedFiles.length !== 1 ||
              selectedUserIds.length === 0 ||
              creating
            }
          >
            <LocalIcon icon="send-rounded" width="1rem" height="1rem" />
            {creating
              ? t("quickAccess.sendingRequest", "Sending...")
              : t("quickAccess.requestSignatures", "Request Signatures")}
          </button>
        </div>
      )}
    </div>
  );

  // Phone: bottom-sheet Drawer (full height)
  if (isPhone) {
    return (
      <Drawer
        opened={isOpen}
        onClose={onClose}
        position="bottom"
        size="100%"
        withCloseButton={false}
        padding={0}
        className="quick-access-sign-popout"
        styles={{
          body: {
            padding: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {popoutCard}
      </Drawer>
    );
  }

  // Desktop / tablet: fixed-position portal
  return createPortal(
    <div
      ref={popoverRef}
      className={`quick-access-popout quick-access-sign-popout ${isOpen ? "is-open" : ""}`}
      style={{
        position: "fixed",
        top: `${popoverPosition.top}px`,
        left: `${popoverPosition.left}px`,
        zIndex: Z_INDEX_OVER_FULLSCREEN_SURFACE,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {popoutCard}
    </div>,
    document.body,
  );
};

export default SignPopout;
