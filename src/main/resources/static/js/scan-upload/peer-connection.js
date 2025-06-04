/**
 * WebRTC peer connection module for scan-upload functionality
 */
import Logger from './logger.js';

const PeerConnection = {
    peer: null,
    connection: null,
    sessionId: null,
    isReceiver: false,
    
    /**
     * Generate a random session ID
     * @returns {string} Random session ID
     */
    generateRandomId: function() {
        return 'xxxx-xxxx-xxxx-xxxx'.replace(/[x]/g, () => (Math.random() * 16 | 0).toString(16));
    },
    
    /**
     * Initialize a peer connection
     * @param {string} id - Peer ID
     * @param {boolean} isReceiver - Whether this peer is receiving images
     */
    init: function(id, isReceiver) {
        this.sessionId = id;
        this.isReceiver = isReceiver;
        
        this.peer = new Peer(id, {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'turn:numb.viagenie.ca', credential: 'muazkh', username: 'webrtc@live.com' },
                    { urls: 'turn:192.158.29.39:3478?transport=udp', credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=', username: '28224511:1379330808' },
                    { urls: 'turn:192.158.29.39:3478?transport=tcp', credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=', username: '28224511:1379330808' },
                    { urls: 'turn:turn.bistri.com:80', credential: 'homeo', username: 'homeo' },
                    { urls: 'turn:turn.anyfirewall.com:443?transport=tcp', credential: 'webrtc', username: 'webrtc' }
                ]
            },
            debug: 2
        });
        
        // Peer created
        
        this.setupEventListeners();
    },
    
    /**
     * Set up event listeners for the peer connection
     */
    setupEventListeners: function() {
        this.peer.on('disconnected', () => {
            console.warn("PeerJS disconnected");
            Logger.showError("Disconnected from PeerJS server");
        });
        
        this.peer.on('close', () => {
            console.log("PeerJS connection closed");
        });
        
        if (this.isReceiver) {
            this.peer.on('connection', conn => {
                this.connection = conn;
                // Receiver connected
                
                conn.on('data', data => {
                    if (data.type === 'scan-image') {
                        Logger.updateStatus('Scan received');
                        document.getElementById('qrcode-container').style.display = 'none';
                        
                        // Create new image container for each received image
                        this.addImageToGallery(data.data);
                        
                        document.querySelector('.scan-result-container').style.display = 'block';
                    }
                    else if (data.type === 'batch-complete') {
                        Logger.updateStatus('Batch upload complete');
                    }
                });
            });
        }
        
        this.peer.on('error', (err) => {
            console.error("PeerJS Error:", err);
            // PeerJS error occurred
            Logger.showError("PeerJS error: " + err.type + " - " + (err.message || "unknown"));
        });
    },
    
    /**
     * Send an image to the peer
     * @param {string} dataUrl - Image data URL
     * @param {boolean} closeAfterSend - Whether to close the window after sending (default: true)
     */
    sendImage: function(dataUrl, closeAfterSend = true) {
        // Attempt to send image
        
        if (!this.connection || !this.connection.open) {
            // Establishing connection to peer
            this.connection = this.peer.connect(this.sessionId, { reliable: true });
            
            let waited = 0;
            const pollInterval = setInterval(() => {
                if (this.connection.open) {
                    clearInterval(pollInterval);
                    return;
                }
                waited += 1000;
                if (waited >= 10000) {
                    clearInterval(pollInterval);
                    console.warn('Connection still not open after 10s. Forcing retry.');
                    Logger.showError('Connection failed after retry. Check network or switch to same Wi-Fi.');
                } else {
                    // Still waiting for connection
                }
            }, 1000);
            
            this.connection.on('open', () => {
                // Connection opened
                this.connection.send({ type: 'scan-image', data: dataUrl });
                
                // Only show success and close window if this is the final image
                if (closeAfterSend) {
                    document.getElementById('spinner').style.display = 'flex';
                    setTimeout(() => {
                        document.getElementById('spinner').style.display = 'none';
                        document.getElementById('success-message').style.display = 'flex';
                        setTimeout(() => window.close(), 3000);
                    }, 1000);
                }
            });
            
            this.connection.on('error', (err) => {
                clearInterval(pollInterval);
                console.error("Connection error:", err);
                // Connection error occurred
                Logger.showError("Upload failed: " + (err.message || "unknown error"));
            });
        } else {
            try {
                // Using existing connection
                this.connection.send({ type: 'scan-image', data: dataUrl });
                
                // Only show success and close window if this is the final image
                if (closeAfterSend) {
                    document.getElementById('spinner').style.display = 'flex';
                    setTimeout(() => {
                        document.getElementById('spinner').style.display = 'none';
                        document.getElementById('success-message').style.display = 'flex';
                        setTimeout(() => window.close(), 3000);
                    }, 1000);
                }
            } catch (err) {
                console.error("Send error:", err);
                // Send error occurred
                Logger.showError("Failed to send image: " + (err.message || "unknown error"));
            }
        }
    },
    
    /**
     * Reset the peer connection
     */
    reset: function() {
        if (this.peer) {
            this.peer.destroy();
        }
        this.connection = null;
    },
    
    /**
     * Generate a QR code with the session URL
     * @param {string} sessionId - Session ID
     * @param {HTMLElement} container - QR code container element
     */
    generateQRCode: function(sessionId, container) {
        const url = `${window.location.origin}/mobile?session=${sessionId}`;
        
        // Clear previous QR code if any
        container.innerHTML = '';
        
        new QRCode(container, {
            text: url,
            width: 256,
            height: 256,
            colorDark: "#000",
            colorLight: "#fff",
            correctLevel: QRCode.CorrectLevel.H
        });
        
        // Add link below QR code
        const a = document.createElement('a');
        a.href = url;
        a.textContent = url;
        a.style.color = '#0af';
        a.style.display = 'block';
        a.style.marginTop = '10px';
        container.appendChild(a);
    },
    
    /**
     * Add a new image to the gallery
     * @param {string} dataUrl - Image data URL
     */
    addImageToGallery: function(dataUrl) {
        const galleryContainer = document.getElementById('image-gallery');
        if (!galleryContainer) {
            console.error('Gallery container not found');
            return;
        }
        
        // Create a new card for the image
        const card = document.createElement('div');
        card.className = 'image-card';
        
        // Create image element
        const img = document.createElement('img');
        img.src = dataUrl;
        img.className = 'gallery-image';
        img.alt = 'Scanned Image';
        
        // Create download button
        const downloadBtn = document.createElement('a');
        downloadBtn.href = dataUrl;
        downloadBtn.className = 'btn btn-primary btn-sm image-action-btn';
        downloadBtn.textContent = 'Download';
        downloadBtn.download = `scan-${new Date().getTime()}.jpg`;
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm image-action-btn';
        deleteBtn.textContent = 'Remove';
        deleteBtn.onclick = function() {
            card.remove();
            
            // If all images are removed, hide the gallery
            if (galleryContainer.children.length === 0) {
                document.querySelector('.scan-result-container').style.display = 'none';
                document.getElementById('qrcode-container').style.display = 'block';
            }
        };
        
        // Create actions container
        const actions = document.createElement('div');
        actions.className = 'image-actions';
        actions.appendChild(downloadBtn);
        actions.appendChild(deleteBtn);
        
        // Add all elements to the card
        card.appendChild(img);
        card.appendChild(actions);
        
        // Add the card to the gallery
        galleryContainer.appendChild(card);
    }
};

export default PeerConnection;