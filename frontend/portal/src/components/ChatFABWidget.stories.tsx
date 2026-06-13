import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { ChatFABButton } from "@shared/components/ChatFABButton";
import { ChatFABWindow } from "@shared/components/ChatFABWindow";

/**
 * Full ChatFAB widget demo — composed from ChatFABButton + ChatFABWindow.
 *
 * This story simulates the open/close interaction as it looks in the editor
 * without needing the full editor context. The real implementation wires
 * these same components to ChatContext and react-rnd for dragging.
 */

interface MockMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const INITIAL_MESSAGES: MockMessage[] = [
  {
    id: 1,
    role: "user",
    text: "Merge the three contracts and redact all SSNs",
  },
  {
    id: 2,
    role: "assistant",
    text: "I'll merge the PDFs first, then run automatic PII redaction on the combined document.",
  },
];

function MockChatContent({
  messages,
  onClose,
}: {
  messages: MockMessage[];
  onClose: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      {/* Header — acts as drag handle in the real implementation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--color-border, #e3e8ee)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600 }}>Stirling</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            borderRadius: 6,
            color: "var(--color-text-4, #64748b)",
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "82%",
              background:
                m.role === "user"
                  ? "#3b82f6"
                  : "var(--color-bg-muted, #f3f4f6)",
              color: m.role === "user" ? "#fff" : "inherit",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {m.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          padding: "10px 12px 14px",
          borderTop: "1px solid var(--color-border, #e3e8ee)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            background: "var(--color-bg-muted, #f3f4f6)",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            color: "var(--color-text-4, #64748b)",
          }}
        >
          What do you want to do?
        </div>
      </div>
    </div>
  );
}

function ChatFABWidgetDemo({
  startOpen = false,
  agentLoading = false,
  showTick = false,
}: {
  startOpen?: boolean;
  agentLoading?: boolean;
  showTick?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [hasUnviewedResult, setHasUnviewedResult] = useState(showTick);
  const messages = INITIAL_MESSAGES;

  return (
    /* Simulates the workbench overlay container */
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--color-bg, #f8f9fb)",
      }}
    >
      {/* FAB button */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setHasUnviewedResult(false);
        }}
        aria-label="Open Stirling AI assistant"
        aria-expanded={open}
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          opacity: open ? 0 : 1,
          transform: open ? "scale(0.78)" : "scale(1)",
          transition:
            "opacity 160ms ease, transform 180ms cubic-bezier(0.32, 0.72, 0, 1)",
          pointerEvents: open ? "none" : "auto",
        }}
      >
        <ChatFABButton
          isLoading={agentLoading}
          showTick={hasUnviewedResult && !agentLoading}
          tabIndex={open ? -1 : 0}
        />
      </button>

      {/* Chat panel */}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          width: 390,
          height: 520,
        }}
      >
        <ChatFABWindow open={open}>
          <MockChatContent messages={messages} onClose={() => setOpen(false)} />
        </ChatFABWindow>
      </div>
    </div>
  );
}

type FlowStep = "idle" | "loading" | "tick" | "open";

function ChatFABFullFlowDemo() {
  const [step, setStep] = useState<FlowStep>("idle");
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnviewedResult, setHasUnviewedResult] = useState(false);
  const isOpenRef = useRef(open);
  isOpenRef.current = open;

  // Simulate agent finishing while FAB is closed → show tick
  const simulateAgentRun = () => {
    setStep("loading");
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (!isOpenRef.current) setHasUnviewedResult(true);
      setStep("tick");
    }, 2500);
  };

  const handleOpen = () => {
    setOpen(true);
    setHasUnviewedResult(false);
    setStep("open");
  };

  const handleClose = () => {
    setOpen(false);
    setStep("idle");
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Step guide */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {(["idle", "loading", "tick", "open"] as FlowStep[]).map((s) => (
          <div
            key={s}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background:
                step === s ? "#3b82f6" : "var(--color-bg-muted, #f3f4f6)",
              color: step === s ? "#fff" : "inherit",
              fontWeight: step === s ? 600 : 400,
            }}
          >
            {s === "idle" && "① Idle — plain icon"}
            {s === "loading" && "② Loading — animated logo + pulse"}
            {s === "tick" && "③ Unread result — tick badge"}
            {s === "open" && "④ Viewed — tick cleared"}
          </div>
        ))}
        <button
          type="button"
          onClick={simulateAgentRun}
          disabled={isLoading || open}
          style={{
            marginTop: 4,
            padding: "6px 12px",
            borderRadius: 6,
            border: "none",
            background: "#22c55e",
            color: "#fff",
            cursor: isLoading || open ? "not-allowed" : "pointer",
            opacity: isLoading || open ? 0.5 : 1,
            fontSize: 13,
          }}
        >
          Simulate agent run
        </button>
      </div>

      {/* FAB button */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Open Stirling AI assistant"
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          opacity: open ? 0 : 1,
          transform: open ? "scale(0.78)" : "scale(1)",
          transition:
            "opacity 160ms ease, transform 180ms cubic-bezier(0.32, 0.72, 0, 1)",
          pointerEvents: open ? "none" : "auto",
        }}
      >
        <ChatFABButton
          isLoading={isLoading}
          showTick={hasUnviewedResult && !isLoading}
        />
      </button>

      {/* Chat panel */}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          width: 390,
          height: 520,
        }}
      >
        <ChatFABWindow open={open}>
          <MockChatContent messages={INITIAL_MESSAGES} onClose={handleClose} />
        </ChatFABWindow>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: "Editor/ChatFAB/ChatFABWidget",
  parameters: { layout: "fullscreen" },
  decorators: [
    (S) => (
      <div style={{ minHeight: "100vh", position: "relative" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj;

export const Closed: Story = {
  render: () => <ChatFABWidgetDemo startOpen={false} />,
};

export const Open: Story = {
  render: () => <ChatFABWidgetDemo startOpen={true} />,
};

/** FAB closed while the agent is running — animated logo + green pulse dot. */
export const LoadingWhileClosed: Story = {
  render: () => <ChatFABWidgetDemo startOpen={false} agentLoading={true} />,
};

export const LoadingWhileOpen: Story = {
  render: () => <ChatFABWidgetDemo startOpen={true} agentLoading={true} />,
};

/**
 * Agent finished while the panel was closed.
 * The tick badge signals an unread result; clicking the FAB clears it.
 */
export const UnreadResult: Story = {
  render: () => <ChatFABWidgetDemo startOpen={false} showTick={true} />,
};

/**
 * Interactive walkthrough of the full notification state machine:
 * idle → loading (animated logo) → tick badge (unread) → open (tick clears) → idle.
 * Use the "Simulate agent run" button to trigger the transition.
 */
export const FullFlow: Story = {
  render: () => <ChatFABFullFlowDemo />,
};
