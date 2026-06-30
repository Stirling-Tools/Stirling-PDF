import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { generateId } from "@app/utils/generateId";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
import apiClient from "@app/services/apiClient";
import { getAiBaseUrl } from "@app/services/aiBaseUrl";
import { getAuthHeaders } from "@app/services/apiClientSetup";
import { dispatchPaygLimitReached } from "@app/services/usageLimitBridge";
import { createChildStub } from "@app/contexts/file/fileActions";
import {
  createNewStirlingFileStub,
  createStirlingFile,
  type StirlingFileStub,
} from "@app/types/fileContext";
import type { ToolOperation } from "@app/types/file";

export enum ChatRole {
  USER = "user",
  ASSISTANT = "assistant",
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  /**
   * Tool endpoint paths executed during this assistant turn (e.g.
   * {@code /api/v1/general/rotate-pdf}). Populated for assistant messages when the workflow
   * ran one or more tools, in execution order. Undefined for user messages and for assistant
   * turns that answered without running any tool.
   */
  toolsUsed?: string[];
  /**
   * Full ordered progress log captured during the AI turn that produced this message.
   * Only set on assistant messages; used to render the "Ran for X seconds" collapsed
   * history dropdown above the response.
   */
  progressLog?: AiWorkflowProgress[];
  /** Wall-clock duration of the AI turn in milliseconds. Only set on assistant messages. */
  durationMs?: number;
}

export enum AiWorkflowPhase {
  ANALYZING = "analyzing",
  CALLING_ENGINE = "calling_engine",
  EXTRACTING_CONTENT = "extracting_content",
  EXECUTING_TOOL = "executing_tool",
  PROCESSING = "processing",
  ENGINE_PROGRESS = "engine_progress",
}

/**
 * Engine-side progress detail for ENGINE_PROGRESS events. Mirrors the Python
 * {@code ProgressEvent} discriminated union (engine/src/stirling/contracts/progress.py)
 * and the Java {@code AiEngineProgressDetail} sealed interface; the {@code phase}
 * string is the discriminator. Field names are camelCase because the engine
 * serialises by alias.
 */
export interface WholeDocReadStartedDetail {
  phase: "whole_doc_read_started";
  question: string;
  pages: number;
  slices: number;
}

export interface WholeDocSliceDoneDetail {
  phase: "whole_doc_slice_done";
  completed: number;
  total: number;
  /** Page-range label, e.g. "pages=1-5". */
  pages: string;
  durationMs: number;
  excerpts: number;
  facts: number;
}

export interface WholeDocCompressionRoundDetail {
  phase: "whole_doc_compression_round";
  roundNumber: number;
  notesIn: number;
  groups: number;
}

export interface WholeDocReadDoneDetail {
  phase: "whole_doc_read_done";
  completed: number;
  slices: number;
  durationSeconds: number;
}

export type EngineProgressDetail =
  | WholeDocReadStartedDetail
  | WholeDocSliceDoneDetail
  | WholeDocCompressionRoundDetail
  | WholeDocReadDoneDetail;

/**
 * What we actually carry across the wire boundary: a known typed variant, or a
 * forward-compat shape with just the discriminator string. The "unknown" arm
 * exists so a new engine-side phase rolling out before a frontend update keeps
 * rendering the generic processing message instead of crashing the union.
 */
export interface UnknownEngineProgressDetail {
  phase: string;
}

export type AnyEngineProgressDetail =
  | EngineProgressDetail
  | UnknownEngineProgressDetail;

const KNOWN_ENGINE_PHASES = new Set<string>([
  "whole_doc_read_started",
  "whole_doc_slice_done",
  "whole_doc_compression_round",
  "whole_doc_read_done",
]);

export function isKnownEngineProgressDetail(
  detail: AnyEngineProgressDetail,
): detail is EngineProgressDetail {
  return KNOWN_ENGINE_PHASES.has(detail.phase);
}

