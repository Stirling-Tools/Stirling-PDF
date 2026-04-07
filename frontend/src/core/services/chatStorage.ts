/**
 * chatStorage — IndexedDB persistence for agent chat sessions and messages.
 *
 * Database: stirling-pdf-chats v1
 * Stores:
 *   sessions — one record per conversation (title, lastMessage, timestamps)
 *   messages — individual chat messages linked to a session
 */

import { indexedDBManager } from './indexedDBManager';
import type { DatabaseConfig } from './indexedDBManager';
import type { AgentId } from '@app/data/agentRegistry';
import type { AgentTreeNode, ActionDecision, SuggestionChip } from '@app/types/agentChat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatSession {
  id: string;
  agentId: AgentId;
  /** Title derived from the first user message */
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Snippet of the last message for preview */
  lastMessage: string;
}

export interface PersistedChatMessage {
  id: string;
  sessionId: string;
  agentId: AgentId;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  /** Persisted agent call tree for display in history. */
  agentTree?: AgentTreeNode;
  /** Action metadata so history shows the approval bar state. */
  actionType?: string;
  actionPayload?: unknown;
  actionDecision?: ActionDecision;
  isError?: boolean;
  suggestions?: SuggestionChip[];
  selectedSuggestion?: number;
}

// ---------------------------------------------------------------------------
// Database config (local to this module)
// ---------------------------------------------------------------------------

const CHATS_DB_CONFIG: DatabaseConfig = {
  name: 'stirling-pdf-chats',
  version: 1,
  stores: [
    {
      name: 'sessions',
      keyPath: 'id',
      indexes: [
        { name: 'agentId', keyPath: 'agentId', unique: false },
        { name: 'updatedAt', keyPath: 'updatedAt', unique: false },
      ],
    },
    {
      name: 'messages',
      keyPath: 'id',
      indexes: [
        { name: 'sessionId', keyPath: 'sessionId', unique: false },
        { name: 'timestamp', keyPath: 'timestamp', unique: false },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDb(): Promise<IDBDatabase> {
  return indexedDBManager.openDatabase(CHATS_DB_CONFIG);
}

function idbRequest<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const chatStorage = {
  /**
   * Create a new chat session. Title is set from the first user message.
   */
  async createSession(agentId: AgentId, title: string): Promise<ChatSession> {
    const db = await getDb();
    const now = Date.now();
    const session: ChatSession = {
      id: `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      title: title.slice(0, 80) || 'New conversation',
      createdAt: now,
      updatedAt: now,
      lastMessage: '',
    };
    const tx = db.transaction('sessions', 'readwrite');
    await idbRequest(tx.objectStore('sessions').put(session));
    return session;
  },

  /**
   * Patch mutable fields on a session (updatedAt, lastMessage, title).
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Pick<ChatSession, 'title' | 'updatedAt' | 'lastMessage'>>
  ): Promise<void> {
    const db = await getDb();

    // Read
    const readTx = db.transaction('sessions', 'readonly');
    const existing = await idbRequest<ChatSession | undefined>(
      readTx.objectStore('sessions').get(sessionId)
    );
    if (!existing) return;

    // Write
    const writeTx = db.transaction('sessions', 'readwrite');
    await idbRequest(writeTx.objectStore('sessions').put({ ...existing, ...updates }));
  },

  /**
   * Return all sessions for an agent, newest first.
   */
  async getSessionsForAgent(agentId: AgentId): Promise<ChatSession[]> {
    const db = await getDb();
    const tx = db.transaction('sessions', 'readonly');
    const sessions = await idbRequest<ChatSession[]>(
      tx.objectStore('sessions').index('agentId').getAll(agentId)
    );
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /**
   * Delete a session and all its messages atomically.
   */
  async deleteSession(sessionId: string): Promise<void> {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sessions', 'messages'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      // Delete the session record
      tx.objectStore('sessions').delete(sessionId);

      // Delete all messages for this session via cursor
      const cursorReq = tx
        .objectStore('messages')
        .index('sessionId')
        .openCursor(IDBKeyRange.only(sessionId));

      cursorReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  },

  /**
   * Persist a single chat message.
   */
  async addMessage(message: PersistedChatMessage): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('messages', 'readwrite');
    await idbRequest(tx.objectStore('messages').put(message));
  },

  /**
   * Patch mutable fields on a persisted message (e.g. actionDecision after user approval).
   */
  async updateMessage(
    messageId: string,
    updates: Partial<Pick<PersistedChatMessage, 'actionDecision' | 'content' | 'isError'>>
  ): Promise<void> {
    const db = await getDb();
    const readTx = db.transaction('messages', 'readonly');
    const existing = await idbRequest<PersistedChatMessage | undefined>(
      readTx.objectStore('messages').get(messageId)
    );
    if (!existing) return;
    const writeTx = db.transaction('messages', 'readwrite');
    await idbRequest(writeTx.objectStore('messages').put({ ...existing, ...updates }));
  },

  /**
   * Return all messages for a session, sorted by timestamp ascending.
   */
  async getMessagesForSession(sessionId: string): Promise<PersistedChatMessage[]> {
    const db = await getDb();
    const tx = db.transaction('messages', 'readonly');
    const msgs = await idbRequest<PersistedChatMessage[]>(
      tx.objectStore('messages').index('sessionId').getAll(sessionId)
    );
    return msgs.sort((a, b) => a.timestamp - b.timestamp);
  },

  /**
   * Return all sessions across all agents, newest first.
   */
  async getAllSessions(): Promise<ChatSession[]> {
    const db = await getDb();
    const tx = db.transaction('sessions', 'readonly');
    const sessions = await idbRequest<ChatSession[]>(tx.objectStore('sessions').getAll());
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  },
};
