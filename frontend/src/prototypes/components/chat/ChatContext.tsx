import { createContext, useContext, useReducer, useCallback, useRef, type ReactNode } from "react";
import { useAllFiles } from "@app/contexts/FileContext";
import { getAuthHeaders } from "@app/services/apiClientSetup";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export enum AiWorkflowPhase {
  ANALYZING = "analyzing",
  CALLING_ENGINE = "calling_engine",
  EXTRACTING_CONTENT = "extracting_content",
  PROCESSING = "processing",
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
}

interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  progressPhase: AiWorkflowPhase | null;
}

type ChatAction =
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_PROGRESS"; phase: AiWorkflowPhase | null }
  | { type: "TOGGLE_OPEN" }
  | { type: "SET_OPEN"; open: boolean };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    case "SET_PROGRESS":
      return { ...state, progressPhase: action.phase };
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
      return data.message ?? `Unsupported capability: ${data.capability ?? "unknown"}`;
    case "cannot_continue":
      return data.reason ?? "Something went wrong and I can't continue.";
    case "plan":
      return data.rationale
        ? `${data.rationale}\n\n${(data.steps ?? []).map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join("\n")}`
        : JSON.stringify(data.steps, null, 2);
    case "need_content":
    case "tool_call":
      return data.rationale ?? data.summary ?? `Processing (${data.outcome})...`;
    default:
      return data.answer ?? data.summary ?? data.message ?? JSON.stringify(data);
  }
}

/**
 * Parses an SSE text stream and invokes callbacks for each named event.
 */
async function consumeSSEStream(
  response: Response,
  handlers: {
    onProgress: (data: { phase: string; timestamp: number }) => void;
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
  progressPhase: AiWorkflowPhase | null;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const initialState: ChatState = {
  messages: [],
  isOpen: false,
  isLoading: false,
  progressPhase: null,
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { files: activeFiles } = useAllFiles();
  const abortRef = useRef<AbortController | null>(null);

  const toggleOpen = useCallback(() => dispatch({ type: "TOGGLE_OPEN" }), []);
  const setOpen = useCallback((open: boolean) => dispatch({ type: "SET_OPEN", open }), []);

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
      dispatch({ type: "SET_PROGRESS", phase: null });

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

        await consumeSSEStream(response, {
          onProgress: (data) => {
            dispatch({ type: "SET_PROGRESS", phase: data.phase as AiWorkflowPhase });
          },
          onResult: (data) => {
            receivedResult = true;
            dispatch({ type: "SET_PROGRESS", phase: null });
            const replyContent = formatWorkflowResponse(data);
            dispatch({
              type: "ADD_MESSAGE",
              message: {
                id: crypto.randomUUID(),
                role: "assistant",
                content: replyContent,
                timestamp: Date.now(),
              },
            });
          },
          onError: (data) => {
            receivedResult = true;
            dispatch({ type: "SET_PROGRESS", phase: null });
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
        dispatch({ type: "SET_PROGRESS", phase: null });
        dispatch({
          type: "ADD_MESSAGE",
          message: {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Failed to get a response. The AI engine may not be available yet.",
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
    [activeFiles],
  );

  return (
    <ChatContext.Provider
      value={{
        messages: state.messages,
        isOpen: state.isOpen,
        isLoading: state.isLoading,
        progressPhase: state.progressPhase,
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
