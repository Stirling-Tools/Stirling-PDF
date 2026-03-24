/**
 * Service worker for Watch Folder retry scheduling.
 *
 * Reads the earliest pending retry from IndexedDB and sets a setTimeout for it.
 * When the timer fires it posts PROCESS_DUE_RETRIES to all window clients so
 * the main thread can atomically claim and process the due entries.
 *
 * Limitations:
 *   - Browsers may terminate idle service workers after ~30 s. The main thread
 *     therefore also drains due retries on mount and on visibilitychange as a
 *     fallback — no retries are lost, they may just fire slightly late.
 *   - Multiple clients each post a SCHEDULE_RETRY message; the SW deduplicates
 *     by resetting the timer each time, so only one notification is sent.
 */

const DB_NAME = 'stirling-pdf-retry-schedule';
const STORE_NAME = 'retries';

let retryTimer = null;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(scheduleNextTimer));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_RETRY') {
    scheduleNextTimer();
  }
});

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('SW: failed to open retry DB'));
    // Create store if this SW activates before the main thread has opened the DB
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('dueAt', 'dueAt', { unique: false });
      }
    };
  });
}

async function getEarliestDueAt() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const req = tx.objectStore(STORE_NAME).index('dueAt').openCursor();
      req.onsuccess = () => resolve(req.result ? req.result.value.dueAt : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function notifyClients() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'PROCESS_DUE_RETRIES' });
  }
}

async function scheduleNextTimer() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const earliest = await getEarliestDueAt();
  if (earliest === null) return;

  const delay = Math.max(0, earliest - Date.now());
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    await notifyClients();
    // Re-schedule for any remaining entries that were not yet due
    await scheduleNextTimer();
  }, delay);
}
