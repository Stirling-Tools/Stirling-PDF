/**
 * Core stub for the chat context.
 * The real implementation lives in proprietary/components/chat/ChatContext.tsx
 * and shadows this via the @app/* alias cascade in proprietary builds.
 */

export function useChat() {
  return {
    messages: [] as never[],
    isLoading: false,
    progress: null,
    progressLog: [] as never[],
    sendMessage: async (_content: string) => {},
    cancelMessage: () => {},
    clearChat: () => {},
  };
}
