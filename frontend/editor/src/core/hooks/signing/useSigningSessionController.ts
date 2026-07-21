import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { alert } from "@app/components/toast";
import { fileStorage } from "@app/services/fileStorage";
import { createFileFromApiResponse } from "@app/utils/fileResponseUtils";
import {
  SignRequestSummary,
  SignRequestDetail,
  SessionSummary,
  SessionDetail,
} from "@app/types/signingSession";
import type { SignaturePreview } from "@app/components/viewer/viewerTypes";
import { getFileColor } from "@app/components/pageEditor/fileColors";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { useFileActions } from "@app/contexts/FileContext";
import { useSigningOverlay } from "@app/contexts/SigningOverlayContext";
import { useViewScopedFiles } from "@app/hooks/tools/shared/useViewScopedFiles";
import { useSigningSessions } from "@app/hooks/signing/useSigningSessions";
import { markSessionSeen } from "@app/services/signingSeenStore";
import type { SignatureSettings } from "@app/components/tools/certSign/SignatureSettingsInput";

/** Which Shared Signing screen the sidebar tool is currently showing. */
export type SigningView = "list" | "detail" | "request";

/** Data the session-detail sidebar panel needs to render and act. */
export interface SigningDetailData {
  session: SessionDetail;
  pdfFile: File | null;
  onFinalize: () => Promise<void>;
  onLoadSignedPdf: () => Promise<void>;
  onAddParticipants: (
    userIds: number[],
    defaultReason?: string,
  ) => Promise<void>;
  onRemoveParticipant: (participantId: number) => Promise<void>;
  onDelete: () => Promise<void>;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

/** Data the sign-request sidebar panel needs to render and act. */
export interface SigningRequestData {
  signRequest: SignRequestDetail;
  pdfFile: File;
  onSign: (certificateData: FormData) => Promise<void>;
  onDecline: () => Promise<void>;
  onBack: () => void;
  canSign: boolean;
}

function countSignedParticipants(session: SessionDetail): number {
  return session.participants.filter((p) => p.status === "SIGNED").length;
}

// Read-only overlay previews for every participant's already-placed wet
// signatures, coloured per participant (matches the participant list dots).
function computeWetSignaturePreviews(
  session: SessionDetail,
): SignaturePreview[] {
  const previews: SignaturePreview[] = [];
  session.participants.forEach((participant, participantIndex) => {
    if (participant.wetSignatures && participant.wetSignatures.length > 0) {
      const color = getFileColor(participantIndex);
      const participantName = participant.name || participant.email;
      participant.wetSignatures.forEach((wetSig, sigIndex) => {
        previews.push({
          id: `participant-${participant.userId}-sig-${sigIndex}`,
          pageIndex: wetSig.page,
          x: wetSig.x,
          y: wetSig.y,
          width: wetSig.width,
          height: wetSig.height,
          signatureData: wetSig.data,
          signatureType: "image" as const,
          color,
          participantName,
        });
      });
    }
  });
  return previews;
}

/** Owns Shared Signing state: data fetch, session creation, and opening a request/session into the sidebar tool (driving the viewer overlay). */
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
  const { setOverlay } = useSigningOverlay();

  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<SigningView>("list");
  const [detailData, setDetailData] = useState<SigningDetailData | null>(null);
  const [requestData, setRequestData] = useState<SigningRequestData | null>(
    null,
  );
  // The session currently shown in the detail view. A refresh checks this at
  // resolve time so a request dispatched before navigation is discarded rather
  // than painting its data onto whatever is now on screen.
  const openDetailSessionIdRef = useRef<string | null>(null);

  // Leaving the tool (panel unmounts) must not leave the signing document and
  // overlays lingering on the shared viewer.
  useEffect(() => {
    return () => setOverlay(null);
  }, [setOverlay]);

  const backToList = useCallback(() => {
    openDetailSessionIdRef.current = null;
    setOverlay(null);
    setDetailData(null);
    setRequestData(null);
    setView("list");
  }, [setOverlay]);

  // --- Action handlers (invoked from the sidebar panels) ---

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
    backToList();
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
    backToList();
    await refetch();
  };

  const handleFinalize = async (sessionId: string, documentName: string) => {
    const response = await apiClient.post(
      `/api/v1/security/cert-sign/sessions/${sessionId}/finalize`,
      null,
      { responseType: "blob" },
    );
    const signedFile = createFileFromApiResponse(
      response.data,
      response.headers,
      `${documentName}_signed.pdf`,
    );
    await fileActions.addFiles([signedFile], { skipUploadTracking: true });
    alert({
      alertType: "success",
      title: t("success"),
      body: t("certSign.sessions.finalized", "Session finalized"),
      expandable: false,
      durationMs: 2500,
    });
    backToList();
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
    const signedFile = createFileFromApiResponse(
      response.data,
      response.headers,
      `${documentName}_signed.pdf`,
    );
    await fileActions.addFiles([signedFile], { skipUploadTracking: true });
    alert({
      alertType: "success",
      title: t("success"),
      body: t("certSign.sessions.loaded", "Signed PDF loaded"),
      expandable: false,
      durationMs: 2500,
    });
    backToList();
  };

  const handleRefreshSession = async (sessionId: string) => {
    const response = await apiClient.get<SessionDetail>(
      `/api/v1/security/cert-sign/sessions/${sessionId}`,
    );
    const session = response.data;
    markSessionSeen(session.sessionId, countSignedParticipants(session));
    // Discard a refresh that resolves after the user navigated away, so we
    // never paint this session's data onto another document.
    if (openDetailSessionIdRef.current !== session.sessionId) return;
    setDetailData((prev) => (prev ? { ...prev, session } : prev));
    // Keep the read-only overlay in sync as participants sign.
    setOverlay((prev) =>
      prev
        ? { ...prev, signaturePreviews: computeWetSignaturePreviews(session) }
        : prev,
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
    backToList();
    await refetch();
  };

  // --- Open into the sidebar detail/request views ---

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

      // Leaving the detail view: stop any in-flight detail refresh from applying.
      openDetailSessionIdRef.current = null;
      // Seed the viewer with the document immediately; the request panel enriches
      // the overlay with interactive placement props once it mounts.
      setOverlay({ file: pdfFile });
      setRequestData({
        signRequest: detailResponse.data,
        pdfFile,
        onSign: (certData: FormData) => handleSign(request.sessionId, certData),
        onDecline: () => handleDecline(request.sessionId),
        onBack: backToList,
        canSign,
      });
      setView("request");
      navigationActions.setWorkbench("viewer");
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
      // Owner is now viewing this session — clear its "new signatures" badge.
      markSessionSeen(
        session.sessionId,
        countSignedParticipants(detailResponse.data),
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

      openDetailSessionIdRef.current = session.sessionId;
      setOverlay({
        file: pdfFile,
        signaturePreviews: computeWetSignaturePreviews(detailResponse.data),
        signaturePreviewsReadOnly: true,
      });
      setDetailData({
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
        onBack: backToList,
        onRefresh: () => handleRefreshSession(session.sessionId),
      });
      setView("detail");
      navigationActions.setWorkbench("viewer");
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
    view,
    detailData,
    requestData,
    backToList,
  };
}
