/**
 * Core stub for the chat panel.
 * The real implementation lives in proprietary/components/chat/ChatPanel.tsx
 * and shadows this via the @app/* alias cascade in proprietary builds.
 */

export interface ChatPanelProps {
  onBack: () => void;
  backLabel: string;
}

export function ChatPanel(_props: ChatPanelProps) {
  return null;
}