export interface AiWorkflowProgress {
  phase: AiWorkflowPhase;
  /** Tool endpoint path currently executing, for EXECUTING_TOOL events. */
  tool?: string;
  /** 1-based step index, for EXECUTING_TOOL events. */
  stepIndex?: number;
  /** Total number of plan steps, for EXECUTING_TOOL events. */
  stepCount?: number;
  /**
   * Engine-side event payload, for ENGINE_PROGRESS events. Typed sub-phase
   * record (e.g. {@link WholeDocSliceDoneDetail}) the UI can render in detail.
   */
  engineDetail?: AnyEngineProgressDetail;
}

type AiWorkflowOutcome =
  | "answer"
  | "not_found"
  | "need_content"
  | "plan"
  | "need_clarification"
  | "cannot_do"
  | "tool_call"
  | "completed"
  | "unsupported_capability"
  | "cannot_continue";

interface AiWorkflowResultFile {
  /** Stirling file ID — download with /api/v1/general/files/{fileId}. */
  fileId: string;
  fileName: string;
  contentType: string;
}

interface AiWorkflowResponse {
  outcome: AiWorkflowOutcome;
  answer?: string;
  summary?: string;
  rationale?: string;
  reason?: string;
  question?: string;
  capability?: string;
  message?: string;
  evidence?: Array<{ pageNumber: number; text: string }>;
  steps?: Array<Record<string, unknown>>;
  /** Every file produced by the workflow (empty if the outcome has no files). */
  resultFiles?: AiWorkflowResultFile[];
  // Legacy single-file fields — mirror the first entry of resultFiles.
  fileId?: string;
  fileName?: string;
  contentType?: string;
  /**
   * Structured error code when a tool call inside the workflow was blocked (e.g.
   * PAYG_LIMIT_REACHED / FEATURE_DEGRADED). Present instead of a raw failure reason so the
   * client can pop the usage-limit modal. See {@link isPaygLimitCode}.
   */
  errorCode?: string;
  /** From the blocking 402: true → over spending cap, false/absent → free allowance spent. */
  errorSubscribed?: boolean;
}

/**
 * Usage-limit sentinels the agent can surface (matching the saas EntitlementGuard / apiClient
 * interceptor). When one of these is the result's errorCode, we open the usage-limit modal rather
 * than render the failure as chat text.
 */
const PAYG_LIMIT_CODES = new Set(["PAYG_LIMIT_REACHED", "FEATURE_DEGRADED"]);

function isPaygLimitCode(code: string | null | undefined): boolean {
  return code != null && PAYG_LIMIT_CODES.has(code);
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  progress: AiWorkflowProgress | null;
  /** Ordered log of every progress event in the current request. UI shows the last N entries. */
  progressLog: AiWorkflowProgress[];
}

/**
 * Maximum number of progress steps retained in the live buffer.
 */
export const PROGRESS_LOG_MAX = 4;

type ChatAction =
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_PROGRESS"; progress: AiWorkflowProgress | null }
  | { type: "APPEND_PROGRESS"; progress: AiWorkflowProgress }
  | { type: "CLEAR" };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "SET_LOADING":
      // Reset the log on both start (true) and end (false) of a request.
      return {
        ...state,
        isLoading: action.loading,
        progress: action.loading ? state.progress : null,
        progressLog: [],
      };
    case "SET_PROGRESS":
      return { ...state, progress: action.progress };
    case "APPEND_PROGRESS":
      // Cap the live buffer so each append copies at most PROGRESS_LOG_MAX elements
      return {
        ...state,
        progress: action.progress,
        progressLog:
          state.progressLog.length < PROGRESS_LOG_MAX
            ? [...state.progressLog, action.progress]
            : [
                ...state.progressLog.slice(1 - PROGRESS_LOG_MAX),
                action.progress,
              ],
      };
    case "CLEAR":
      return {
        ...state,
        messages: [],
        isLoading: false,
        progress: null,
        progressLog: [],
      };
  }
}

type TranslateFn = ReturnType<typeof useTranslation>["t"];

