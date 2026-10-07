import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
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

/**
 * Both open states are the same height. `focused` is opened by the composer
 * taking focus and closes again once the user moves on; `pinned` is opened by
 * the expand control and stays until it is collapsed.
 */
type DockState = "collapsed" | "focused" | "pinned";

export function SidebarChat() {
  return useAiEngineEnabled() ? <ChatDock /> : null;
}

/** Portals count as inside: the dock's own overlays, like the files modal, render there. */
function isInsideDockOrPortal(target: EventTarget | null, dock: HTMLElement) {
  if (!(target instanceof Element)) return true;
  return dock.contains(target) || target.closest("[data-portal]") !== null;
}

function ChatDock() {
  const { t } = useTranslation();
  const { messages, isLoading, clearChat } = useChat();
  const requestChatAccess = useChatAccess();
  const [state, setState] = useState<DockState>("collapsed");
  const [hasUnviewedResult, setHasUnviewedResult] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { scrolled, scrollRef: messagesRef } = useIsScrolled();
  const expanded = state !== "collapsed";

  // A run that finishes while the dock is collapsed leaves a tick on the mark.
  // Starts false rather than isLoading: a run already in flight at mount never
  // showed as running, so its end should not show as a result.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && !expandedRef.current) {
      setHasUnviewedResult(true);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    if (expanded) setHasUnviewedResult(false);
  }, [expanded]);

  // Sending turns a focus-opened dock into a pinned one, so the reply is still
  // on screen after the user clicks back into the document.
  useEffect(() => {
    if (isLoading) setState((s) => (s === "focused" ? "pinned" : s));
  }, [isLoading]);

  // Focused from an effect, not the toggle handler: the composer's focus handler
  // would otherwise still see "collapsed" and downgrade the pin to "focused".
  useEffect(() => {
    if (state === "pinned") composerRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (state !== "focused") return;
    const dock = dockRef.current;
    if (!dock) return;
    const collapseIfOutside = (event: Event) => {
      if (!isInsideDockOrPortal(event.target, dock)) setState("collapsed");
    };
    document.addEventListener("pointerdown", collapseIfOutside, true);
    document.addEventListener("focusin", collapseIfOutside);
    return () => {
      document.removeEventListener("pointerdown", collapseIfOutside, true);
      document.removeEventListener("focusin", collapseIfOutside);
    };
  }, [state]);

  const handleComposerFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    if (state !== "collapsed") return;
    if (!requestChatAccess()) {
      event.currentTarget.blur();
      return;
    }
    setState("focused");
  };

  const handleToggle = () => {
    if (expanded) {
      setState("collapsed");
      return;
    }
    if (!requestChatAccess()) return;
    setState("pinned");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || state === "collapsed") return;
    event.stopPropagation();
    setState("collapsed");
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const title = t("chat.dock.title", "Stirling Agent");
  const toggleLabel = expanded
    ? t("chat.dock.collapse", "Collapse chat")
    : t("chat.dock.expand", "Expand chat");

  return (
    <section
      ref={dockRef}
      className="chat-dock"
      data-state={state}
      aria-label={title}
      onKeyDown={handleKeyDown}
    >
      <div
        className="file-sidebar-section-header"
        data-scrolled={(expanded && scrolled) || undefined}
      >
        <span className="chat-dock__label">
          <span className="file-sidebar-section-label">{title}</span>
          {isLoading && <span className="chat-dock__running" aria-hidden />}
          {hasUnviewedResult && (
            <span className="chat-dock__tick" aria-hidden>
              <Icon name="check" size={9} strokeWidth={3} />
            </span>
          )}
        </span>
        {expanded && (messages.length > 0 || isLoading) && (
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
          onClick={handleToggle}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          <Icon name={expanded ? "chevron-down" : "chevron-up"} size="1rem" />
        </ActionIcon>
      </div>

      <ChatPanel
        expanded={expanded}
        composerRef={composerRef}
        messagesRef={messagesRef}
        onComposerFocus={handleComposerFocus}
      />
    </section>
  );
}
