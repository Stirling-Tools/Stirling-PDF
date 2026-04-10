import { createContext, useContext, useReducer, useCallback, type ReactNode } from "react";
import { useAllFiles } from "@app/contexts/FileContext";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
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
}

type ChatAction =
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "TOGGLE_OPEN" }
  | { type: "SET_OPEN"; open: boolean };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
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

interface ChatContextValue {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const initialState: ChatState = {
  messages: [],
  isOpen: false,
  isLoading: false,
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { files: activeFiles } = useAllFiles();

  const toggleOpen = useCallback(() => dispatch({ type: "TOGGLE_OPEN" }), []);
  const setOpen = useCallback((open: boolean) => dispatch({ type: "SET_OPEN", open }), []);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: Date.now(),
      };
      dispatch({ type: "ADD_MESSAGE", message: userMessage });
      dispatch({ type: "SET_LOADING", loading: true });

      try {
        const formData = new FormData();
        formData.append("userMessage", content);
        activeFiles.forEach((file, i) => {
          formData.append(`fileInputs[${i}].fileInput`, file);
        });

        const response = await fetch("/api/v1/ai/orchestrate", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`AI engine request failed: ${response.status}`);
        }

        const data: AiWorkflowResponse = await response.json();
        const replyContent = formatWorkflowResponse(data);
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: replyContent,
          timestamp: Date.now(),
        };
        dispatch({ type: "ADD_MESSAGE", message: assistantMessage });
      } catch {
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Failed to get a response. The AI engine may not be available yet.",
          timestamp: Date.now(),
        };
        dispatch({ type: "ADD_MESSAGE", message: errorMessage });
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
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
