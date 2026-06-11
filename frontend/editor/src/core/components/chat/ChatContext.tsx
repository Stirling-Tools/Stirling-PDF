/**
 * Core stub for the chat context.
 * The real implementation lives in proprietary/components/chat/ChatContext.tsx
 * and shadows this via the @app/* alias cascade in proprietary builds.
 */

export function useChat() {
  return {
    messages: [] as never[],
    isOpen: false,
    isLoading: false,
    progress: null,
    progressLog: [] as never[],
    toggleOpen: () => {},
    setOpen: (_open: boolean) => {},
    sendMessage: async (_content: string) => {},
    clearChat: () => {},
  };
}
