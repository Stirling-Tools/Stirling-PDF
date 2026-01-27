import api from '@app/services/api';

export interface WorkflowCreationRequest {
  workflowType: 'SIGNING' | 'REVIEW' | 'APPROVAL';
  documentName?: string;
  ownerEmail?: string;
  message?: string;
  dueDate?: string;
  participantEmails?: string[];
  participantUserIds?: number[];
  workflowMetadata?: string;
}

export interface ParticipantResponse {
  id: number;
  userId?: number;
  email: string;
  name: string;
  status: 'PENDING' | 'NOTIFIED' | 'VIEWED' | 'SIGNED' | 'DECLINED';
  shareToken: string;
  accessRole: 'EDITOR' | 'COMMENTER' | 'VIEWER';
  expiresAt?: string;
  lastUpdated: string;
  hasCompleted: boolean;
  isExpired: boolean;
}

export interface WorkflowSessionResponse {
  sessionId: string;
  ownerId: number;
  ownerUsername: string;
  workflowType: 'SIGNING' | 'REVIEW' | 'APPROVAL';
  documentName: string;
  ownerEmail?: string;
  message?: string;
  dueDate?: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
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
   * Create a new workflow session
   */
  async createSession(file: File, request: WorkflowCreationRequest): Promise<WorkflowSessionResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workflowType', request.workflowType);

    if (request.documentName) formData.append('documentName', request.documentName);
    if (request.ownerEmail) formData.append('ownerEmail', request.ownerEmail);
    if (request.message) formData.append('message', request.message);
    if (request.dueDate) formData.append('dueDate', request.dueDate);
    if (request.workflowMetadata) formData.append('workflowMetadata', request.workflowMetadata);

    if (request.participantEmails) {
      request.participantEmails.forEach((email) => {
        formData.append('participantEmails', email);
      });
    }

    if (request.participantUserIds) {
      request.participantUserIds.forEach((id) => {
        formData.append('participantUserIds', id.toString());
      });
    }

    const response = await api.post('/api/v1/workflow/sessions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * List all workflow sessions for the current user
   */
  async listSessions(): Promise<WorkflowSessionResponse[]> {
    const response = await api.get('/api/v1/workflow/sessions');
    return response.data;
  }

  /**
   * List active workflow sessions
   */
  async listActiveSessions(): Promise<WorkflowSessionResponse[]> {
    const response = await api.get('/api/v1/workflow/sessions/active');
    return response.data;
  }

  /**
   * Get workflow session details
   */
  async getSession(sessionId: string): Promise<WorkflowSessionResponse> {
    const response = await api.get(`/api/v1/workflow/sessions/${sessionId}`);
    return response.data;
  }

  /**
   * Delete a workflow session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await api.delete(`/api/v1/workflow/sessions/${sessionId}`);
  }

  /**
   * Finalize a signing workflow session
   */
  async finalizeSession(sessionId: string): Promise<Blob> {
    const response = await api.post(
      `/api/v1/workflow/sessions/${sessionId}/finalize`,
      null,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  }

  /**
   * Get signed PDF from finalized session
   */
  async getSignedPdf(sessionId: string): Promise<Blob> {
    const response = await api.get(
      `/api/v1/workflow/sessions/${sessionId}/signed-pdf`,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  }

  /**
   * Get original PDF from session
   */
  async getOriginalPdf(sessionId: string): Promise<Blob> {
    const response = await api.get(
      `/api/v1/workflow/sessions/${sessionId}/original-pdf`,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  }

  /**
   * Get session details by participant token (no authentication required)
   */
  async getSessionByToken(token: string): Promise<WorkflowSessionResponse> {
    const response = await api.get('/api/v1/workflow/participant/session', {
      params: { token },
    });
    return response.data;
  }

  /**
   * Get participant details by token
   */
  async getParticipantDetails(token: string): Promise<ParticipantResponse> {
    const response = await api.get('/api/v1/workflow/participant/details', {
      params: { token },
    });
    return response.data;
  }

  /**
   * Submit signature as a participant
   */
  async submitSignature(request: SignatureSubmissionRequest): Promise<ParticipantResponse> {
    const formData = new FormData();
    formData.append('participantToken', request.participantToken);

    if (request.certType) formData.append('certType', request.certType);
    if (request.password) formData.append('password', request.password);
    if (request.p12File) formData.append('p12File', request.p12File);
    if (request.jksFile) formData.append('jksFile', request.jksFile);
    if (request.showSignature !== undefined) formData.append('showSignature', request.showSignature.toString());
    if (request.pageNumber) formData.append('pageNumber', request.pageNumber.toString());
    if (request.location) formData.append('location', request.location);
    if (request.reason) formData.append('reason', request.reason);
    if (request.showLogo !== undefined) formData.append('showLogo', request.showLogo.toString());
    if (request.wetSignatureData) formData.append('wetSignatureData', request.wetSignatureData);

    const response = await api.post('/api/v1/workflow/participant/submit-signature', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * Decline participation
   */
  async declineParticipation(token: string, reason?: string): Promise<ParticipantResponse> {
    const response = await api.post('/api/v1/workflow/participant/decline', null, {
      params: { token, reason },
    });
    return response.data;
  }

  /**
   * Download document as participant
   */
  async getParticipantDocument(token: string): Promise<Blob> {
    const response = await api.get('/api/v1/workflow/participant/document', {
      params: { token },
      responseType: 'blob',
    });
    return response.data;
  }
}

export default new WorkflowService();