function formatWorkflowResponse(
  data: AiWorkflowResponse,
  t: TranslateFn,
): string {
  switch (data.outcome) {
    case "answer":
    case "completed":
      return data.answer ?? data.summary ?? t("chat.responses.done");
    case "need_clarification":
      return data.question ?? t("chat.responses.need_clarification");
    case "cannot_do":
      return data.reason ?? t("chat.responses.cannot_do");
    case "not_found":
      return data.reason ?? t("chat.responses.not_found");
    case "unsupported_capability":
      return (
        data.message ??
        t("chat.responses.unsupported_capability", {
          capability: data.capability ?? "unknown",
        })
      );
    case "cannot_continue":
      return data.reason ?? t("chat.responses.cannot_continue");
    case "plan":
      return data.rationale
        ? `${data.rationale}\n\n${(data.steps ?? []).map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join("\n")}`
        : JSON.stringify(data.steps, null, 2);
    case "need_content":
    case "tool_call":
      return (
        data.rationale ??
        data.summary ??
        t("chat.responses.processing", { outcome: data.outcome })
      );
    default:
      return (
        data.answer ?? data.summary ?? data.message ?? JSON.stringify(data)
      );
  }
}

/**
 * Parses an SSE text stream and invokes callbacks for each named event.
 */
interface ProgressEvent {
  phase: string;
  timestamp: number;
  tool?: string;
  stepIndex?: number;
  stepCount?: number;
  engineDetail?: AnyEngineProgressDetail;
}

async function consumeSSEStream(
  response: Response,
  handlers: {
    onProgress: (data: ProgressEvent) => void;
    onResult: (data: AiWorkflowResponse) => void;
    onError: (data: { message: string }) => void;
  },
) {
  if (!response.body) {
    throw new Error("Response body is null");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by double newlines
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        let dataPayload = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataPayload += line.slice(5);
          }
        }

        if (dataPayload) {
          try {
            const parsed = JSON.parse(dataPayload);
            if (currentEvent === "progress") {
              handlers.onProgress(parsed);
            } else if (currentEvent === "result") {
              handlers.onResult(parsed);
            } else if (currentEvent === "error") {
              handlers.onError(parsed);
            }
          } catch {
            // Skip malformed JSON frames
          }
        }
        currentEvent = "";
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

interface ChatContextValue {
  messages: ChatMessage[];
  isLoading: boolean;
  progress: AiWorkflowProgress | null;
  /** Ordered log of every progress event for the current in-flight request. */
  progressLog: AiWorkflowProgress[];
  sendMessage: (content: string) => Promise<void>;
  cancelMessage: () => void;
  /** Abort any in-flight request and reset the chat to an empty conversation. */
  clearChat: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  progress: null,
  progressLog: [],
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { files: activeFiles, fileStubs: activeFileStubs } = useAllFiles();
  const { actions: fileActions } = useFileActions();
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>(state.messages);
  messagesRef.current = state.messages;
  // Hold the latest files in refs so sendMessage's identity does not change on
  // every file operation. Otherwise a new sendMessage (and thus a new context
  // value) would be created on each file change, re-rendering every useChat()
  // consumer. sendMessage reads .current at call time, so it still sees the
  // current files.
  const activeFilesRef = useRef(activeFiles);
  activeFilesRef.current = activeFiles;
  const activeFileStubsRef = useRef(activeFileStubs);
  activeFileStubsRef.current = activeFileStubs;

  // Download a File from the Stirling files endpoint.
  const downloadFile = useCallback(
    async (descriptor: AiWorkflowResultFile): Promise<File> => {
      // AI result files live on the backend that ran the workflow (the SaaS
      // engine on desktop), so fetch from the AI base, not the local backend.
      const response = await apiClient.get<Blob>(
        `${getAiBaseUrl()}/api/v1/general/files/${descriptor.fileId}`,
        { responseType: "blob" },
      );
      return new File([response.data], descriptor.fileName, {
        type: descriptor.contentType ?? response.data.type,
      });
    },
    [],
  );

