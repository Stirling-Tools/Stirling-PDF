/**
 * Main scan upload module
 */
import Logger from './logger.js';
import PeerConnection from './peer-connection.js';
import Camera from './camera.js';
import ImageUtils from './image-utils.js';

/**
 * Initialize scan upload on PC/desktop
 */
function initScanUploadPC() {
    // Set as receiver (desktop)
    PeerConnection.init(PeerConnection.generateRandomId(), true);
    
    // Display session ID
    document.getElementById('session-id').textContent = PeerConnection.sessionId;
    
    // Generate QR code
    const qrcodeContainer = document.getElementById('qrcode');
    PeerConnection.generateQRCode(PeerConnection.sessionId, qrcodeContainer);
    
    // Set up buttons
    document.getElementById('new-scan-btn').onclick = resetConnection;
    document.getElementById('download-all-btn').onclick = downloadAllImages;
    
    // Desktop initialized
}

/**
 * Initialize scan upload on mobile
 */
function initScanUploadMobile() {
    // Initialize mobile app
    
    // Extract session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    
    if (!sessionId) {
        Logger.showError('Missing session ID in URL');
        return;
    }
    
    // Initialize peer connection (not as receiver)
    PeerConnection.init(PeerConnection.generateRandomId(), false);
    PeerConnection.sessionId = sessionId;
    
    // Initialize camera
    Camera.init();
    
    // Mobile initialized
}

/**
 * Reset the connection
 */
function resetConnection() {
    PeerConnection.reset();
    initScanUploadPC();
}

/**
 * Download all images as a ZIP
 */
function downloadAllImages() {
    const images = document.querySelectorAll('.gallery-image');
    if (images.length === 0) {
        alert('No images to download');
        return;
    }
    
    ImageUtils.downloadAllAsZip(images);
}

// Export functions for global use
window.initScanUploadPC = initScanUploadPC;
window.initScanUploadMobile = initScanUploadMobile;

// Initialize based on page load
document.addEventListener('DOMContentLoaded', () => {
    // This will be initialized from the HTML page based on which view is loaded
});