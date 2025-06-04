/**
 * Camera handling module for the mobile scanner
 */
import Logger from './logger.js';
import PeerConnection from './peer-connection.js';

const Camera = {
    stream: null,
    capturedImageData: null,
    capturedImages: [],
    
    /**
     * Initialize the camera and file upload on mobile device
     */
    init: function() {
        // Initialize camera
        this.initCamera();
        
        // Set up tab switching
        this.setupTabs();
        
        // Set up file upload handling
        this.setupFileUpload();
    },
    
    /**
     * Initialize the camera
     */
    initCamera: function() {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
            .then(stream => {
                this.stream = stream;
                // Camera stream started
                document.getElementById('camera-view').srcObject = stream;
                this.setupCameraControls();
            })
            .catch((err) => {
                console.error("Camera error:", err);
                document.getElementById('camera-error').style.display = 'flex';
                Logger.showError("Camera access denied or unavailable");
                
                // Automatically switch to file upload if camera fails
                this.switchToFileUpload();
            });
    },
    
    /**
     * Set up tab switching between camera and file upload
     */
    setupTabs: function() {
        const cameraTab = document.getElementById('camera-tab');
        const fileTab = document.getElementById('file-tab');
        
        if (cameraTab && fileTab) {
            cameraTab.addEventListener('click', () => this.switchToCamera());
            fileTab.addEventListener('click', () => this.switchToFileUpload());
        }
    },
    
    /**
     * Switch to camera view
     */
    switchToCamera: function() {
        document.getElementById('camera-tab').classList.add('active');
        document.getElementById('file-tab').classList.remove('active');
        document.getElementById('camera-container').style.display = 'flex';
        document.getElementById('file-container').style.display = 'none';
    },
    
    /**
     * Switch to file upload view
     */
    switchToFileUpload: function() {
        document.getElementById('file-tab').classList.add('active');
        document.getElementById('camera-tab').classList.remove('active');
        document.getElementById('file-container').style.display = 'flex';
        document.getElementById('camera-container').style.display = 'none';
    },
    
    /**
     * Set up event listeners for camera controls
     */
    setupCameraControls: function() {
        const captureBtn = document.getElementById('capture-button');
        if (captureBtn) {
            captureBtn.onclick = () => this.captureImage();
        }
        
        const uploadBtn = document.getElementById('upload-button');
        if (uploadBtn) {
            uploadBtn.onclick = () => this.uploadImage();
        } else {
            console.warn('Upload button not found');
        }
        
        const retakeBtn = document.getElementById('retake-button');
        if (retakeBtn) {
            retakeBtn.onclick = () => this.retakeImage();
        }
        
        // Add batch-related controls
        const addToBatchBtn = document.getElementById('add-to-batch-btn');
        if (addToBatchBtn) {
            addToBatchBtn.onclick = () => this.addToBatch();
        }
        
        const uploadBatchBtn = document.getElementById('upload-batch-btn');
        if (uploadBatchBtn) {
            uploadBatchBtn.onclick = () => this.uploadBatch();
        }
        
        const clearBatchBtn = document.getElementById('clear-batch-btn');
        if (clearBatchBtn) {
            clearBatchBtn.onclick = () => this.clearBatch();
        }
    },
    
    /**
     * Set up file upload functionality
     */
    setupFileUpload: function() {
        const fileInput = document.getElementById('file-input');
        const filePreview = document.getElementById('file-preview');
        const filePreviewContainer = document.getElementById('file-preview-container');
        const cancelFileBtn = document.getElementById('cancel-file-btn');
        const uploadFileBtn = document.getElementById('upload-file-btn');
        const addFileToBatchBtn = document.getElementById('add-file-to-batch-btn');
        
        if (fileInput) {
            fileInput.onchange = (e) => {
                const files = e.target.files;
                if (files.length > 0) {
                    // Handle multiple files if supported
                    if (files.length === 1) {
                        // Single file - show preview
                        const file = files[0];
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            filePreview.src = e.target.result;
                            this.capturedImageData = e.target.result;
                            filePreviewContainer.style.display = 'block';
                        };
                        reader.readAsDataURL(file);
                    } else {
                        // Multiple files - add all to batch
                        this.addFilesToBatch(files);
                        fileInput.value = ''; // Reset input
                    }
                }
            };
        }
        
        if (cancelFileBtn) {
            cancelFileBtn.onclick = () => {
                fileInput.value = '';
                filePreview.src = '';
                this.capturedImageData = null;
                filePreviewContainer.style.display = 'none';
            };
        }
        
        if (uploadFileBtn) {
            uploadFileBtn.onclick = () => {
                if (this.capturedImageData) {
                    this.uploadImage();
                } else {
                    Logger.showError("No image selected. Please select an image first.");
                }
            };
        }
        
        if (addFileToBatchBtn) {
            addFileToBatchBtn.onclick = () => {
                if (this.capturedImageData) {
                    // Add current file to batch
                    this.addFileToBatch();
                } else {
                    Logger.showError("No image selected. Please select an image first.");
                }
            };
        }
    },
    
    /**
     * Add current file to batch
     */
    addFileToBatch: function() {
        if (!this.capturedImageData) {
            Logger.showError("No image selected. Please select an image first.");
            return;
        }
        
        // Add current image to the batch
        this.capturedImages.push(this.capturedImageData);
        
        // Update batch counter
        this.updateBatchCounter();
        
        // Add thumbnail to batch preview
        this.addThumbnail(this.capturedImageData);
        
        // Show batch preview if it's the first image
        if (this.capturedImages.length === 1) {
            document.getElementById('batch-preview').classList.add('active');
        }
        
        // Reset file input and preview
        const fileInput = document.getElementById('file-input');
        const filePreview = document.getElementById('file-preview');
        const filePreviewContainer = document.getElementById('file-preview-container');
        
        if (fileInput) fileInput.value = '';
        if (filePreview) filePreview.src = '';
        if (filePreviewContainer) filePreviewContainer.style.display = 'none';
        
        this.capturedImageData = null;
    },
    
    /**
     * Add multiple files to batch
     * @param {FileList} files - List of files to add
     */
    addFilesToBatch: function(files) {
        if (!files || files.length === 0) return;
        
        // Show loading indicator
        const loadingMessage = document.createElement('div');
        loadingMessage.className = 'loading-message';
        loadingMessage.textContent = 'Processing files...';
        document.body.appendChild(loadingMessage);
        
        // Process each file
        let processed = 0;
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Add to batch
                this.capturedImages.push(e.target.result);
                this.addThumbnail(e.target.result);
                
                processed++;
                if (processed === files.length) {
                    // All files processed
                    document.body.removeChild(loadingMessage);
                    
                    // Update counter and show batch
                    this.updateBatchCounter();
                    document.getElementById('batch-preview').classList.add('active');
                }
            };
            reader.readAsDataURL(file);
        });
    },
    
    /**
     * Capture an image from the camera
     */
    captureImage: function() {
        // Capture button clicked
        
        const canvas = document.createElement('canvas');
        const video = document.getElementById('camera-view');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        
        this.capturedImageData = canvas.toDataURL('image/jpeg', 0.9);
        document.getElementById('capture-preview').src = this.capturedImageData;
        
        document.querySelector('.container').style.display = 'none';
        document.getElementById('review-container').style.display = 'flex';
        
        // Image captured
    },
    
    /**
     * Add the current image to the batch
     */
    addToBatch: function() {
        if (!this.capturedImageData) {
            Logger.showError("No image captured. Please take a picture first.");
            return;
        }
        
        // Add current image to the batch
        this.capturedImages.push(this.capturedImageData);
        
        // Update batch counter
        this.updateBatchCounter();
        
        // Add thumbnail to batch preview
        this.addThumbnail(this.capturedImageData);
        
        // Show batch preview if it's the first image
        if (this.capturedImages.length === 1) {
            document.getElementById('batch-preview').classList.add('active');
        }
        
        // Return to camera view
        this.retakeImage();
    },
    
    /**
     * Update the batch counter
     */
    updateBatchCounter: function() {
        const counter = document.getElementById('batch-counter');
        const count = this.capturedImages.length;
        counter.textContent = count + (count === 1 ? ' image' : ' images');
    },
    
    /**
     * Add a thumbnail to the batch preview
     * @param {string} dataUrl - Image data URL
     */
    addThumbnail: function(dataUrl) {
        const container = document.getElementById('batch-thumbnails');
        const index = this.capturedImages.length - 1;
        
        const thumbnail = document.createElement('div');
        thumbnail.className = 'batch-thumbnail';
        thumbnail.dataset.index = index;
        
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'Thumbnail';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-thumbnail';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeFromBatch(index);
        };
        
        thumbnail.appendChild(img);
        thumbnail.appendChild(removeBtn);
        container.appendChild(thumbnail);
    },
    
    /**
     * Remove an image from the batch
     * @param {number} index - Index of the image to remove
     */
    removeFromBatch: function(index) {
        // Remove from array
        this.capturedImages.splice(index, 1);
        
        // Update batch counter
        this.updateBatchCounter();
        
        // Refresh thumbnails
        this.refreshThumbnails();
        
        // Hide batch preview if no images left
        if (this.capturedImages.length === 0) {
            document.getElementById('batch-preview').classList.remove('active');
        }
    },
    
    /**
     * Clear all images from the batch
     */
    clearBatch: function() {
        this.capturedImages = [];
        this.updateBatchCounter();
        document.getElementById('batch-thumbnails').innerHTML = '';
        document.getElementById('batch-preview').classList.remove('active');
    },
    
    /**
     * Refresh all thumbnails in the batch preview
     */
    refreshThumbnails: function() {
        const container = document.getElementById('batch-thumbnails');
        container.innerHTML = '';
        
        this.capturedImages.forEach((dataUrl, index) => {
            this.addThumbnail(dataUrl);
        });
    },
    
    /**
     * Upload all captured images
     */
    uploadImage: function() {
        // Check if we have images in the batch or just the current preview
        if (this.capturedImages.length > 0) {
            // Upload all images in the batch
            this.uploadBatch();
        } else if (this.capturedImageData) {
            // Upload just the current image
            PeerConnection.sendImage(this.capturedImageData);
        } else {
            Logger.showError("No images captured. Please take pictures first.");
        }
    },
    
    /**
     * Upload all images in the batch
     */
    uploadBatch: function() {
        if (this.capturedImages.length === 0) {
            Logger.showError("Batch is empty. Please add images first.");
            return;
        }
        
        // Show spinner
        document.getElementById('spinner').style.display = 'flex';
        
        // Send each image sequentially
        const totalImages = this.capturedImages.length;
        let uploadedCount = 0;
        
        const sendNextImage = (index) => {
            if (index >= this.capturedImages.length) {
                // All images sent, send completion notification
                PeerConnection.connection.send({ type: 'batch-complete' });
                
                // Hide spinner and show success message
                setTimeout(() => {
                    document.getElementById('spinner').style.display = 'none';
                    document.getElementById('success-message').style.display = 'flex';
                    
                    // Close window after success
                    setTimeout(() => window.close(), 3000);
                }, 1000);
                
                return;
            }
            
            // Update spinner text
            const spinnerText = document.querySelector('.spinner-text');
            spinnerText.textContent = `Uploading ${index + 1}/${totalImages}`;
            
            // Send image
            const dataUrl = this.capturedImages[index];
            
            try {
                // Using the peer connection directly for more control
                if (PeerConnection.connection && PeerConnection.connection.open) {
                    PeerConnection.connection.send({ type: 'scan-image', data: dataUrl });
                    
                    // Wait a bit before sending next image to prevent overwhelming the connection
                    setTimeout(() => sendNextImage(index + 1), 500);
                } else {
                    // Connection not ready yet, set up connection first
                    PeerConnection.connection = PeerConnection.peer.connect(PeerConnection.sessionId, { reliable: true });
                    
                    PeerConnection.connection.on('open', () => {
                        PeerConnection.connection.send({ type: 'scan-image', data: dataUrl });
                        setTimeout(() => sendNextImage(index + 1), 500);
                    });
                    
                    PeerConnection.connection.on('error', (err) => {
                        console.error("Connection error:", err);
                        Logger.showError("Upload failed: " + (err.message || "unknown error"));
                        
                        // Try to continue with remaining images
                        setTimeout(() => sendNextImage(index + 1), 1000);
                    });
                }
            } catch (err) {
                console.error("Send error:", err);
                Logger.showError("Failed to send image: " + (err.message || "unknown error"));
                
                // Try to continue with remaining images
                setTimeout(() => sendNextImage(index + 1), 1000);
            }
        };
        
        // Start sending images
        sendNextImage(0);
    },
    
    /**
     * Switch back to camera view for retaking the image
     */
    retakeImage: function() {
        document.querySelector('.container').style.display = 'flex';
        document.getElementById('review-container').style.display = 'none';
        // Retake selected
    },
    
    /**
     * Stop the camera stream
     */
    stop: function() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }
};

export default Camera;