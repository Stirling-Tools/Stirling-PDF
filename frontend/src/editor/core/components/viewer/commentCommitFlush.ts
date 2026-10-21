let flushHandler: (() => void) | null = null;

/** Registers the mounted comments sidebar's pending-draft flush. */
export function registerCommentCommitFlush(handler: () => void): () => void {
  flushHandler = handler;
  return () => {
    if (flushHandler === handler) flushHandler = null;
  };
}

/** Applies pending comment drafts before the viewer exports the document. */
export function flushCommentCommits(): void {
  flushHandler?.();
}
