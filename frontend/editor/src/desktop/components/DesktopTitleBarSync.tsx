import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getDesktopOs, DesktopOs } from "@app/services/platformService";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

// Resolve a CSS custom property to concrete sRGB channels. Reading the variable
// directly can hand back an unresolved value (var()/color-mix()); assigning it
// to a probe's `color` and reading the computed style forces the browser to
// resolve it to `rgb(...)`.
function resolveColor(cssVar: string): Rgb | null {
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVar})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  const match = computed.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
  return {
    r: Math.round(parts[0]),
    g: Math.round(parts[1]),
    b: Math.round(parts[2]),
  };
}

/**
 * Desktop-only, Windows-only: keeps the native title bar (caption) painted to
 * match the app's --c-bg / --c-text so the window chrome stays on theme instead
 * of showing the OS accent colour. Re-applies whenever the theme attributes on
 * <html> change (light/dark toggle, system change). Renders nothing.
 *
 * The Rust command is a safe no-op off Windows and below Windows 11 22000, so
 * the OS gate here is only to avoid pointless IPC on mac/Linux.
 */
export function DesktopTitleBarSync() {
  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const apply = () => {
      const caption = resolveColor("--c-bg");
      const text = resolveColor("--c-text");
      if (!caption || !text) return;
      void invoke("set_titlebar_color", { caption, text }).catch(() => {});
    };

    void getDesktopOs().then((os) => {
      if (cancelled || os !== DesktopOs.Windows) return;
      apply();
      // The editor's dark palette is gated on data-mantine-color-scheme (set by
      // Mantine); data-theme/data-accent flip alongside it. Watch all three so
      // any theme change repaints the caption.
      observer = new MutationObserver(apply);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [
          "data-theme",
          "data-accent",
          "data-mantine-color-scheme",
        ],
      });
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}
