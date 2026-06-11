import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ChatFABWindow } from "@shared/components/ChatFABWindow";

const DEMO_MESSAGES = [
  {
    id: 1,
    role: "user" as const,
    text: "Merge the three contracts and redact all SSNs",
  },
  {
    id: 2,
    role: "assistant" as const,
    text: "I'll merge the PDFs first, then run redaction on the combined document. Starting now…",
  },
  { id: 3, role: "user" as const, text: "Great, also add a watermark" },
];

function MockChat() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--color-border, #e3e8ee)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Stirling
      </div>
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
        {DEMO_MESSAGES.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              background:
                m.role === "user"
                  ? "#3b82f6"
                  : "var(--color-bg-muted, #f3f4f6)",
              color: m.role === "user" ? "#fff" : "inherit",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div
        style={{
          padding: "10px 12px 14px",
          borderTop: "1px solid var(--color-border, #e3e8ee)",
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

const meta: Meta<typeof ChatFABWindow> = {
  title: "Editor/ChatFAB/ChatFABWindow",
  component: ChatFABWindow,
  parameters: { layout: "centered" },
  decorators: [
    (S) => (
      <div style={{ width: 390, height: 520 }}>
        <S />
      </div>
    ),
  ],
  argTypes: {
    open: { control: "boolean" },
  },
};
export default meta;
type Story = StoryObj<typeof ChatFABWindow>;

export const Closed: Story = {
  args: { open: false, children: <MockChat /> },
};

export const Open: Story = {
  args: { open: true, children: <MockChat /> },
};

export const Toggle: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ width: 390, height: 520, position: "relative" }}>
        <ChatFABWindow open={open}>
          <MockChat />
        </ChatFABWindow>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            position: "absolute",
            bottom: -48,
            right: 0,
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          {open ? "Close panel" : "Open panel"}
        </button>
      </div>
    );
  },
};
