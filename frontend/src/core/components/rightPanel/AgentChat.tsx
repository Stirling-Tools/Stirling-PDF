/**
 * AgentChat — inline chat view in the right panel.
 *
 * Design:
 *  - User messages render as right-aligned chat bubbles
 *  - AI responses render as plain full-width text (no bubble)
 *  - Agent/tool calls render as flat collapsible rows (accordion style)
 *  - No indentation nesting — all agent rows are flush-left with borders
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import { Loader } from '@mantine/core';

import { useAgentChatState, useAgentChatActions } from '@app/contexts/AgentChatContext';
import { ChatHistoryView } from '@app/components/rightPanel/ChatHistoryView';
import { ChatMessageView } from '@app/components/rightPanel/ChatMessageView';
import { QuickActionChips } from '@app/components/rightPanel/QuickActionChips';
import { useFileContext } from '@app/contexts/file/fileHooks';
import { AgentDefinition } from '@app/data/agentRegistry';
import { resolveAgentIcon } from '@app/components/rightPanel/AgentIconMap';
import { extractTextFromFiles } from '@app/services/pdfTextExtractionService';
import { createChildStub } from '@app/contexts/file/fileActions';
import { createStirlingFile } from '@app/types/fileContext';
import { thumbnailGenerationService } from '@app/services/thumbnailGenerationService';
import type { ActionFileResult } from '@app/services/agentActionService';

import '@app/components/rightPanel/AgentChat.css';

// ---------------------------------------------------------------------------
// Main AgentChat
// ---------------------------------------------------------------------------

interface AgentChatProps {
  agent: AgentDefinition;
  onBack: () => void;
}

export function AgentChat({ agent, onBack }: AgentChatProps) {
  const { messages, isStreaming, sessionId, isLoadingHistory } = useAgentChatState();
  const { sendMessage, cancelStream, clearChat, toggleNodeExpanded, handleAction, setAutoAccept,
          setCurrentAgent, openSession, deleteSession, selectSuggestion } = useAgentChatActions();
  const { activeFiles, consumeFiles, findFileId, selectors } = useFileContext();
  const [input, setInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Notify context which agent is open (triggers history auto-load on first open)
  useEffect(() => {
    setCurrentAgent(agent.id);
  }, [agent.id, setCurrentAgent]);

  // Close history view when a new message arrives
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current && historyOpen) {
      setHistoryOpen(false);
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, historyOpen]);

  // Cache extracted text to avoid re-extracting for every message
  const textCacheRef = useRef<{ fileKey: string; text: string } | null>(null);
  // Track whether we already sent extracted text for the current file key
  const sentTextKeyRef = useRef<string | null>(null);

  const handleSelectSession = useCallback((sid: string) => {
    openSession(sid);
    setHistoryOpen(false);
  }, [openSession]);

  const handleNewChat = useCallback(() => {
    clearChat();
    setHistoryOpen(false);
  }, [clearChat]);

  // Listen for files produced by agent actions and add them as new versions
  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    const handler = async (e: Event) => {
      const { results, actionType } = (e as CustomEvent<{ results: ActionFileResult[]; actionType: string }>).detail;

      const inputFileIds: string[] = [];
      const outputFiles: ReturnType<typeof createStirlingFile>[] = [];
      const outputStubs: ReturnType<typeof createChildStub>[] = [];

      for (const result of results) {
        // Find the input file's ID in the workbench
        const inputId = findFileId(result.inputFile);
        if (!inputId) continue;

        const parentStub = selectors.getStirlingFileStub(inputId);
        if (!parentStub) continue;

        const outputFile = new File([result.outputBlob], result.outputFileName, { type: 'application/pdf' });

        // Generate thumbnail for the new version
        let thumbnail: string | undefined;
        try {
          const ab = await outputFile.arrayBuffer();
          const thumbResults = await thumbnailGenerationService.generateThumbnails(
            inputId, ab, [1], { scale: 1.0, quality: 0.9 }
          );
          thumbnail = thumbResults[0]?.thumbnail;
        } catch {
          // Continue without thumbnail
        }

        const operation = { toolId: actionType as any, timestamp: Date.now() };
        const childStub = createChildStub(parentStub, operation, outputFile, thumbnail);
        const stirlingFile = createStirlingFile(outputFile, childStub.id);

        inputFileIds.push(inputId);
        outputFiles.push(stirlingFile);
        outputStubs.push(childStub);
      }

      if (outputFiles.length > 0) {
        await consumeFiles(inputFileIds as any, outputFiles, outputStubs);
      }
    };
    window.addEventListener('agent-action-files', handler);
    return () => window.removeEventListener('agent-action-files', handler);
  }, [consumeFiles, findFileId, selectors]);

  // Listen for auto-execute events (from "Accept always" auto-acceptance)
  useEffect(() => {
    const handler = async (e: Event) => {
      const { actionType, actionPayload } = (e as CustomEvent).detail;
      try {
        const { executeAgentAction } = await import('@app/services/agentActionService');
        const { successes } = await executeAgentAction(actionType, actionPayload, activeFiles);
        if (successes.length > 0) {
          window.dispatchEvent(
            new CustomEvent('agent-action-files', { detail: { results: successes, actionType } })
          );
        }
      } catch (err) {
        console.error('[AgentChat] Auto-execute failed:', err);
      }
    };
    window.addEventListener('agent-action-auto-execute', handler);
    return () => window.removeEventListener('agent-action-auto-execute', handler);
  }, [activeFiles]);

  // Listen for "deny with instructions" — send follow-up through normal flow (ref avoids ordering)
  const denyInstructionsRef = useRef<((text: string) => void) | null>(null);

  // Auto-scroll when new messages arrive (but not when viewing history)
  useEffect(() => {
    if (!historyOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, historyOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus input when switching back to chat mode
  useEffect(() => {
    if (!historyOpen) inputRef.current?.focus();
  }, [agent.id, historyOpen]);

  // Invalidate text cache and sent-text tracker when files change
  const fileKey = activeFiles.map((f) => `${f.name}:${f.size}`).join('|');
  useEffect(() => {
    if (textCacheRef.current && textCacheRef.current.fileKey !== fileKey) {
      textCacheRef.current = null;
      sentTextKeyRef.current = null;
    }
  }, [fileKey]);

  const getExtractedText = useCallback(async (): Promise<string> => {
    if (activeFiles.length === 0) return '';
    if (textCacheRef.current && textCacheRef.current.fileKey === fileKey) {
      return textCacheRef.current.text;
    }
    setIsExtracting(true);
    try {
      const text = await extractTextFromFiles(activeFiles);
      textCacheRef.current = { fileKey, text };
      return text;
    } catch (err) {
      console.error('[AgentChat] Text extraction failed:', err);
      return '';
    } finally {
      setIsExtracting(false);
    }
  }, [activeFiles, fileKey]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || isExtracting) return;
    const fileNames = activeFiles.map((f) => f.name);
    const text = input.trim();
    setInput('');
    // Only send full extracted text on first message or when files change
    const needsText = sentTextKeyRef.current !== fileKey;
    const extractedText = needsText ? await getExtractedText() : undefined;
    if (needsText && extractedText) sentTextKeyRef.current = fileKey;
    sendMessage(text, fileNames, extractedText || undefined);
  }, [input, isStreaming, isExtracting, sendMessage, activeFiles, getExtractedText, fileKey]);

  const handleQuickAction = useCallback(
    async (prompt: string) => {
      if (isStreaming || isExtracting) return;
      const fileNames = activeFiles.map((f) => f.name);
      const needsText = sentTextKeyRef.current !== fileKey;
      const extractedText = needsText ? await getExtractedText() : undefined;
      if (needsText && extractedText) sentTextKeyRef.current = fileKey;
      sendMessage(prompt, fileNames, extractedText || undefined);
    },
    [isStreaming, isExtracting, sendMessage, activeFiles, getExtractedText, fileKey]
  );

  // Wire up deny-with-instructions listener
  denyInstructionsRef.current = handleQuickAction;
  useEffect(() => {
    const handler = (e: Event) => {
      const { instructions } = (e as CustomEvent<{ instructions: string }>).detail;
      denyInstructionsRef.current?.(instructions);
    };
    window.addEventListener('agent-deny-with-instructions', handler);
    return () => window.removeEventListener('agent-deny-with-instructions', handler);
  }, []);

  const handleSuggestionClick = useCallback(
    (text: string, messageId: string, index: number) => {
      selectSuggestion(messageId, index);
      handleQuickAction(text);
    },
    [handleQuickAction, selectSuggestion]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="agent-chat">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="agent-chat-header">
        <button className="agent-chat-back-btn" onClick={onBack} aria-label="Back to agents">
          <ArrowBackRoundedIcon sx={{ fontSize: '1rem' }} />
        </button>
        <div className="agent-chat-header-icon" style={{ color: agent.color }}>
          {resolveAgentIcon(agent.iconHint)}
        </div>
        <div className="agent-chat-header-info">
          <span className="agent-chat-header-name">{agent.name}</span>
          <span className="agent-chat-header-desc">{agent.shortDescription}</span>
        </div>
        <button
          className={`agent-chat-icon-btn${historyOpen ? ' agent-chat-icon-btn--active' : ''}`}
          onClick={() => setHistoryOpen((v) => !v)}
          aria-label="Chat history"
          title="Chat history"
        >
          <AccessTimeRoundedIcon sx={{ fontSize: '0.875rem' }} />
        </button>
        {hasMessages && !historyOpen && (
          <button
            className="agent-chat-icon-btn"
            onClick={clearChat}
            aria-label="Clear chat"
            title="Clear chat"
          >
            <DeleteOutlineRoundedIcon sx={{ fontSize: '0.875rem' }} />
          </button>
        )}
      </div>

      {/* ── History view ───────────────────────────────────── */}
      {historyOpen ? (
        <ChatHistoryView
          agentId={agent.id}
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onDeleteSession={deleteSession}
        />
      ) : (
        <>
      {/* ── Message area ─────────────────────────────────── */}
      <div className="agent-chat-messages" ref={scrollRef}>
        {isLoadingHistory ? (
          <div className="agent-chat-history-loading">
            <div className="agent-chat-dots"><span /><span /><span /></div>
          </div>
        ) : !hasMessages ? (
          <div className="agent-chat-empty">
            <div className="agent-chat-empty-icon" style={{ color: agent.color }}>
              {resolveAgentIcon(agent.iconHint)}
            </div>
            <p className="agent-chat-empty-title">{agent.name}</p>
            <p className="agent-chat-empty-desc">{agent.fullDescription}</p>
            <QuickActionChips agent={agent} onSelect={handleQuickAction} disabled={isStreaming} />
          </div>
        ) : null}

        {!isLoadingHistory && messages.map((msg) => (
          <ChatMessageView
            key={msg.id}
            msg={msg}
            onToggleExpanded={toggleNodeExpanded}
            onAction={(msgId, decision, instructions) => handleAction(msgId, decision, activeFiles, instructions)}
            onAutoAccept={setAutoAccept}
            onSuggestionClick={handleSuggestionClick}
          />
        ))}
      </div>

      {/* ── Quick actions row (when there ARE messages) ───── */}
      {hasMessages && (
        <div className="agent-chat-quick-bar">
          {agent.quickActions.slice(0, 3).map((qa) => (
            <button
              key={qa.id}
              className="agent-chat-quick-chip agent-chat-quick-chip--small"
              onClick={() => handleQuickAction(qa.prompt)}
              disabled={isStreaming}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Input bar ──────────────────────────────────────── */}
      <div className="agent-chat-input-bar">
        <textarea
          ref={inputRef}
          className="agent-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isExtracting ? 'Extracting document text...' : `Ask ${agent.name}...`}
          rows={1}
          disabled={isStreaming || isExtracting}
        />
        {isStreaming ? (
          <button
            className="agent-chat-send-btn agent-chat-send-btn--cancel"
            onClick={cancelStream}
            aria-label="Cancel"
          >
            <StopCircleRoundedIcon sx={{ fontSize: '1rem' }} />
          </button>
        ) : (
          <button
            className="agent-chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || isExtracting}
            aria-label="Send message"
          >
            <SendRoundedIcon sx={{ fontSize: '1rem' }} />
          </button>
        )}
      </div>
        </>
      )}
    </div>
  );
}
