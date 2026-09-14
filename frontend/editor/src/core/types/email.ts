export type EmailProvider = "Microsoft 365" | "Gmail";

export interface EmailAccountRecord {
  id: string;
  email: string;
  provider: EmailProvider;
  displayName?: string;
  connectedAt: string;
  lastSyncedAt?: string;
}

export interface EmailAttachmentRecord {
  id: string;
  accountId: string;
  messageId: string;
  name: string;
  type: string;
  size: string;
  cachedAt?: string;
  expiresAt?: string;
}

export interface EmailMessageRecord {
  id: string;
  accountId: string;
  sender: string;
  address: string;
  subject: string;
  preview: string;
  date: string;
  unread?: boolean;
  hasAttachment?: boolean;
  syncedAt: string;
}
