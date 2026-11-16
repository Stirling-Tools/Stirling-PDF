// WebKit ships no `ReadableStream[Symbol.asyncIterator]`, and pdf.js reads its
// text stream with `for await`, so all text extraction threw on Safari.

export function patchReadableStreamAsyncIterator(): void {
  if (typeof ReadableStream === "undefined") return;
  if (Symbol.asyncIterator in ReadableStream.prototype) return;

  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    writable: true,
    configurable: true,
    value: function <T>(this: ReadableStream<T>): AsyncIterableIterator<T> {
      const reader = this.getReader();
      // Releasing must be idempotent and must NOT happen after a successful
      // read - the next `read()` on a released reader throws.
      let finished = false;
      const release = () => {
        if (finished) return;
        finished = true;
        reader.releaseLock();
      };
      return {
        async next(): Promise<IteratorResult<T>> {
          // Spec short-circuits once finished; throwing here would break any
          // consumer that calls `next()` or `return()` defensively.
          if (finished) return { done: true, value: undefined };
          try {
            const { done, value } = await reader.read();
            if (done) {
              release();
              return { done: true, value: undefined };
            }
            return { done: false, value };
          } catch (error) {
            // The spec releases the reader in the read request's error steps.
            // Without this an errored stream stays locked for good: `for await`
            // does not call `return()` when `next()` rejects.
            release();
            throw error;
          }
        },
        async return(value?: unknown): Promise<IteratorResult<T>> {
          if (finished) return { done: true, value: value as T };
          try {
            await reader.cancel();
          } finally {
            release();
          }
          return { done: true, value: value as T };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
  });
}

patchReadableStreamAsyncIterator();
