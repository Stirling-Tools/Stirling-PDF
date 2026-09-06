import { useTranslation } from "react-i18next";
import { ChatPanel } from "@app/components/chat/ChatPanel";
import { useChat } from "@app/components/chat/ChatContext";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import "@portal/components/ProcessorChatPanel.css";

/**
 * The assistant panel for the processor.
 *
 * Docked rather than floating: the editor's draggable FAB is pinned above the whole app, and
 * the portal's own stacking ladder tops out well below that. Docking also matches where the
 * chat is heading in the editor — a quick-access-bar entry rather than an overlay — so both
 * surfaces end up sharing one trigger seam.
 *
 * `ChatPanel` needs nothing but `useChat()`, so it drops in unchanged.
 */
export function ProcessorChatPanel() {
  const { t } = useTranslation();
  const { isOpen, closeChat } = useChat();

  if (!isOpen) return null;

  return (
    // Un-keyed and separate from the routed view's boundary: a chat crash must not take the
    // shell with it, and navigating should not reset it.
    <ErrorBoundary>
      <aside
        className="processor-chat"
        aria-label={t("portal.assistant.title", "Assistant")}
      >
        <ChatPanel
          onBack={closeChat}
          backLabel={t("chat.fab.close", "Close chat")}
        />
      </aside>
    </ErrorBoundary>
  );
}
