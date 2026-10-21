import api from "@app/services/apiClient";

export interface ParticipantResponse {
  id: number;
  userId?: number;
  email: string;
  name: string;
  status: "PENDING" | "NOTIFIED" | "VIEWED" | "SIGNED" | "DECLINED";
  // Null for participant-facing endpoints (`/api/v1/workflow/participant/...`); the owner-facing
  // `/api/v1/security/cert-sign/sessions/...` endpoints still populate it for share-link
  // distribution. Never used to look up other participants — see GHSA-qgg6-mxw4-xg62.
  shareToken: string | null;
  accessRole: "EDITOR" | "COMMENTER" | "VIEWER";
  expiresAt?: string;
  lastUpdated: string;
  hasCompleted: boolean;
  isExpired: boolean;
}

export interface WorkflowSessionResponse {
  sessionId: string;
  ownerId: number;
  ownerUsername: string;
  workflowType: "SIGNING" | "REVIEW" | "APPROVAL";
  documentName: string;
  ownerEmail?: string;
  message?: string;
  dueDate?: string;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  finalized: boolean;
  createdAt: string;
  updatedAt: string;
  participants: ParticipantResponse[];
  hasProcessedFile: boolean;
  originalFileId?: number;
  processedFileId?: number;
}

export interface SignatureSubmissionRequest {
  participantToken: string;
  certType?: string;
  password?: string;
  p12File?: File;
  jksFile?: File;
  showSignature?: boolean;
  pageNumber?: number;
  location?: string;
  reason?: string;
  showLogo?: boolean;
  wetSignatureData?: string;
}

/**
 * Service for managing workflow sessions
 */
class WorkflowService {
  /**
   * Get session details by participant token (no authentication required)
   */
  async getSessionByToken(token: string): Promise<WorkflowSessionResponse> {
    const response = await api.get("/api/v1/workflow/participant/session", {
      params: { token },
    });
    return response.data;
  }

  /**
   * Get participant details by token
   */
  async getParticipantDetails(token: string): Promise<ParticipantResponse> {
    const response = await api.get("/api/v1/workflow/participant/details", {
      params: { token },
    });
    return response.data;
  }

  /**
   * Submit signature as a participant
   */
  async submitSignature(
    request: SignatureSubmissionRequest,
  ): Promise<ParticipantResponse> {
    const formData = new FormData();
    formData.append("participantToken", request.participantToken);

    if (request.certType) formData.append("certType", request.certType);
    if (request.password) formData.append("password", request.password);
    if (request.p12File) formData.append("p12File", request.p12File);
    if (request.jksFile) formData.append("jksFile", request.jksFile);
    if (request.showSignature !== undefined)
      formData.append("showSignature", request.showSignature.toString());
    if (request.pageNumber)
      formData.append("pageNumber", request.pageNumber.toString());
    if (request.location) formData.append("location", request.location);
    if (request.reason) formData.append("reason", request.reason);
    if (request.showLogo !== undefined)
      formData.append("showLogo", request.showLogo.toString());
    if (request.wetSignatureData)
      formData.append("wetSignatureData", request.wetSignatureData);

    const response = await api.post(
      "/api/v1/workflow/participant/submit-signature",
      formData,
    );
    return response.data;
  }

  /**
   * Decline participation
   */
  async declineParticipation(
    token: string,
    reason?: string,
  ): Promise<ParticipantResponse> {
    const response = await api.post(
      "/api/v1/workflow/participant/decline",
      null,
      {
        params: { token, reason },
      },
    );
    return response.data;
  }

  /**
   * Download document as participant
   */
  async getParticipantDocument(token: string): Promise<Blob> {
    const response = await api.get("/api/v1/workflow/participant/document", {
      params: { token },
      responseType: "blob",
    });
    return response.data;
  }
}

export default new WorkflowService();
