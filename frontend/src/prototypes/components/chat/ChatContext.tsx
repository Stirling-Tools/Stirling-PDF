import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAllFiles, useFileActions } from "@app/contexts/FileContext";
import apiClient from "@app/services/apiClient";
import { getAuthHeaders } from "@app/services/apiClientSetup";
import { createChildStub } from "@app/contexts/file/fileActions";
import {
  createNewStirlingFileStub,
  createStirlingFile,
  type StirlingFileStub,
} from "@app/types/fileContext";
import type { ToolOperation } from "@app/types/file";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /**
   * Tool endpoint paths executed during this assistant turn (e.g.
   * {@code /api/v1/general/rotate-pdf}). Populated for assistant messages when the workflow
   * ran one or more tools, in execution order. Undefined for user messages and for assistant
   * turns that answered without running any tool.
   */
  toolsUsed?: string[];
}

export enum AiWorkflowPhase {
  ANALYZING = "analyzing",
  CALLING_ENGINE = "calling_engine",
  EXTRACTING_CONTENT = "extracting_content",
  EXECUTING_TOOL = "executing_tool",
  PROCESSING = "processing",
}

export interface AiWorkflowProgress {
  phase: AiWorkflowPhase;
  /** Tool endpoint path currently executing, for EXECUTING_TOOL events. */
  tool?: string;
  /** 1-based step index, for EXECUTING_TOOL events. */
  stepIndex?: number;
  /** Total number of plan steps, for EXECUTING_TOOL events. */
  stepCount?: number;
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
}

interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  progress: AiWorkflowProgress | null;
}

type ChatAction =
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_PROGRESS"; progress: AiWorkflowProgress | null }
  | { type: "TOGGLE_OPEN" }
  | { type: "SET_OPEN"; open: boolean };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    case "SET_PROGRESS":
      return { ...state, progress: action.progress };
    case "TOGGLE_OPEN":
      return { ...state, isOpen: !state.isOpen };
    case "SET_OPEN":
      return { ...state, isOpen: action.open };
  }
}

function formatWorkflowResponse(data: AiWorkflowResponse): string {
  switch (data.outcome) {
    case "answer":
    case "completed":
      return data.answer ?? data.summary ?? "Done.";
    case "need_clarification":
      return data.question ?? "Could you clarify your request?";
    case "cannot_do":
      return data.reason ?? "I'm unable to do that.";
    case "not_found":
      return data.reason ?? "I couldn't find the requested information.";
    case "unsupported_capability":
      return (
        data.message ??
        `Unsupported capability: ${data.capability ?? "unknown"}`
      );
    case "cannot_continue":
      return data.reason ?? "Something went wrong and I can't continue.";
    case "plan":
      return data.rationale
        ? `${data.rationale}\n\n${(data.steps ?? []).map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join("\n")}`
        : JSON.stringify(data.steps, null, 2);
    case "need_content":
    case "tool_call":
      return (
        data.rationale ?? data.summary ?? `Processing (${data.outcome})...`
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
}

async function consumeSSEStream(
  response: Response,
  handlers: {
    onProgress: (data: ProgressEvent) => void;
    onResult: (data: AiWorkflowResponse) => void;
    onError: (data: { message: string }) => void;
  },
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

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
}

interface ChatContextValue {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  progress: AiWorkflowProgress | null;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const initialState: ChatState = {
  messages: [],
  isOpen: false,
  isLoading: false,
  progress: null,
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { files: activeFiles, fileStubs: activeFileStubs } = useAllFiles();
  const { actions: fileActions } = useFileActions();
  const abortRef = useRef<AbortController | null>(null);

  // Download a File from the Stirling files endpoint.
  const downloadFile = useCallback(
    async (descriptor: AiWorkflowResultFile): Promise<File> => {
      const response = await apiClient.get<Blob>(
        `/api/v1/general/files/${descriptor.fileId}`,
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
        : result.fileId
          ? [
              {
                fileId: result.fileId,
                fileName: result.fileName ?? "result.pdf",
                contentType: result.contentType ?? "application/pdf",
              } satisfies AiWorkflowResultFile,
            ]
          : [];
      if (descriptors.length === 0) return;

      const files = await Promise.all(descriptors.map(downloadFile));

      const operation: ToolOperation = {
        toolId: "ai-workflow",
        timestamp: Date.now(),
      };
      const isVersionMapping =
        sourceStubs.length > 0 && files.length === sourceStubs.length;
      const stubs = files.map((file, i) =>
        isVersionMapping
          ? createChildStub(sourceStubs[i], operation, file)
          : createNewStirlingFileStub(file),
      );
      const stirlingFiles = files.map((file, i) =>
        createStirlingFile(file, stubs[i].id),
      );

      if (sourceStubs.length > 0) {
        // Always consume the inputs so merge/split inputs are removed from the workbench.
        // For 1:1 operations (rotate, compress) the outputs carry the version chain; for
        // merge/split they're fresh roots.
        await fileActions.consumeFiles(
          sourceStubs.map((s) => s.id),
          stirlingFiles,
          stubs,
        );
      } else {
        // No inputs were provided (unlikely for completed workflows, but handle it safely).
        await fileActions.addFiles(files, { selectFiles: true });
      }
    },
    [fileActions, downloadFile],
  );

  const toggleOpen = useCallback(() => dispatch({ type: "TOGGLE_OPEN" }), []);
  const setOpen = useCallback(
    (open: boolean) => dispatch({ type: "SET_OPEN", open }),
    [],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: Date.now(),
      };
      dispatch({ type: "ADD_MESSAGE", message: userMessage });
      dispatch({ type: "SET_LOADING", loading: true });
      dispatch({ type: "SET_PROGRESS", progress: null });

      try {
        const formData = new FormData();
        formData.append("userMessage", content);
        activeFiles.forEach((file, i) => {
          formData.append(`fileInputs[${i}].fileInput`, file);
        });

        const response = await fetch("/api/v1/ai/orchestrate/stream", {
          method: "POST",
          body: formData,
          headers: getAuthHeaders(),
          credentials: "include",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`AI engine request failed: ${response.status}`);
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
            dispatch({
              type: "SET_PROGRESS",
              progress: {
                phase: data.phase as AiWorkflowPhase,
                tool: data.tool,
                stepIndex: data.stepIndex,
                stepCount: data.stepCount,
              },
            });
          },
          onResult: (data) => {
            receivedResult = true;
            dispatch({ type: "SET_PROGRESS", progress: null });
            const replyContent = formatWorkflowResponse(data);
            dispatch({
              type: "ADD_MESSAGE",
              message: {
                id: crypto.randomUUID(),
                role: "assistant",
                content: replyContent,
                timestamp: Date.now(),
                toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
              },
            });
            if (data.fileId || data.resultFiles?.length) {
              importResultFile(data, activeFileStubs).catch((err) => {
                console.error("Failed to import AI result file", err);
                dispatch({
                  type: "ADD_MESSAGE",
                  message: {
                    id: crypto.randomUUID(),
                    role: "assistant",
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
                id: crypto.randomUUID(),
                role: "assistant",
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
        dispatch({ type: "SET_PROGRESS", progress: null });
        dispatch({
          type: "ADD_MESSAGE",
          message: {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "Failed to get a response. The AI engine may not be available yet.",
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
    [activeFiles, activeFileStubs, importResultFile],
  );

  return (
    <ChatContext.Provider
      value={{
        messages: state.messages,
        isOpen: state.isOpen,
        isLoading: state.isLoading,
        progress: state.progress,
        toggleOpen,
        setOpen,
        sendMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
