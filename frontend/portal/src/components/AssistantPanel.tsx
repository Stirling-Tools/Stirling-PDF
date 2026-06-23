import { useEffect, useRef, useState } from "react";
import { Button } from "@shared/components";
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
            ? `Couldn't reach the assistant: ${err.message}`
            : "Couldn't reach the assistant.",
      };
      setMessages((prev) => [...prev, failMsg]);
    } finally {
      setTyping(false);
    }
  }

  if (!assistantOpen) return null;

  return (
    <aside className="portal-assistant" role="dialog" aria-label="Assistant">
      <header className="portal-assistant__header">
        <div className="portal-assistant__header-left">
          <SparklesIcon size={16} />
          <span className="portal-assistant__title">Assistant</span>
        </div>
        <Button
          variant="ghost"
          className="portal-assistant__close"
          onClick={closeAssistant}
          aria-label="Close assistant"
          leftSection={<CloseIcon size={16} />}
        />
      </header>

      <div className="portal-assistant__messages" ref={messagesRef}>
        {messages.length === 0 && suggestions && (
          <div className="portal-assistant__suggestions">
            <div className="portal-assistant__suggestions-eyebrow">
              Try asking
            </div>
            <div className="portal-assistant__suggestions-list">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  variant="outlined"
                  size="sm"
                  className="portal-assistant__suggestion"
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
              "portal-assistant__bubble portal-assistant__bubble--" + m.role
            }
          >
            {m.text}
          </div>
        ))}
        {typing && (
          <div className="portal-assistant__bubble portal-assistant__bubble--assistant">
            <span className="portal-assistant__typing" aria-label="Typing">
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
          placeholder="Ask about Stirling…"
          aria-label="Ask the assistant"
          className="portal-assistant__input"
          disabled={typing}
        />
        <Button
          type="submit"
          className="portal-assistant__send"
          disabled={!input.trim() || typing}
          aria-label="Send"
          leftSection={<SendIcon size={14} />}
        />
      </form>
    </aside>
  );
}
