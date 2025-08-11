// Web Worker for parallel thumbnail generation
console.log('🔧 Thumbnail worker starting up...');

let pdfJsLoaded = false;

// Import PDF.js properly for worker context
try {
  console.log('📦 Loading PDF.js locally...');
  importScripts('/pdf.js');

  // PDF.js exports to globalThis, check both self and globalThis
  const pdfjsLib = self.pdfjsLib || globalThis.pdfjsLib;
  
  if (pdfjsLib) {
    // Make it available on self for consistency
    self.pdfjsLib = pdfjsLib;
    
    // Set up PDF.js worker
    self.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';
    pdfJsLoaded = true;
    console.log('✓ PDF.js loaded successfully from local files');
    console.log('✓ PDF.js version:', self.pdfjsLib.version || 'unknown');
  } else {
    throw new Error('pdfjsLib not available after import - neither self.pdfjsLib nor globalThis.pdfjsLib found');
  }
} catch (error) {
  console.error('✗ Failed to load local PDF.js:', error.message || error);
  console.error('✗ Available globals:', Object.keys(self).filter(key => key.includes('pdf')));
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
      console.log('🏓 Worker PING received, checking PDF.js status...');
      
      // Check if PDF.js is loaded before responding
      if (pdfJsLoaded && self.pdfjsLib) {
        console.log('✓ Worker PONG - PDF.js ready');
        self.postMessage({ type: 'PONG', jobId });
      } else {
        console.error('✗ PDF.js not loaded - worker not ready');
        console.error('✗ pdfJsLoaded:', pdfJsLoaded);
        console.error('✗ self.pdfjsLib:', !!self.pdfjsLib);
        self.postMessage({
          type: 'ERROR',
          jobId,
          data: { error: 'PDF.js not loaded in worker' }
        });
      }
      return;
    }

    if (type === 'GENERATE_THUMBNAILS') {
      console.log('🖼️ Starting thumbnail generation for', data.pageNumbers.length, 'pages');

      if (!pdfJsLoaded || !self.pdfjsLib) {
        const error = 'PDF.js not available in worker';
        console.error('✗', error);
        throw new Error(error);
      }
      const { pdfArrayBuffer, pageNumbers, scale = 0.2, quality = 0.8 } = data;

      console.log('📄 Loading PDF document, size:', pdfArrayBuffer.byteLength, 'bytes');
      // Load PDF in worker using imported PDF.js
      const pdf = await self.pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
      console.log('✓ PDF loaded, total pages:', pdf.numPages);

      const thumbnails = [];

      // Process pages in smaller batches for smoother UI
      const batchSize = 3; // Process 3 pages at once for smoother UI
      for (let i = 0; i < pageNumbers.length; i += batchSize) {
        const batch = pageNumbers.slice(i, i + batchSize);

        const batchPromises = batch.map(async (pageNumber) => {
          try {
            console.log(`🎯 Processing page ${pageNumber}...`);
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale });
            console.log(`📐 Page ${pageNumber} viewport:`, viewport.width, 'x', viewport.height);

            // Create OffscreenCanvas for better performance
            const canvas = new OffscreenCanvas(viewport.width, viewport.height);
            const context = canvas.getContext('2d');

            if (!context) {
              throw new Error('Failed to get 2D context from OffscreenCanvas');
            }

            await page.render({ canvasContext: context, viewport }).promise;
            console.log(`✓ Page ${pageNumber} rendered`);

            // Convert to blob then to base64 (more efficient than toDataURL)
            const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            const thumbnail = `data:image/jpeg;base64,${base64}`;
            console.log(`✓ Page ${pageNumber} thumbnail generated (${base64.length} chars)`);

            return { pageNumber, thumbnail, success: true };
          } catch (error) {
            console.error(`✗ Failed to generate thumbnail for page ${pageNumber}:`, error.message || error);
            return { pageNumber, error: error.message || String(error), success: false };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        thumbnails.push(...batchResults);

        // Send progress update
        console.log(`📊 Worker: Sending progress update - ${thumbnails.length}/${pageNumbers.length} completed, ${batchResults.filter(r => r.success).length} new thumbnails`);
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
          console.log(`⏸️ Worker: Pausing 100ms before next batch (${i + batchSize}/${pageNumbers.length})`);
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
