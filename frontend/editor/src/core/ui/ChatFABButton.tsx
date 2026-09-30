import type { ButtonHTMLAttributes } from "react";
import { Icon } from "@app/ui/Icon";
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
          <Icon
            name="check"
            size={10}
            strokeWidth={2.5}
            style={{ color: "white" }}
          />
        </span>
      )}
    </button>
  );
}
