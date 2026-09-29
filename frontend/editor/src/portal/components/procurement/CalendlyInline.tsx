import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@app/ui";
import { loadScript } from "@app/utils/scriptLoader";

/**
 * Inline Calendly scheduler. Lazily loads Calendly's widget.js (only once the embed mounts, i.e. when
 * the modal opens) and initialises an inline widget. Shows a spinner while the (external, sometimes
 * slow) script loads, and falls back to a plain "open in a new tab" link if the script can't load
 * (offline, blocked, etc.). A real load failure fires the script's error event, so the fallback is
 * shown immediately rather than after a fixed timeout — a slow-but-working connection is never
 * abandoned, it just spins until the widget arrives.
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

// Origins the embed fetches from: the widget script, then the scheduler iframe.
const CALENDLY_ORIGINS = [
  "https://assets.calendly.com",
  "https://calendly.com",
];

function preconnect(origin: string): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`))
    return;
  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = origin;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

/**
 * Warm the Calendly embed ahead of use: open connections to its origins and start fetching
 * widget.js, so opening the scheduler initialises near-instantly instead of paying a cold
 * script + iframe fetch on click. Idempotent and safe to call repeatedly; failures are left
 * for the modal's own load to surface as the fallback link.
 */
export function warmCalendly(): void {
  CALENDLY_ORIGINS.forEach(preconnect);
  void loadScript({ src: CALENDLY_SCRIPT, id: "calendly-widget-script" }).catch(
    () => {},
  );
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
  const [loading, setLoading] = useState(true);

  const fullUrl = buildUrl(url);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setLoading(true);
    loadScript({ src: CALENDLY_SCRIPT, id: "calendly-widget-script" })
      .then(() => {
        const el = containerRef.current;
        const calendly = (window as CalendlyWindow).Calendly;
        if (cancelled || !el) return;
        // Script resolved but the global never materialised (blocked/altered by an
        // extension, etc.) — show the fallback link rather than an empty modal.
        if (!calendly) {
          setFailed(true);
          return;
        }
        // Re-init explicitly (rather than relying on widget.js auto-scan) so the widget rebuilds on
        // reopen and whenever the URL or prefill changes.
        el.innerHTML = "";
        calendly.initInlineWidget({
          url: fullUrl,
          parentElement: el,
          prefill: email ? { email } : undefined,
        });
        setLoading(false);
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
    <div className="portal-calendly" style={{ minWidth: 320, height }}>
      {loading && (
        <div className="portal-calendly__loading">
          <Spinner size="lg" label={t("portal.procurement.schedule.loading")} />
        </div>
      )}
      {/* Calendly injects its iframe here; the spinner overlays until the widget is initialised. */}
      <div ref={containerRef} className="portal-calendly__embed" />
    </div>
  );
}
