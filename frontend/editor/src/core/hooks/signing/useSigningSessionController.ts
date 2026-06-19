import { lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { alert } from "@app/components/toast";
import { fileStorage } from "@app/services/fileStorage";
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
import { useFileActions } from "@app/contexts/FileContext";
import { useViewScopedFiles } from "@app/hooks/tools/shared/useViewScopedFiles";
import { useSigningSessions } from "@app/hooks/signing/useSigningSessions";
import type { SignatureSettings } from "@app/components/tools/certSign/SignatureSettingsInput";

// The workbench views pull in the PDF viewer / pdfium chain, so they are loaded
// on demand when the user actually opens a request/session.
const SignRequestWorkbenchView = lazy(
  () => import("@app/components/tools/certSign/SignRequestWorkbenchView"),
);
const SessionDetailWorkbenchView = lazy(
  () => import("@app/components/tools/certSign/SessionDetailWorkbenchView"),
);

export const SIGN_REQUEST_WORKBENCH_TYPE =
  "custom:signRequestWorkbench" as const;
export const SESSION_DETAIL_WORKBENCH_TYPE =
  "custom:sessionDetailWorkbench" as const;
const SIGN_REQUEST_WORKBENCH_ID = "signRequestWorkbench";
const SESSION_DETAIL_WORKBENCH_ID = "sessionDetailWorkbench";

/**
 * Owns all collaborative-signing session state and behaviour: data fetching,
 * registering the request/session detail workbench views, creating sessions,
 * and opening a request/session into its workbench view (wiring the sign /
 * decline / finalize / participant callbacks).
 *
 * UI-agnostic — consumed by the Shared Signing tool to render a panel. Ported
 * from the legacy QuickAccessBar SignPopout so the behaviour is unchanged.
 */
export function useSigningSessionController(enabled: boolean) {
  const { t } = useTranslation();
  const { signRequests, mySessions, loading, refetch } = useSigningSessions({
    enabled,
    autoRefreshInterval: enabled ? 15000 : 0,
  });
  const { actions: fileActions } = useFileActions();
  // In viewer mode this is the single displayed file; matches how tools scope
  // their input (see useBaseTool / useViewScopedFiles). Creating a session
  // requires exactly one file.
  const selectedFiles = useViewScopedFiles();
  const { actions: navigationActions } = useNavigationActions();
  const { workbench: currentView } = useNavigationState();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();

  const [creating, setCreating] = useState(false);

  // Register the request/session workbench views while the feature is enabled.
  // No unmount cleanup: navigating into a view unmounts this hook's host (the
  // tool panel), and the view must stay registered. Re-registration is
  // idempotent; we only unregister when the feature is explicitly disabled.
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  useEffect(() => {
    if (enabled) return;
    unregisterCustomWorkbenchView(SIGN_REQUEST_WORKBENCH_ID);
    unregisterCustomWorkbenchView(SESSION_DETAIL_WORKBENCH_ID);
  }, [enabled, unregisterCustomWorkbenchView]);

  // Clear workbench data once the user navigates away from a view.
  useEffect(() => {
    if (currentView !== SIGN_REQUEST_WORKBENCH_TYPE) {
      clearCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID);
    }
  }, [currentView]);
  useEffect(() => {
    if (currentView !== SESSION_DETAIL_WORKBENCH_TYPE) {
      clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
    }
  }, [currentView]);

  // --- Action handlers (invoked from the workbench views via their data) ---

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
    await refetch();
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
    await refetch();
  };

  const handleFinalize = async (sessionId: string, documentName: string) => {
    const response = await apiClient.post(
      `/api/v1/security/cert-sign/sessions/${sessionId}/finalize`,
      null,
      { responseType: "blob" },
    );
    const contentDisposition = response.headers["content-disposition"];
    const filenameMatch = contentDisposition?.match(/filename="?(.+?)"?$/);
    const filename = filenameMatch
      ? filenameMatch[1]
      : `${documentName}_signed.pdf`;
    const signedFile = new File([response.data], filename, {
      type: "application/pdf",
    });
    await fileActions.addFiles([signedFile], { skipUploadTracking: true });
    alert({
      alertType: "success",
      title: t("success"),
      body: t("certSign.sessions.finalized", "Session finalized"),
      expandable: false,
      durationMs: 2500,
    });
    clearCustomWorkbenchViewData(SESSION_DETAIL_WORKBENCH_ID);
    navigationActions.setWorkbench("viewer");
    await refetch();
  };

  const handleLoadSignedPdf = async (
    sessionId: string,
    documentName: string,
  ) => {
    const response = await apiClient.get(
      `/api/v1/security/cert-sign/sessions/${sessionId}/signed-pdf`,
      { responseType: "blob" },
    );
    const contentDisposition = response.headers["content-disposition"];
    const filenameMatch = contentDisposition?.match(/filename="?(.+?)"?$/);
    const filename = filenameMatch
      ? filenameMatch[1]
      : `${documentName}_signed.pdf`;
    const signedFile = new File([response.data], filename, {
      type: "application/pdf",
    });
    await fileActions.addFiles([signedFile], { skipUploadTracking: true });
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

  const handleRefreshSession = async (sessionId: string) => {
    const response = await apiClient.get<SessionDetail>(
      `/api/v1/security/cert-sign/sessions/${sessionId}`,
    );
    setCustomWorkbenchViewData(
      SESSION_DETAIL_WORKBENCH_ID,
      (prevData: any) => ({ ...prevData, session: response.data }),
    );
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
    await refetch();
  };

  // --- Open into workbench views ---

  const openSignRequest = async (request: SignRequestSummary) => {
    try {
      const [detailResponse, pdfResponse] = await Promise.all([
        apiClient.get<SignRequestDetail>(
          `/api/v1/security/cert-sign/sign-requests/${request.sessionId}`,
        ),
        apiClient.get(
          `/api/v1/security/cert-sign/sign-requests/${request.sessionId}/document`,
          { responseType: "blob" },
        ),
      ]);
      const pdfFile = new File(
        [pdfResponse.data],
        detailResponse.data.documentName,
        { type: "application/pdf" },
      );
      const canSign =
        detailResponse.data.myStatus === "PENDING" ||
        detailResponse.data.myStatus === "NOTIFIED" ||
        detailResponse.data.myStatus === "VIEWED";

      setCustomWorkbenchViewData(SIGN_REQUEST_WORKBENCH_ID, {
        signRequest: detailResponse.data,
        pdfFile,
        onSign: (certData: FormData) => handleSign(request.sessionId, certData),
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
  };

  const openSession = async (session: SessionSummary) => {
    try {
      const detailResponse = await apiClient.get<SessionDetail>(
        `/api/v1/security/cert-sign/sessions/${session.sessionId}`,
      );
      let pdfFile: File | null = null;
      if (detailResponse.data.finalized) {
        try {
          const pdfResponse = await apiClient.get(
            `/api/v1/security/cert-sign/sessions/${session.sessionId}/signed-pdf`,
            { responseType: "blob" },
          );
          pdfFile = new File([pdfResponse.data], session.documentName, {
            type: "application/pdf",
          });
        } catch (pdfError: any) {
          if (pdfError?.response?.status === 404) {
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
        try {
          const pdfResponse = await apiClient.get(
            `/api/v1/security/cert-sign/sessions/${session.sessionId}/pdf`,
            { responseType: "blob" },
          );
          pdfFile = new File([pdfResponse.data], session.documentName, {
            type: "application/pdf",
          });
        } catch (_error) {
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
  };

  // --- Create a new signing request from the currently selected file ---

  const createSession = async (
    signatureSettings: SignatureSettings,
    selectedUserIds: number[],
    dueDate: string,
  ): Promise<boolean> => {
    if (selectedUserIds.length === 0 || selectedFiles.length !== 1) {
      return false;
    }
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
      if (signatureSettings.includeSummaryPage) {
        formData.append(
          "workflowMetadata",
          JSON.stringify({ includeSummaryPage: true }),
        );
      }

      await apiClient.post("/api/v1/security/cert-sign/sessions", formData);
      alert({
        alertType: "success",
        title: t("success"),
        body: t("signSession.created", "Signing request sent"),
        expandable: false,
        durationMs: 2500,
      });
      await refetch();
      return true;
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
      return false;
    } finally {
      setCreating(false);
    }
  };

  return {
    signRequests,
    mySessions,
    loading,
    creating,
    refetch,
    createSession,
    openSignRequest,
    openSession,
  };
}
