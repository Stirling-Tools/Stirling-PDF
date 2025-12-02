export interface SessionSummary {
  sessionId: string;
  documentName: string;
  createdAt: string;
  participantCount: number;
  signedCount: number;
  finalized: boolean;
}

export interface SessionDetail {
  sessionId: string;
  documentName: string;
  ownerEmail: string;
  message: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  finalized: boolean;
  participants: ParticipantInfo[];
}

export interface ParticipantInfo {
  email: string;
  name: string;
  status: 'PENDING' | 'NOTIFIED' | 'VIEWED' | 'SIGNED';
  shareToken: string;
  lastUpdated: string;
  participantUrl: string;
}
