/// <reference types="vite/client" />
import { useState } from "react";
import {
  readMocksPreference,
  writeMocksPreference,
} from "@app/mocks/preference";
import "@app/components/MocksToggle.css";

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
      title={
        enabled
          ? "Mock data ON — fetch calls are intercepted by MSW. Click to switch to the real network (reloads the page)."
          : "Mock data OFF — fetch calls go to the real network. Click to re-enable mocks (reloads the page)."
      }
    >
      <span className="portal-mocks-toggle__dot" aria-hidden />
      <span className="portal-mocks-toggle__label">
        Mocks {enabled ? "ON" : "OFF"}
      </span>
    </button>
  );
}
