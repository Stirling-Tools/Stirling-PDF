import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import "@shared/components/ChatFABWindow.css";

export interface ChatFABWindowProps {
  /** Whether the window is in its expanded/visible state. Controls the CSS transition. */
  open: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onDoubleClick?: MouseEventHandler<HTMLDivElement>;
}

/**
 * Visual frame for the floating chat panel.
 *
 * Renders a card shell (rounded corners, shadow, border) that animates in and
 * out via CSS transitions. The caller controls open/closed state; this component
 * owns only the appearance and animation — no drag logic, no context.
 */
export function ChatFABWindow({
  open,
  children,
  className,
  style,
  onDoubleClick,
}: ChatFABWindowProps) {
  const classes = [
    "chat-fab-window",
    open ? "chat-fab-window--open" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={style}
      aria-hidden={!open}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </div>
  );
}
