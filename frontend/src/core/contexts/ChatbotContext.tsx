import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useFileState } from '@app/contexts/FileContext';
import type { StirlingFile } from '@app/types/fileContext';
import { extractTextFromPdf } from '@app/services/pdfTextExtractor';
import { extractTextFromDocx } from '@app/services/docxTextExtractor';
import {
  ChatbotSessionInfo,
  createChatbotSession,
} from '@app/services/chatbotService';
import { runOcrForChat } from '@app/services/chatbotOcrService';

type ChatbotSource = 'viewer' | 'tool';

interface OpenChatOptions {
  source?: ChatbotSource;
  fileId?: string;
}

type PreparationStatus = 'idle' | 'processing' | 'ready' | 'error' | 'unsupported';

interface PreparedChatbotDocument {
  documentId: string;
  fileId: string;
  fileName: string;
  status: PreparationStatus;
  session?: ChatbotSessionInfo;
  characterCount?: number;
  pageCount?: number;
  warnings?: string[];
  error?: string;
}

interface PreprocessOptions {
  force?: boolean;
  forceOcr?: boolean;
}

interface ChatbotContextValue {
  isOpen: boolean;
  source: ChatbotSource;
  preferredFileId?: string;
  openChat: (options?: OpenChatOptions) => void;
  closeChat: () => void;
  setPreferredFileId: (fileId?: string) => void;
  sessions: Record<string, PreparedChatbotDocument>;
  requestPreprocessing: (fileId: string, options?: PreprocessOptions) => Promise<void>;
}

const ChatbotContext = createContext<ChatbotContextValue | undefined>(undefined);

export function ChatbotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<ChatbotSource>('viewer');
  const [preferredFileId, setPreferredFileId] = useState<string | undefined>();

  const { selectors } = useFileState();
  const [preparedSessions, setPreparedSessions] = useState<
          Record<string, PreparedChatbotDocument>
  >({});
  const sessionsRef = useRef(preparedSessions);
  sessionsRef.current = preparedSessions;
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());

  const supportedExtensions = useMemo(
          () => new Set(['pdf', 'doc', 'docx']),
          []
  );

  const getExtension = useCallback((file: StirlingFile) => {
    const parts = file.name.split('.');
    return parts.length > 1 ? parts.at(-1)!.toLowerCase() : '';
  }, []);

  const updateSessionEntry = useCallback((file: StirlingFile, partial: Partial<PreparedChatbotDocument>) => {
    setPreparedSessions((prev) => ({
      ...prev,
      [file.fileId]: {
        ...prev[file.fileId],
        documentId: file.fileId,
        fileId: file.fileId,
        fileName: file.name,
        status: 'idle',
        ...partial,
      },
    }));
  }, []);

  const preprocessFile = useCallback(
          async (file: StirlingFile, options?: PreprocessOptions) => {
            const extension = getExtension(file);
            if (!supportedExtensions.has(extension)) {
              updateSessionEntry(file, {
                status: 'unsupported',
                error: 'Only PDF and Word documents are indexed for chat.',
              });
              return;
            }
            if (extension === 'doc') {
              updateSessionEntry(file, {
                status: 'unsupported',
                error: 'Legacy Word (.doc) files are not supported yet.',
              });
              return;
            }

            updateSessionEntry(file, {
              status: 'processing',
              error: undefined,
              session: undefined,
              warnings: undefined,
              characterCount: undefined,
              pageCount: undefined,
            });

            try {
              let workingFile: File = file;
              const shouldRunOcr = Boolean(options?.forceOcr && extension === 'pdf');
              if (shouldRunOcr) {
                workingFile = await runOcrForChat(file);
              }
              let extracted: { text: string; pageCount?: number; characterCount: number };
              if (extension === 'pdf') {
                const pdfResult = await extractTextFromPdf(workingFile);
                extracted = {
                  text: pdfResult.text,
                  pageCount: pdfResult.pageCount,
                  characterCount: pdfResult.characterCount,
                };
              } else {
                const docxResult = await extractTextFromDocx(workingFile);
                extracted = {
                  text: docxResult.text,
                  pageCount: 0,
                  characterCount: docxResult.characterCount,
                };
              }

              if (!extracted.text || extracted.text.trim().length === 0) {
                throw new Error(
                        'No text detected. Try running OCR from the chat window.'
                );
              }

              const metadata: Record<string, string> = {
                fileName: workingFile.name,
                fileSize: String(workingFile.size),
                fileType: workingFile.type || extension,
                characterCount: String(extracted.characterCount),
                ocrApplied: shouldRunOcr ? 'true' : 'false',
              };
              if (typeof extracted.pageCount === 'number') {
                metadata.pageCount = String(extracted.pageCount);
              }

              const session = await createChatbotSession({
                sessionId: file.fileId,
                documentId: file.fileId,
                text: extracted.text,
                metadata,
                ocrRequested: shouldRunOcr,
                warningsAccepted: true,
              });

              updateSessionEntry(file, {
                status: 'ready',
                session,
                characterCount: extracted.characterCount,
                pageCount: extracted.pageCount,
                warnings: session.warnings ?? [],
                error: undefined,
              });
            } catch (error) {
              const message =
                      error instanceof Error
                              ? error.message
                              : 'Failed to prepare document for chatbot.';
              updateSessionEntry(file, {
                status: 'error',
                error: message,
              });
              throw error;
            }
          },
          [getExtension, supportedExtensions, updateSessionEntry]
  );

  const requestPreprocessing = useCallback(
          async (fileId: string, options?: PreprocessOptions) => {
            const file = selectors.getFile(fileId as any);
            if (!file) {
              return;
            }
            if (inFlightRef.current.has(fileId) && !options?.force) {
              return inFlightRef.current.get(fileId);
            }
            const promise = preprocessFile(file, options)
                    .finally(() => {
                      inFlightRef.current.delete(fileId);
                    });
            inFlightRef.current.set(fileId, promise);
            return promise;
          },
          [selectors, preprocessFile]
  );

  const filesSignature = selectors.getFilesSignature();
  const availableFiles = useMemo(
          () => selectors.getFiles(),
          [filesSignature, selectors]
  );

  useEffect(() => {
    availableFiles.forEach((file) => {
      if (!supportedExtensions.has(getExtension(file))) {
        return;
      }
      if (!sessionsRef.current[file.fileId]) {
        requestPreprocessing(file.fileId).catch(() => {});
      }
    });

    const currentIds = new Set(availableFiles.map((file) => file.fileId));
    setPreparedSessions((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((fileId) => {
        if (!currentIds.has(fileId as any)) {
          delete next[fileId];
        }
      });
      return next;
    });
  }, [availableFiles, getExtension, requestPreprocessing, supportedExtensions]);

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
      sessions: preparedSessions,
      requestPreprocessing,
    }),
    [isOpen, source, preferredFileId, openChat, closeChat, preparedSessions, requestPreprocessing]
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
