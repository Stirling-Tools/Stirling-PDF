/**
 * Core stub for the chat context.
 * The real implementation lives in proprietary/components/chat/ChatContext.tsx
 * and shadows this via the @app/* alias cascade in proprietary builds.
 */

import type { ReactNode } from "react";

export type AssistantSurface = "editor" | "processor";

/** Processor-side provider. Real implementation shadows this in proprietary builds. */
export function ProcessorChatProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useChat() {
  return {
    messages: [] as never[],
    isLoading: false,
    progress: null,
    progressLog: [] as never[],
    sendMessage: async (_content: string) => {},
    cancelMessage: () => {},
    clearChat: () => {},
    surface: "editor" as AssistantSurface,
  };
}
