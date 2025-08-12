// Web Worker for lightweight data processing (not PDF rendering)
// PDF rendering must stay on main thread due to DOM dependencies

self.onmessage = async function(e) {
  const { type, data, jobId } = e.data;

  try {
    // Handle PING for worker health check
    if (type === 'PING') {
      self.postMessage({ type: 'PONG', jobId });
      return;
    }

    if (type === 'GENERATE_THUMBNAILS') {
      // Web Workers cannot do PDF rendering due to DOM dependencies
      // This is expected to fail and trigger main thread fallback
      throw new Error('PDF rendering requires main thread (DOM access needed)');
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      jobId,
      data: { error: error.message }
    });
  }
};
