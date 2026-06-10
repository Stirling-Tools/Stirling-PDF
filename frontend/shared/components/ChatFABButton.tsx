import type { ButtonHTMLAttributes } from "react";
import "@shared/components/ChatFABButton.css";

export interface ChatFABButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shows a green pulse dot to indicate the agent is actively working. */
  isLoading?: boolean;
  /** Shows a green tick badge to indicate an unread result is waiting. */
  showTick?: boolean;
}

export function ChatFABButton({
  isLoading = false,
  showTick = false,
  className,
  ...rest
}: ChatFABButtonProps) {
  const classes = [
    "chat-fab-btn",
    isLoading ? "chat-fab-btn--loading" : "",
    showTick ? "chat-fab-btn--tick" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} {...rest}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={28}
        height={28}
        viewBox="0 0 192 192"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M68.48 102.4 L184.73 6.45 L184.73 96.05 L68.48 192 Z"
          opacity="0.7"
        />
        <path d="M7.26 95.83 L123.37 0 L123.37 89.5 L7.26 185.33 Z" />
      </svg>
      {isLoading && !showTick && (
        <span className="chat-fab-btn__pulse" aria-hidden="true" />
      )}
      {showTick && (
        <span className="chat-fab-btn__tick" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={10}
            height={10}
            viewBox="0 0 10 10"
            fill="none"
          >
            <path
              d="M2 5l2 2 4-4"
              stroke="#fff"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </button>
  );
}
