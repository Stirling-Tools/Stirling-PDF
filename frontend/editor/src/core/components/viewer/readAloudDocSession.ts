/**
 * One PDFium document shared by every page of a read-aloud session, so page
 * advances do not pay a full open+parse each. The open promise (not the
 * pointer) is cached so concurrent advances share one open; a superseded
 * open (new key while one is in flight) is closed instead of cached.
 */
export function createReadAloudDocSession(
  open: (bytes: ArrayBuffer) => Promise<number>,
  close: (docPtr: number) => Promise<unknown> | unknown,
) {
  let key: unknown = null;
  let pending: Promise<number> | null = null;

  const closeSession = (): void => {
    const inFlight = pending;
    pending = null;
    key = null;
    if (inFlight) {
      inFlight.then((docPtr) => close(docPtr)).catch(() => {});
    }
  };

  const ensure = async (
    sessionKey: unknown,
    bytes: ArrayBuffer,
  ): Promise<number | null> => {
    if (key !== sessionKey || !pending) {
      closeSession();
      key = sessionKey;
      const opened = open(bytes);
      pending = opened;
      opened.catch(() => {
        if (pending === opened) {
          pending = null;
        }
      });
    }
    const current = pending;
    if (!current) {
      return null;
    }
    try {
      const docPtr = await current;
      if (key !== sessionKey) {
        return null;
      }
      return docPtr;
    } catch {
      return null;
    }
  };

  return { ensure, close: closeSession };
}
