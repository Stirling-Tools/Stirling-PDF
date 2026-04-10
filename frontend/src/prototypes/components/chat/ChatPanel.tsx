import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, ScrollArea, TextInput, Stack, Text, Paper, Box, Transition, Loader, Group } from "@mantine/core";
import SendIcon from "@mui/icons-material/Send";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CloseIcon from "@mui/icons-material/Close";
import { useChat } from "@app/components/chat/ChatContext";
import "@app/components/chat/ChatPanel.css";

function ChatMessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  return (
    <div className={`chat-message chat-message-${role}`}>
      <Paper className={`chat-bubble chat-bubble-${role}`} p="xs" radius="md">
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {content}
        </Text>
      </Paper>
    </div>
  );
}

export function ChatPanel() {
  const { t } = useTranslation();
  const { messages, isOpen, isLoading, progressPhase, toggleOpen, sendMessage } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Toggle button - always visible */}
      {!isOpen && (
        <ActionIcon
          className="chat-toggle-button"
          variant="filled"
          color="blue"
          size="xl"
          radius="xl"
          onClick={toggleOpen}
          aria-label="Open chat"
        >
          <ChatBubbleOutlineIcon sx={{ fontSize: 24 }} />
        </ActionIcon>
      )}

      {/* Chat panel */}
      <Transition mounted={isOpen} transition="slide-left" duration={200}>
        {(styles) => (
          <Box className="chat-panel" style={styles}>
            {/* Header */}
            <div className="chat-panel-header">
              <Text fw={600} size="sm">
                AI Assistant
              </Text>
              <ActionIcon variant="subtle" size="sm" onClick={toggleOpen} aria-label="Close chat">
                <CloseIcon sx={{ fontSize: 16 }} />
              </ActionIcon>
            </div>

            {/* Messages */}
            <ScrollArea className="chat-panel-messages" viewportRef={scrollRef}>
              <Stack gap="sm" p="sm">
                {messages.length === 0 && (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    Ask a question about your documents or get help with PDF tools.
                  </Text>
                )}
                {messages.map((msg) => (
                  <ChatMessageBubble key={msg.id} role={msg.role} content={msg.content} />
                ))}
                {isLoading && (
                  <div className="chat-message chat-message-assistant">
                    <Paper className="chat-bubble chat-bubble-assistant" p="xs" radius="md">
                      <Group gap="xs" wrap="nowrap">
                        <Loader size="xs" type="dots" />
                        <Text size="sm" c="dimmed">
                          {progressPhase ? t(`chat.progress.${progressPhase}`) : t("chat.progress.thinking")}
                        </Text>
                      </Group>
                    </Paper>
                  </div>
                )}
              </Stack>
            </ScrollArea>

            {/* Input */}
            <div className="chat-panel-input">
              <TextInput
                ref={inputRef}
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rightSection={
                  <ActionIcon
                    variant="filled"
                    color="blue"
                    size="sm"
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    aria-label="Send message"
                  >
                    <SendIcon sx={{ fontSize: 14 }} />
                  </ActionIcon>
                }
                rightSectionWidth={36}
                style={{ flex: 1 }}
              />
            </div>
          </Box>
        )}
      </Transition>
    </>
  );
}
