// Web Worker for parallel thumbnail generation
console.log('🔧 Thumbnail worker starting up...');

let pdfJsLoaded = false;

// Import PDF.js properly for worker context
try {
  console.log('📦 Loading PDF.js locally...');
  importScripts('/pdf.js');

  if (self.pdfjsLib) {
    // Set up PDF.js worker
    self.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';
    pdfJsLoaded = true;
    console.log('✓ PDF.js loaded successfully from local files');
  } else {
    throw new Error('pdfjsLib not available after import');
  }
} catch (error) {
  console.error('✗ Failed to load local PDF.js:', error);
  pdfJsLoaded = false;
}

// Log the final status
if (pdfJsLoaded) {
  console.log('✅ Thumbnail worker ready for PDF processing');
} else {
  console.log('❌ Thumbnail worker failed to initialize - PDF.js not available');
}

self.onmessage = async function(e) {
  const { type, data, jobId } = e.data;

  try {
    // Handle PING for worker health check
    if (type === 'PING') {

      // Check if PDF.js is loaded before responding
      if (pdfJsLoaded && self.pdfjsLib) {
        self.postMessage({ type: 'PONG', jobId });
      } else {
        console.error('✗ PDF.js not loaded - worker not ready');
        self.postMessage({
          type: 'ERROR',
          jobId,
          data: { error: 'PDF.js not loaded in worker' }
        });
      }
      return;
    }

    if (type === 'GENERATE_THUMBNAILS') {

      if (!pdfJsLoaded || !self.pdfjsLib) {
        throw new Error('PDF.js not available in worker');
      }
      const { pdfArrayBuffer, pageNumbers, scale = 0.2, quality = 0.8 } = data;

      // Load PDF in worker using imported PDF.js
      const pdf = await self.pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;

      const thumbnails = [];

      // Process pages in smaller batches for smoother UI
      const batchSize = 3; // Process 3 pages at once for smoother UI
      for (let i = 0; i < pageNumbers.length; i += batchSize) {
        const batch = pageNumbers.slice(i, i + batchSize);

        const batchPromises = batch.map(async (pageNumber) => {
          try {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale });

            // Create OffscreenCanvas for better performance
            const canvas = new OffscreenCanvas(viewport.width, viewport.height);
            const context = canvas.getContext('2d');

            await page.render({ canvasContext: context, viewport }).promise;

            // Convert to blob then to base64 (more efficient than toDataURL)
            const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            const thumbnail = `data:image/jpeg;base64,${base64}`;

            return { pageNumber, thumbnail, success: true };
          } catch (error) {
            return { pageNumber, error: error.message, success: false };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        thumbnails.push(...batchResults);

        // Send progress update
        self.postMessage({
          type: 'PROGRESS',
          jobId,
          data: {
            completed: thumbnails.length,
            total: pageNumbers.length,
            thumbnails: batchResults.filter(r => r.success)
          }
        });

        // Small delay between batches to keep UI smooth
        if (i + batchSize < pageNumbers.length) {
          await new Promise(resolve => setTimeout(resolve, 100)); // Increased to 100ms pause between batches for smoother scrolling
        }
      }

      // Clean up
      pdf.destroy();

      self.postMessage({
        type: 'COMPLETE',
        jobId,
        data: { thumbnails: thumbnails.filter(r => r.success) }
      });

    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      jobId,
      data: { error: error.message }
    });
  }
};
