import { useEffect, useRef, useState } from "react";
import { ActionIcon, Button } from "@app/ui";
import { useTranslation } from "react-i18next";
import { useUI } from "@processor/contexts/UIContext";
import { useAsync } from "@processor/hooks/useAsync";
import {
  fetchAssistantSuggestions,
  getAssistantReply,
} from "@processor/api/assistant";
import { CloseIcon, SendIcon, SparklesIcon } from "@processor/components/icons";
import "@processor/components/AssistantPanel.css";

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
            ? t("processor.assistant.errorWithDetail", { detail: err.message })
            : t("processor.assistant.error"),
      };
      setMessages((prev) => [...prev, failMsg]);
    } finally {
      setTyping(false);
    }
  }

  if (!assistantOpen) return null;

  return (
    <aside
      className="processor-assistant"
      role="dialog"
      aria-label={t("processor.assistant.title")}
    >
      <header className="processor-assistant__header">
        <div className="processor-assistant__header-left">
          <SparklesIcon size={16} />
          <span className="processor-assistant__title">
            {t("processor.assistant.title")}
          </span>
        </div>
        <ActionIcon
          variant="tertiary"
          className="processor-assistant__close"
          onClick={closeAssistant}
          aria-label={t("processor.assistant.close", "Close assistant")}
        >
          <CloseIcon size={16} />
        </ActionIcon>
      </header>

      <div className="processor-assistant__messages" ref={messagesRef}>
        {messages.length === 0 && suggestions && (
          <div className="processor-assistant__suggestions">
            <div className="processor-assistant__suggestions-eyebrow">
              {t("processor.assistant.tryAsking")}
            </div>
            <div className="processor-assistant__suggestions-list">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  size="sm"
                  className="processor-assistant__suggestion"
                  onClick={() => send(s)}
                  disabled={typing}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              "processor-assistant__bubble processor-assistant__bubble--" +
              m.role
            }
          >
            {m.text}
          </div>
        ))}
        {typing && (
          <div className="processor-assistant__bubble processor-assistant__bubble--assistant">
            <span
              className="processor-assistant__typing"
              aria-label={t("processor.assistant.typing")}
            >
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
      </div>

      <form
        className="processor-assistant__input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("processor.assistant.inputPlaceholder")}
          aria-label={t("processor.assistant.inputAriaLabel")}
          className="processor-assistant__input"
          disabled={typing}
        />
        <ActionIcon
          type="submit"
          className="processor-assistant__send"
          disabled={!input.trim() || typing}
          aria-label={t("processor.assistant.send")}
        >
          <SendIcon size={14} />
        </ActionIcon>
      </form>
    </aside>
  );
}
