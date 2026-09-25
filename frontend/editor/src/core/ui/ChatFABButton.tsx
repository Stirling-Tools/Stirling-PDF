import type { ButtonHTMLAttributes } from "react";
import { BrandMark } from "@app/components/shared/BrandMark";
import "@app/ui/ChatFABButton.css";

export interface ChatFABButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Green pulse dot — agent is working. */
  loading?: boolean;
  /** Green tick badge — unread result waiting. */
  showTick?: boolean;
}

export function ChatFABButton({
  loading = false,
  showTick = false,
  className,
  ...rest
}: ChatFABButtonProps) {
  const classes = [
    "chat-fab-btn",
    loading ? "chat-fab-btn--loading" : "",
    showTick ? "chat-fab-btn--tick" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-label="Open assistant"
      {...rest}
    >
      {/* Decorative: the button itself carries the accessible name. */}
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        <BrandMark height="1.875rem" />
      </span>
      {loading && !showTick && (
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
