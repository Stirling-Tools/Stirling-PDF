/// <reference lib="webworker" />
/**
 * Stirling PDF service worker (module type).
 *
 * Responsibilities:
 *  1. Precache the app shell (injected `self.__WB_MANIFEST` - entry HTML,
 *     JS/CSS bundles, pdfium.wasm, self-hosted fonts).
 *  2. Runtime-cache pdfium/pdfjs/logos with long-lived strategies.
 *  3. Watched Folder retry scheduling (ported from sw-folder-retry.js so there
 *     is exactly ONE controlling service worker per scope).
 *
 * Updates wait for the user (skipWaiting is NOT called on install); the
 * SKIP_WAITING message lets the update prompt activate the new worker.
 */
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import {
  CacheFirst,
  StaleWhileRevalidate,
  NetworkFirst,
} from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

clientsClaim();
cleanupOutdatedCaches();

// ---------------------------------------------------------------------------
// 1. App shell precache (manifest injected at build time by workbox-build).
// ---------------------------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST);

// ---------------------------------------------------------------------------
// 2. Runtime caching.
// ---------------------------------------------------------------------------

// Deploy base prefix ("" at the root, "/subpath/" under RUN_SUBPATH). Runtime
// route matchers must respect it so a subpath deployment caches its own files.
const scopePath = new URL(self.registration.scope).pathname; // "/" or "/subpath/"
const deploy = (path: string): string =>
  `${scopePath}${path}`.replace(/\/+/g, "/");

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// pdfium.wasm / pdfjs cmaps & fonts: version-independent, deterministic files.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith(deploy("pdfium/")) ||
    url.pathname.startsWith(deploy("pdfjs/")),
  new CacheFirst({
    cacheName: "stirling-runtime-pdfium",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 40,
        maxAgeSeconds: ONE_YEAR_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Vendor scan engine (jscanify/opencv ~9 MB): fetched on demand by the
// scanner route, deterministic per release, cache-first.
registerRoute(
  ({ url }) => url.pathname.startsWith(deploy("vendor/")),
  new CacheFirst({
    cacheName: "stirling-runtime-vendor",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: ONE_YEAR_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Brand logos: identity-free images, safe to serve slightly stale.
registerRoute(
  ({ url }) =>
    url.pathname.includes("/modern-logo/") ||
    url.pathname.includes("/classic-logo/"),
  new StaleWhileRevalidate({
    cacheName: "stirling-runtime-logos",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Hashed app chunks not in the precache manifest (tool bundles, lazy routes):
// cached on first use, refreshed in the background.
registerRoute(
  ({ url, request }) =>
    request.method === "GET" && url.pathname.startsWith(deploy("assets/")),
  new StaleWhileRevalidate({
    cacheName: "stirling-runtime-assets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: ONE_YEAR_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// API: network-first with a short timeout; only idempotent GETs are cached,
// and never auth endpoints.
const API_DENYLIST = [
  "/oauth2",
  "/saml2",
  "/login/",
  "/swagger-ui",
  "/v1/api-docs",
];
registerRoute(
  ({ request, url }) => {
    if (request.method !== "GET") return false;
    if (!url.pathname.startsWith(deploy("api/"))) return false;
    return !API_DENYLIST.some((p) => url.pathname.startsWith(p));
  },
  new NetworkFirst({
    cacheName: "stirling-runtime-api",
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Update flow: the page shows an update prompt and posts SKIP_WAITING once the
// user accepts. Everything else stays passive until then.
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// ---------------------------------------------------------------------------
// 3. Watched Folder retry scheduling.
//
// Reads the earliest pending retry from IndexedDB and sets a setTimeout for it.
// When the timer fires it posts PROCESS_DUE_RETRIES to all window clients so
// the main thread can atomically claim and process the due entries.
//
// Limitations:
//   - Browsers may terminate idle service workers after ~30 s. The main thread
//     therefore also drains due retries on mount and on visibilitychange as a
//     fallback - no retries are lost, they may just fire slightly late.
//   - Multiple clients each post a SCHEDULE_RETRY message; the SW deduplicates
//     by resetting the timer each time, so only one notification is sent.
// ---------------------------------------------------------------------------

const RETRY_DB_NAME = "stirling-pdf-retry-schedule";
const RETRY_STORE = "retries";

let retryTimer: ReturnType<typeof setTimeout> | null = null;

interface RetryEntry {
  id: string;
  dueAt: number;
}

function openRetryDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RETRY_DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("SW: failed to open retry DB"));
    // Create store if this SW activates before the main thread has opened the DB
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RETRY_STORE)) {
        const store = db.createObjectStore(RETRY_STORE, { keyPath: "id" });
        store.createIndex("dueAt", "dueAt", { unique: false });
      }
    };
  });
}

async function getEarliestDueAt(): Promise<number | null> {
  try {
    const db = await openRetryDB();
    return new Promise((resolve) => {
      const tx = db.transaction([RETRY_STORE], "readonly");
      const req = tx.objectStore(RETRY_STORE).index("dueAt").openCursor();
      req.onsuccess = () =>
        resolve(req.result ? (req.result.value as RetryEntry).dueAt : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function notifyClients(): Promise<void> {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    client.postMessage({ type: "PROCESS_DUE_RETRIES" });
  }
}

async function scheduleNextTimer(): Promise<void> {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const earliest = await getEarliestDueAt();
  if (earliest === null) return;

  const delay = Math.max(0, earliest - Date.now());
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void notifyClients().then(scheduleNextTimer);
  }, delay);
}

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SCHEDULE_RETRY") {
    void scheduleNextTimer();
  }
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim().then(() => scheduleNextTimer()));
});
