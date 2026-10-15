import { useEffect, useRef, useState } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useLogoAssets } from "@app/hooks/useLogoAssets";

/**
 * The served PWA manifest is a static JSON file (manifest.json /
 * manifest-classic.json) that hardcodes "Stirling PDF". The installed PWA name
 * must reflect the configured `ui.appNameNavbar` instead (issue #5492). The
 * static files cannot interpolate runtime config, so the manifest is rebuilt at
 * runtime: fetch the static file, merge `name`/`short_name` from the config,
 * and inject the result as a blob URL into the existing <link rel="manifest">.
 *
 * URL-member rewriting is mandatory (KTD1): the static manifests use relative
 * members (`"start_url": "."`, `"src": "modern-logo/logo192.png"`). The manifest
 * spec resolves every URL member against the manifest URL; a blob URL has an
 * opaque path, so relative references against it fail WHATWG URL parsing and the
 * icons are dropped — which fails Chrome's installability check. Before creating
 * the blob, rewrite `start_url`, every `icons[].src`, and (when present)
 * `scope`/`id` to origin-absolute URLs resolved against `window.location`.
 */

/** PWA short names must stay within 12 code points (ellipsis included) per KTD3. */
export const MAX_SHORT_NAME_CODE_POINTS = 12;

export interface ManifestIcon {
  src?: string;
  sizes?: string;
  type?: string;
  purpose?: string;
  [key: string]: unknown;
}

export interface StaticManifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  id?: string;
  icons?: ManifestIcon[];
  [key: string]: unknown;
}

/**
 * Treat undefined / null / empty / whitespace-only as unset (KTD1/R2). Returns
 * the trimmed name, or null when there is no usable configured name.
 */
export function resolveAppName(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Truncate a PWA short name to at most 12 code points, including the trailing
 * ellipsis (KTD3): the first 11 code points + "…" when the name is longer.
 * Surrogate-pair-safe: uses Array.from so astral characters (emoji, non-Latin)
 * are never split.
 */
export function truncateShortName(name: string): string {
  const codePoints = Array.from(name);
  if (codePoints.length <= MAX_SHORT_NAME_CODE_POINTS) {
    return name;
  }
  return `${codePoints
    .slice(0, MAX_SHORT_NAME_CODE_POINTS - 1)
    .join("")}\u2026`;
}

/** Resolve a manifest URL member against a base URL (KTD1). */
export function resolveManifestUrl(
  value: string | undefined,
  base: string,
): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return new URL(value, base).toString();
}

/** Merge the configured appName into the static manifest (KTD1/R2). */
export function mergeManifestName(
  manifest: StaticManifest,
  appName: string | null,
): StaticManifest {
  if (appName == null) {
    return manifest;
  }
  return {
    ...manifest,
    name: appName,
    short_name: truncateShortName(appName),
  };
}

/** Rewrite all URL members to origin-absolute URLs (KTD1). */
export function absolutizeManifestUrls(
  manifest: StaticManifest,
  origin: string,
): StaticManifest {
  const next: StaticManifest = { ...manifest };
  for (const key of ["start_url", "scope", "id"] as const) {
    const resolved = resolveManifestUrl(next[key], origin);
    if (resolved !== undefined) {
      next[key] = resolved;
    }
  }
  if (Array.isArray(next.icons)) {
    next.icons = next.icons.map((icon) => {
      const resolved = resolveManifestUrl(icon.src, origin);
      return resolved !== undefined ? { ...icon, src: resolved } : icon;
    });
  }
  return next;
}

export interface UseManifestUrlResult {
  /** The manifest URL for <link rel="manifest">: blob URL when a custom appName
   *  is set, otherwise the static manifestHref. */
  manifestHref: string;
}

/**
 * Produces the runtime manifest URL reflecting the configured appName.
 *
 * - Reads the logo variant via `useLogoAssets().manifestHref` to pick
 *   manifest.json vs manifest-classic.json.
 * - Fetches the static manifest, merges `name`/`short_name` from
 *   `AppConfig.appNameNavbar` (unset values fall back to the static ones), and
 *   rewrites URL members to origin-absolute URLs.
 * - Returns a blob URL. The previous blob URL is revoked only once its
 *   successor exists (no transient broken manifest link) and on unmount (no
 *   object-URL leaks).
 * - Returns the static manifestHref unchanged on fetch failure (R7) and while
 *   the fetch is in flight (T9b).
 */
export function useManifestUrl(): UseManifestUrlResult {
  const { config } = useAppConfig();
  const { manifestHref } = useLogoAssets();
  const appName = resolveAppName(config?.appNameNavbar);

  const [href, setHref] = useState(manifestHref);
  const createdUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (appName == null) {
      // No custom name: the static manifest is already correct (R2). Point back
      // at the static href and release any runtime blob from a previous value.
      if (createdUrlRef.current) {
        URL.revokeObjectURL(createdUrlRef.current);
        createdUrlRef.current = null;
      }
      setHref(manifestHref);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function buildManifestUrl() {
      try {
        const response = await fetch(manifestHref, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch manifest (HTTP ${response.status})`);
        }
        const staticManifest = (await response.json()) as StaticManifest;

        const merged = mergeManifestName(staticManifest, appName);
        // The manifest spec resolves URL members against the manifest URL,
        // not the page URL. The static manifest lives at `${BASE_PATH}/`,
        // so resolve against the manifest's own URL to stay correct on
        // subpath deploys and deep-linked routes.
        const manifestBase = new URL(manifestHref, window.location.origin);
        const resolved = absolutizeManifestUrls(
          merged,
          manifestBase.toString(),
        );
        const blob = new Blob([JSON.stringify(resolved)], {
          type: "application/manifest+json",
        });
        const newUrl = URL.createObjectURL(blob);

        // Superseded by a newer run or unmounted: never leave a blob behind.
        if (cancelled) {
          URL.revokeObjectURL(newUrl);
          return;
        }

        // Swap: release the previous runtime blob only once its successor
        // exists, so the manifest link never points at a revoked URL.
        if (createdUrlRef.current) {
          URL.revokeObjectURL(createdUrlRef.current);
        }
        createdUrlRef.current = newUrl;
        setHref(newUrl);
      } catch (error) {
        if (cancelled) {
          // Teardown aborted the fetch (StrictMode double-mount, dep change,
          // unmount): a normal transition, not a failure worth logging.
          return;
        }
        // Graceful degradation: keep serving the static manifest (R7), and
        // release the runtime blob it is replacing so none is orphaned.
        if (createdUrlRef.current) {
          URL.revokeObjectURL(createdUrlRef.current);
          createdUrlRef.current = null;
        }
        console.error(
          "[useManifestUrl] Failed to build runtime manifest:",
          error,
        );
        setHref(manifestHref);
      }
    }

    buildManifestUrl();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [manifestHref, appName]);

  // Unmount-only cleanup: release the last runtime blob. The per-change swap
  // above keeps at most one live blob at a time, so this never double-revokes.
  useEffect(() => {
    return () => {
      if (createdUrlRef.current) {
        URL.revokeObjectURL(createdUrlRef.current);
        createdUrlRef.current = null;
      }
    };
  }, []);

  return { manifestHref: href };
}
