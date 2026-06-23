/// <reference types="vite/client" />
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  readMocksPreference,
  writeMocksPreference,
} from "@portal/mocks/preference";
import "@portal/components/MocksToggle.css";

/**
 * Dev-only header chip that flips MSW interception on and off. Persists the
 * preference to localStorage so it survives reloads. Hidden entirely in
 * production builds — there's no MSW worker to toggle there.
 *
 * Toggling reloads the page. Without a reload, components that already
 * fetched data via useAsync keep showing the cached result, which makes the
 * toggle feel like it does nothing. A reload gives a clean view of what the
 * app looks like with/without mocks.
 */
export function MocksToggle() {
  const { t } = useTranslation();
  const [enabled] = useState(() => readMocksPreference());
  const [pending, setPending] = useState(false);

  if (!import.meta.env.DEV) return null;

  function toggle() {
    if (pending) return;
    setPending(true);
    writeMocksPreference(!enabled);
    window.location.reload();
  }

  return (
    <button
      type="button"
      className={
        "portal-mocks-toggle" +
        (enabled ? " is-on" : " is-off") +
        (pending ? " is-pending" : "")
      }
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? t("mocks.tooltip.on") : t("mocks.tooltip.off")}
    >
      <span className="portal-mocks-toggle__dot" aria-hidden />
      <span className="portal-mocks-toggle__label">
        {enabled ? t("mocks.label.on") : t("mocks.label.off")}
      </span>
    </button>
  );
}
