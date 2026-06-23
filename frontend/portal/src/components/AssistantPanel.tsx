import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUI } from "@portal/contexts/UIContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  fetchAssistantSuggestions,
  getAssistantReply,
} from "@portal/api/assistant";
import { CloseIcon, SendIcon, SparklesIcon } from "@portal/components/icons";
import "@portal/components/AssistantPanel.css";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
}

export function AssistantPanel() {
  const { t } = useTranslation();
  const { assistantOpen, closeAssistant } = useUI();
  const { data: suggestions } = useAsync<readonly string[]>(
    () => fetchAssistantSuggestions(),
    [],
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const nextIdRef = useRef(1);

  useEffect(() => {
    if (assistantOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [assistantOpen]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    const userMsg: Message = {
      id: nextIdRef.current++,
      role: "user",
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    try {
      const reply = await getAssistantReply(trimmed);
      const assistantMsg: Message = {
        id: nextIdRef.current++,
        role: "assistant",
        text: reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const failMsg: Message = {
        id: nextIdRef.current++,
        role: "assistant",
        text:
          err instanceof Error
            ? t("assistant.errorWithDetail", { detail: err.message })
            : t("assistant.error"),
      };
      setMessages((prev) => [...prev, failMsg]);
    } finally {
      setTyping(false);
    }
  }

  if (!assistantOpen) return null;

  return (
    <aside
      className="portal-assistant"
      role="dialog"
      aria-label={t("assistant.title")}
    >
      <header className="portal-assistant__header">
        <div className="portal-assistant__header-left">
          <SparklesIcon size={16} />
          <span className="portal-assistant__title">
            {t("assistant.title")}
          </span>
        </div>
        <button
          type="button"
          className="portal-assistant__close"
          onClick={closeAssistant}
          aria-label={t("assistant.close")}
        >
          <CloseIcon size={16} />
        </button>
      </header>

      <div className="portal-assistant__messages" ref={messagesRef}>
        {messages.length === 0 && suggestions && (
          <div className="portal-assistant__suggestions">
            <div className="portal-assistant__suggestions-eyebrow">
              {t("assistant.tryAsking")}
            </div>
            <div className="portal-assistant__suggestions-list">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="portal-assistant__suggestion"
                  onClick={() => send(s)}
                  disabled={typing}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              "portal-assistant__bubble portal-assistant__bubble--" + m.role
            }
          >
            {m.text}
          </div>
        ))}
        {typing && (
          <div className="portal-assistant__bubble portal-assistant__bubble--assistant">
            <span
              className="portal-assistant__typing"
              aria-label={t("assistant.typing")}
            >
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
      </div>

      <form
        className="portal-assistant__input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("assistant.inputPlaceholder")}
          aria-label={t("assistant.inputAriaLabel")}
          className="portal-assistant__input"
          disabled={typing}
        />
        <button
          type="submit"
          className="portal-assistant__send"
          disabled={!input.trim() || typing}
          aria-label={t("assistant.send")}
        >
          <SendIcon size={14} />
        </button>
      </form>
    </aside>
  );
}
