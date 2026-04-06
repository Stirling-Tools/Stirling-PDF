/**
 * ChatHistoryView — lists all previous chat sessions for the active agent.
 *
 * Rendered inside AgentChat when the user clicks the history button.
 * Allows resuming a past session or starting a new one.
 */

import React, { useCallback, useEffect, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { chatStorage, ChatSession } from '@app/services/chatStorage';
import type { AgentId } from '@app/data/agentRegistry';

import '@app/components/rightPanel/ChatHistoryView.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChatHistoryViewProps {
  agentId: AgentId;
  /** The session currently loaded in the chat view */
  currentSessionId: string | null;
  /** User clicked a session to resume */
  onSelectSession: (sessionId: string) => void;
  /** User wants to start a brand-new conversation */
  onNewChat: () => void;
  /** Called to delete a session; parent handles both DB and context state */
  onDeleteSession: (sessionId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatHistoryView({
  agentId,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}: ChatHistoryViewProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSessions = useCallback(() => {
    setLoading(true);
    chatStorage
      .getSessionsForAgent(agentId)
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      setDeletingId(sessionId);
      try {
        await onDeleteSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      } finally {
        setDeletingId(null);
      }
    },
    [onDeleteSession]
  );

  return (
    <div className="chat-history-view">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="chat-history-header">
        <span className="chat-history-title">Previous Chats</span>
        <button
          className="chat-history-new-btn"
          onClick={onNewChat}
          title="Start a new conversation"
        >
          <AddRoundedIcon sx={{ fontSize: '0.8125rem' }} />
          New Chat
        </button>
      </div>

      {/* ── Session list ─────────────────────────────────── */}
      <div className="chat-history-list">
        {loading && (
          <div className="chat-history-state">
            <div className="chat-history-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="chat-history-state chat-history-state--empty">
            <ChatBubbleOutlineRoundedIcon sx={{ fontSize: '1.5rem', opacity: 0.3 }} />
            <span>No previous conversations</span>
          </div>
        )}

        {!loading &&
          sessions.map((session) => {
            const isActive = session.id === currentSessionId;
            const isDeleting = deletingId === session.id;

            return (
              <div
                key={session.id}
                className={`chat-history-item${isActive ? ' chat-history-item--active' : ''}`}
                onClick={() => !isDeleting && onSelectSession(session.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectSession(session.id);
                }}
              >
                <div className="chat-history-item-body">
                  <div className="chat-history-item-title">{session.title}</div>
                  {session.lastMessage && (
                    <div className="chat-history-item-preview">{session.lastMessage}</div>
                  )}
                </div>

                <div className="chat-history-item-side">
                  <span className="chat-history-item-date">
                    {formatRelativeDate(session.updatedAt)}
                  </span>
                  <button
                    className="chat-history-delete-btn"
                    onClick={(e) => handleDelete(e, session.id)}
                    disabled={isDeleting}
                    aria-label="Delete conversation"
                    title="Delete"
                  >
                    <DeleteOutlineRoundedIcon sx={{ fontSize: '0.75rem' }} />
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
