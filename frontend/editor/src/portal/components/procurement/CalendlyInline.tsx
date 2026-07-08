import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadScript } from "@app/utils/scriptLoader";
import { useTheme } from "@portal/contexts/ThemeContext";

/**
 * Inline Calendly scheduler. Lazily loads Calendly's widget.js (only once the embed mounts, i.e. when
 * the modal opens) and initialises an inline widget whose colours track the portal's light/dark theme.
 * Falls back to a plain "open in a new tab" link if the script can't load (offline, blocked, etc.).
 */

const CALENDLY_SCRIPT = "https://assets.calendly.com/assets/external/widget.js";

// Base scheduling link; overridable per-environment without a code change.
export const CALENDLY_URL: string =
  import.meta.env.VITE_CALENDLY_URL ??
  "https://calendly.com/d/cm4p-zz5-yy8/stirling-pdf-15-minute-group-discussion";

// Calendly takes bare hex (no leading #). Values mirror the portal design tokens per theme so the
// embed blends into the surrounding surface.
const THEME_COLORS = {
  light: { background: "ffffff", text: "0f172a", primary: "2383e2" },
  dark: { background: "151c2e", text: "f1f5f9", primary: "2383e2" },
} as const;

interface CalendlyWindow extends Window {
  Calendly?: {
    initInlineWidget: (opts: {
      url: string;
      parentElement: HTMLElement;
    }) => void;
  };
}

function buildUrl(base: string, theme: "light" | "dark"): string {
  const c = THEME_COLORS[theme];
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}hide_event_type_details=1&background_color=${c.background}&text_color=${c.text}&primary_color=${c.primary}`;
}

export function CalendlyInline({
  url = CALENDLY_URL,
  height = 640,
}: {
  url?: string;
  height?: number;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const fullUrl = buildUrl(url, theme);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadScript({ src: CALENDLY_SCRIPT, id: "calendly-widget-script" })
      .then(() => {
        const el = containerRef.current;
        const calendly = (window as CalendlyWindow).Calendly;
        if (cancelled || !el || !calendly) return;
        // Re-init explicitly (rather than relying on widget.js auto-scan) so the widget rebuilds on
        // reopen and whenever the theme-derived URL changes.
        el.innerHTML = "";
        calendly.initInlineWidget({ url: fullUrl, parentElement: el });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [fullUrl]);

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
