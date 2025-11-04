import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ChatbotSource = 'viewer' | 'tool';

interface OpenChatOptions {
  source?: ChatbotSource;
  fileId?: string;
}

interface ChatbotContextValue {
  isOpen: boolean;
  source: ChatbotSource;
  preferredFileId?: string;
  openChat: (options?: OpenChatOptions) => void;
  closeChat: () => void;
  setPreferredFileId: (fileId?: string) => void;
}

const ChatbotContext = createContext<ChatbotContextValue | undefined>(undefined);

export function ChatbotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<ChatbotSource>('viewer');
  const [preferredFileId, setPreferredFileId] = useState<string | undefined>();

  const openChat = useCallback((options: OpenChatOptions = {}) => {
    if (options.source) {
      setSource(options.source);
    }
    if (options.fileId) {
      setPreferredFileId(options.fileId);
    }
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      source,
      preferredFileId,
      openChat,
      closeChat,
      setPreferredFileId,
    }),
    [isOpen, source, preferredFileId, openChat, closeChat]
  );

  return <ChatbotContext.Provider value={value}>{children}</ChatbotContext.Provider>;
}

export function useChatbot() {
  const context = useContext(ChatbotContext);
  if (!context) {
    throw new Error('useChatbot must be used within a ChatbotProvider');
  }
  return context;
}
