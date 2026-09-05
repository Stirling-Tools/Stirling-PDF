import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { ActionIcon } from "@app/ui";
import "@portal/components/store/StoreIdBadge.css";

/**
 * Copies `text` and reports a short "copied" window, so a badge or button can flip its label the
 * way CodeBlock does. Silently swallows clipboard failures (non-secure contexts).
 */
export function useCopyToClipboard(resetAfterMs = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetAfterMs);
    } catch {
      // Older browsers / non-secure contexts: nothing to report.
    }
  }
  return { copied, copy };
}

interface StoreIdBadgeProps {
  /** The store id, or a placeholder line for a listing that has none yet. */
  id: string;
  /** Show the copy control (a preview badge has nothing worth copying). */
  copyable?: boolean;
  className?: string;
}

/** The listing's id in mono, with an optional copy-to-clipboard control. */
export function StoreIdBadge({
  id,
  copyable = false,
  className,
}: StoreIdBadgeProps) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard();
  return (
    <span className={["portal-store__id", className ?? ""].join(" ").trim()}>
      <code className="portal-store__id-text">{id}</code>
      {copyable && (
        <ActionIcon
          variant="quiet"
          size="sm"
          className="portal-store__id-copy"
          aria-label={
            copied
              ? t("portal.store.card.copied")
              : t("portal.store.card.copyId")
          }
          onClick={() => void copy(id)}
        >
          {copied ? (
            <CheckRoundedIcon style={{ fontSize: "0.875rem" }} />
          ) : (
            <ContentCopyRoundedIcon style={{ fontSize: "0.875rem" }} />
          )}
        </ActionIcon>
      )}
    </span>
  );
}