  // Import the files produced by an AI workflow result into FileContext.
  //
  // If the workflow produced the same number of outputs as inputs, map each output to its
  // corresponding input as a new version in the same chain. Otherwise (merge, split, etc.)
  // add the outputs as new root files.
  const importResultFile = useCallback(
    async (
      result: AiWorkflowResponse,
      sourceStubs: StirlingFileStub[],
    ): Promise<void> => {
      const descriptors = result.resultFiles?.length
        ? result.resultFiles
        : result.fileId && result.fileName && result.contentType
          ? [
              {
                fileId: result.fileId,
                fileName: result.fileName,
                contentType: result.contentType,
              } satisfies AiWorkflowResultFile,
            ]
          : [];
      if (descriptors.length === 0) return;

      const files = await Promise.all(descriptors.map(downloadFile));

      if (sourceStubs.length > 0) {
        // Always consume the inputs so merge/split inputs are removed from the workbench.
        // For 1:1 operations (rotate, compress) the outputs carry the version chain; for
        // merge/split they're fresh roots.
        const operation: ToolOperation = {
          toolId: "ai-workflow",
          timestamp: Date.now(),
        };
        const isVersionMapping = files.length === sourceStubs.length;
        const stubs = files.map((file, i) =>
          isVersionMapping
            ? createChildStub(sourceStubs[i], operation, file)
            : createNewStirlingFileStub(file),
        );
        const stirlingFiles = files.map((file, i) =>
          createStirlingFile(file, stubs[i].id),
        );
        await fileActions.consumeFiles(
          sourceStubs.map((s) => s.id),
          stirlingFiles,
          stubs,
        );
      } else {
        // No inputs: pass raw files so addFiles assigns consistent IDs. Pre-assigning stub IDs
        // here would cause a fileId mismatch in filesRef, making getFiles() clone the file
        // on every render and breaking useFileWithUrl's memoisation (continuous PDF reloads).
        await fileActions.addFiles(files, { selectFiles: true });
      }
    },
    [fileActions, downloadFile],
  );

