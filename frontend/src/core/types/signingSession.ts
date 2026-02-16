export interface WetSignatureMetadata {
  type: 'canvas' | 'image' | 'text';
  data: string; // Base64-encoded image data or text content
  page: number; // Zero-indexed page number
  x: number; // X coordinate in PDF points
  y: number; // Y coordinate in PDF points (top-left origin)
  width: number; // Width in PDF points
  height: number; // Height in PDF points
}

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
  userId: number;
  email: string;
  name: string;
  status: 'PENDING' | 'NOTIFIED' | 'VIEWED' | 'SIGNED' | 'DECLINED';
  lastUpdated: string;
  // Signature appearance settings (owner-controlled)
  showSignature?: boolean;
  pageNumber?: number;
  reason?: string;
  location?: string;
  showLogo?: boolean;
  // Wet signatures (visual annotations placed by participant)
  wetSignatures?: WetSignatureMetadata[];
}

export interface UserSummary {
  userId: number;
  username: string;
  displayName: string;
  teamName: string | null;
  enabled: boolean;
}

export interface SignRequestSummary {
  sessionId: string;
  documentName: string;
  ownerUsername: string;
  createdAt: string;
  dueDate: string;
  myStatus: 'PENDING' | 'NOTIFIED' | 'VIEWED' | 'SIGNED' | 'DECLINED';
}

export interface SignRequestDetail {
  sessionId: string;
  documentName: string;
  ownerUsername: string;
  message: string;
  dueDate: string;
  createdAt: string;
  myStatus: 'PENDING' | 'NOTIFIED' | 'VIEWED' | 'SIGNED' | 'DECLINED';
  // Signature appearance settings (read-only, configured by owner)
  showSignature?: boolean;
  pageNumber?: number;
  reason?: string;
  location?: string;
  showLogo?: boolean;
}
