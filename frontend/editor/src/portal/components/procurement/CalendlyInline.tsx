import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadScript } from "@app/utils/scriptLoader";

/**
 * Inline Calendly scheduler. Lazily loads Calendly's widget.js (only once the embed mounts, i.e. when
 * the modal opens) and initialises an inline widget. Falls back to a plain "open in a new tab" link if
 * the script can't load (offline, blocked, etc.).
 */

const CALENDLY_SCRIPT = "https://assets.calendly.com/assets/external/widget.js";

// Base scheduling link; overridable per-environment without a code change.
export const CALENDLY_URL: string =
  import.meta.env.VITE_CALENDLY_URL ||
  "https://calendly.com/d/cm4p-zz5-yy8/stirling-pdf-15-minute-group-discussion";

// Calendly takes bare hex (no leading #). Its embed always renders form inputs on a white background
// regardless of these params, so a dark background_color leaves light input text on white — unreadable.
// We therefore keep the widget on one light, high-contrast palette in both portal themes; it reads as a
// clean card inside the (possibly dark) modal. Only the accent tracks the brand primary.
const WIDGET_COLORS = {
  background: "ffffff",
  text: "0f172a",
  primary: "2383e2",
} as const;

interface CalendlyWindow extends Window {
  Calendly?: {
    initInlineWidget: (opts: {
      url: string;
      parentElement: HTMLElement;
      prefill?: { name?: string; email?: string };
    }) => void;
  };
}

function buildUrl(base: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}hide_event_type_details=1&background_color=${WIDGET_COLORS.background}&text_color=${WIDGET_COLORS.text}&primary_color=${WIDGET_COLORS.primary}`;
}

export function CalendlyInline({
  url = CALENDLY_URL,
  height = 760,
  email,
}: {
  url?: string;
  height?: number;
  /** Prefills the booking form's email (the linked account's email). */
  email?: string | null;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const fullUrl = buildUrl(url);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadScript({ src: CALENDLY_SCRIPT, id: "calendly-widget-script" })
      .then(() => {
        const el = containerRef.current;
        const calendly = (window as CalendlyWindow).Calendly;
        if (cancelled || !el || !calendly) return;
        // Re-init explicitly (rather than relying on widget.js auto-scan) so the widget rebuilds on
        // reopen and whenever the URL or prefill changes.
        el.innerHTML = "";
        calendly.initInlineWidget({
          url: fullUrl,
          parentElement: el,
          prefill: email ? { email } : undefined,
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [fullUrl, email]);

  if (failed) {
    return (
      <p className="portal-sidemodal__text">
        {t("portal.procurement.schedule.fallback")}{" "}
        <a href={url} target="_blank" rel="noopener noreferrer">
          {t("portal.procurement.schedule.fallbackLink")}
        </a>
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className="portal-calendly"
      style={{ minWidth: 320, height }}
    />
  );
}
