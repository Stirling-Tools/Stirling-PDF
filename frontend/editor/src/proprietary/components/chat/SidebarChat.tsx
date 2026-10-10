import { useRef, useState, type FocusEvent } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { ChatPanel } from "@app/components/chat/ChatPanel";
import { useChat } from "@app/components/chat/ChatContext";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import { useChatAccess } from "@app/hooks/useChatAccess";
import { useIsScrolled } from "@app/hooks/useIsScrolled";
// Its header reuses the file sidebar's section header, so the two sections match.
import "@app/components/shared/FileSidebar.css";
import "@app/components/chat/SidebarChat.css";

export function SidebarChat() {
  return useAiEngineEnabled() ? <ChatDock /> : null;
}

function ChatDock() {
  const { t } = useTranslation();
  const { messages, isLoading, clearChat } = useChat();
  const requestChatAccess = useChatAccess();
  const [expanded, setExpanded] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const { scrolled, scrollRef: messagesRef } = useIsScrolled();

  const handleComposerFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    if (expanded) return;
    if (!requestChatAccess()) {
      event.currentTarget.blur();
      return;
    }
    setExpanded(true);
  };

  const handleCollapse = () => {
    setExpanded(false);
    // WebKit keeps focus on the composer through a button click, and a composer
    // that is already focused never fires the focus that reopens the dock.
    const active = document.activeElement;
    if (active instanceof HTMLElement && dockRef.current?.contains(active)) {
      active.blur();
    }
  };

  const title = t("chat.dock.title", "Stirling Agent");
  const collapseLabel = t("chat.dock.collapse", "Collapse chat");

  const header = (
    <div
      className="file-sidebar-section-header"
      data-scrolled={(expanded && scrolled) || undefined}
    >
      <span className="file-sidebar-section-label chat-dock__title">
        {title}
      </span>
      {(messages.length > 0 || isLoading) && (
        <ActionIcon
          variant="quiet"
          className="file-sidebar-section-btn"
          onClick={clearChat}
          aria-label={t("chat.header.clearChat", "Clear chat")}
          title={t("chat.header.clearChat", "Clear chat")}
        >
          <Icon name="trash" size="1rem" />
        </ActionIcon>
      )}
      <ActionIcon
        variant="quiet"
        className="file-sidebar-section-btn"
        onClick={handleCollapse}
        aria-label={collapseLabel}
        title={collapseLabel}
      >
        <Icon name="chevron-down" size="1rem" />
      </ActionIcon>
    </div>
  );

  return (
    <section
      ref={dockRef}
      className="chat-dock"
      data-state={expanded ? "expanded" : "collapsed"}
      aria-label={title}
    >
      <ChatPanel
        expanded={expanded}
        header={header}
        messagesRef={messagesRef}
        onComposerFocus={handleComposerFocus}
      />
    </section>
  );
}
