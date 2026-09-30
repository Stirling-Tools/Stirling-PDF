import ThinkingMark from "@app/assets/brand/mark/brand-mark-thinking.svg?react";
import "@app/components/chat/ChatPanel.css";

export function StirlingLogoAnimated({ size = 20 }: { size?: number }) {
  return <ThinkingMark width={size} height={size} aria-hidden="true" />;
}
