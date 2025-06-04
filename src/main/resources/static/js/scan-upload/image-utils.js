/**
 * Utility functions for handling images in the scan upload feature
 */

const ImageUtils = {
    /**
     * Download all images as a ZIP file
     * @param {NodeList} images - Collection of image elements
     */
    downloadAllAsZip: function(images) {
        if (!images || images.length === 0) {
            console.warn('No images to download');
            return;
        }
        
        // Load JSZip dynamically
        const script = document.createElement('script');
        script.src = '/js/thirdParty/jszip.min.js';
        script.onload = () => {
            this.createZip(images);
        };
        script.onerror = () => {
            console.error('Failed to load JSZip');
            alert('Failed to load ZIP library. Please try downloading images individually.');
        };
        document.head.appendChild(script);
    },
    
    /**
     * Create ZIP file with images
     * @param {NodeList} images - Collection of image elements
     */
    createZip: function(images) {
        try {
            // JSZip is now loaded globally
            const zip = new JSZip();
            const timestamp = new Date().toISOString().slice(0, 10);
            
            // Add each image to the zip
            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                // Extract base64 data from data URL
                const dataUrl = img.src;
                const base64Data = dataUrl.split(',')[1];
                
                // Add to zip
                zip.file(`scan-${i+1}.jpg`, base64Data, {base64: true});
            }
            
            // Generate the zip file
            zip.generateAsync({type: 'blob'}).then((blob) => {
                // Create download link
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `scans-${timestamp}.zip`;
                
                // Trigger download
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
            
        } catch (error) {
            console.error('Error creating ZIP file:', error);
            alert('Failed to create ZIP file. Please try downloading images individually.');
        }
    },
    
    /**
     * Convert a data URL to a Blob
     * @param {string} url - Data URL
     * @returns {Promise<Blob>} - Promise resolving to a Blob
     */
    urlToBlob: function(url) {
        return fetch(url).then(response => response.blob());
    }
};

export default ImageUtils;