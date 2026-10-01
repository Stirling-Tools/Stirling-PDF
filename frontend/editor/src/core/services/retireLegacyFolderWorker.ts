/** Unregister the retired folder-retry worker without changing stored files or folder data. */
export async function retireLegacyFolderWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    const scriptURL = new URL("/sw-folder-retry.js", window.location.origin)
      .href;
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const workers = [
        registration.active,
        registration.waiting,
        registration.installing,
      ].filter((worker) => worker !== null);
      // A different worker waiting on the same scope belongs to its current feature.
      if (
        workers.length > 0 &&
        workers.every((worker) => worker.scriptURL === scriptURL)
      ) {
        await registration.unregister();
      }
    }
  } catch (error) {
    console.warn("Could not retire the legacy folder retry worker", error);
  }
}