  const cancelMessage = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "CLEAR" });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const priorMessages = messagesRef.current;
      // Snapshot the files at send time so the upload AND the result-import both
      // act on what the user actually sent — not on whatever the workbench holds
      // when the (possibly many-seconds-later) result arrives.
      const sourceFiles = activeFilesRef.current;
      const sourceStubs = activeFileStubsRef.current;
      const startTime = Date.now();
      // Mirror every progress event locally so we can attach the full log to
      // the assistant message when the result arrives — without needing a ref
      // into the reducer state.
      const progressLogLocal: AiWorkflowProgress[] = [];

      const userMessage: ChatMessage = {
        id: generateId(),
        role: ChatRole.USER,
        content,
        timestamp: Date.now(),
      };
      dispatch({ type: "ADD_MESSAGE", message: userMessage });
      dispatch({ type: "SET_LOADING", loading: true });
      dispatch({ type: "SET_PROGRESS", progress: null });

      try {
        const formData = new FormData();
        formData.append("userMessage", content);
        sourceFiles.forEach((file, i) => {
          formData.append(`fileInputs[${i}].fileInput`, file);
        });
        priorMessages.forEach((message, i) => {
          formData.append(`conversationHistory[${i}].role`, message.role);
          formData.append(`conversationHistory[${i}].content`, message.content);
        });
        const response = await fetch(
          `${getAiBaseUrl()}/api/v1/ai/orchestrate/stream`,
          {
            method: "POST",
            body: formData,
            headers: await getAuthHeaders(),
            credentials: "include",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          let detail: string | undefined;
          let limitHandled = false;
          try {
            const body = await response.json();
            const code = typeof body?.error === "string" ? body.error : null;
            // A 402 carrying a usage-limit sentinel means the agent call itself was gated.
            // Fire the usage-limit modal (free → subscribe, subscribed → raise cap) and show a
            // brief line below — not a generic "engine failed" error.
            if (response.status === 402 && isPaygLimitCode(code)) {
              dispatchPaygLimitReached(
                typeof body?.subscribed === "boolean" ? body.subscribed : null,
              );
              limitHandled = true;
            } else {
              detail =
                body?.message ??
                body?.detail ??
                body?.error ??
                (Array.isArray(body?.errors)
                  ? body.errors[0]?.message
                  : undefined);
            }
          } catch {
            // non-JSON body — ignore
          }
          if (limitHandled) {
            dispatch({ type: "SET_PROGRESS", progress: null });
            dispatch({
              type: "ADD_MESSAGE",
              message: {
                id: generateId(),
                role: ChatRole.ASSISTANT,
                content: t(
                  "chat.responses.usage_limit_reached",
                  "You've reached your usage limit. Check your plan options to keep going.",
                ),
                timestamp: Date.now(),
              },
            });
            return;
          }
          throw new Error(
            detail ?? `AI engine request failed: ${response.status}`,
          );
        }

        let receivedResult = false;
        const toolsUsed: string[] = [];

        await consumeSSEStream(response, {
          onProgress: (data) => {
            if (
              data.phase === AiWorkflowPhase.EXECUTING_TOOL &&
              typeof data.tool === "string"
            ) {
              toolsUsed.push(data.tool);
            }
            const progressItem: AiWorkflowProgress = {
              phase: data.phase as AiWorkflowPhase,
              tool: data.tool,
              stepIndex: data.stepIndex,
              stepCount: data.stepCount,
              engineDetail: data.engineDetail,
            };
            progressLogLocal.push(progressItem);
            dispatch({ type: "APPEND_PROGRESS", progress: progressItem });
          },
          onResult: (data) => {
            receivedResult = true;
            dispatch({ type: "SET_PROGRESS", progress: null });
            // The agent's tool calls run server-side, so a usage-limit 402 surfaces here on the
            // result (not via the apiClient interceptor that pops the modal for direct calls).
            // Fire the matching modal and replace the raw "tool failed: 402…" reason with a
            // brief, non-alarming line.
            const isLimit = isPaygLimitCode(data.errorCode);
            if (isLimit) {
              dispatchPaygLimitReached(data.errorSubscribed ?? null);
            }
            const replyContent = isLimit
              ? t(
                  "chat.responses.usage_limit_reached",
                  "You've reached your usage limit. Check your plan options to keep going.",
                )
              : formatWorkflowResponse(data, t);
            dispatch({
              type: "ADD_MESSAGE",
              message: {
                id: generateId(),
                role: ChatRole.ASSISTANT,
                content: replyContent,
                timestamp: Date.now(),
                toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
                progressLog:
                  progressLogLocal.length > 0
                    ? [...progressLogLocal]
                    : undefined,
                durationMs: Date.now() - startTime,
              },
            });
            if (data.fileId || data.resultFiles?.length) {
              importResultFile(data, sourceStubs).catch((err) => {
                console.error("Failed to import AI result file", err);
                dispatch({
                  type: "ADD_MESSAGE",
                  message: {
                    id: generateId(),
                    role: ChatRole.ASSISTANT,
                    content:
                      "The file was processed but I couldn't download it.",
                    timestamp: Date.now(),
                  },
                });
              });
            }
          },
          onError: (data) => {
            receivedResult = true;
            dispatch({ type: "SET_PROGRESS", progress: null });
            dispatch({
              type: "ADD_MESSAGE",
              message: {
                id: generateId(),
                role: ChatRole.ASSISTANT,
                content: data.message || "Something went wrong.",
                timestamp: Date.now(),
              },
            });
          },
        });

        if (!receivedResult) {
          throw new Error("Stream ended without a result");
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        const err = e as Error;
        const isEngineError =
          err.message.startsWith("AI engine request failed:") ||
          err.message === "Stream ended without a result";
        const content = isEngineError
          ? "Failed to get a response. The AI engine may not be available yet."
          : (err.message ??
            "Failed to get a response. The AI engine may not be available yet.");
        dispatch({ type: "SET_PROGRESS", progress: null });
        dispatch({
          type: "ADD_MESSAGE",
          message: {
            id: generateId(),
            role: ChatRole.ASSISTANT,
            content,
            timestamp: Date.now(),
          },
        });
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [importResultFile],
  );

  // Memoize the context value so it only changes when chat state changes — not
  // on every file operation. With sendMessage/cancelMessage/clearChat all stable,
  // useChat() consumers re-render only when messages/loading/progress change.
  const value = useMemo<ChatContextValue>(
    () => ({
      messages: state.messages,
      isLoading: state.isLoading,
      progress: state.progress,
      progressLog: state.progressLog,
      sendMessage,
      cancelMessage,
      clearChat,
    }),
    [
      state.messages,
      state.isLoading,
      state.progress,
      state.progressLog,
      sendMessage,
      cancelMessage,
      clearChat,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
