/**
 * Queue Status JS
 * Simple queue position indicator with continuous polling
 */

class QueueStatusTracker {
    constructor() {
        this.activeTaskIds = new Map();
        this.basePollingInterval = 5000; // 5 seconds between polls by default
        this.pollingTimeoutId = null;
        this.initialized = false;
        this.isPolling = false;
        this.maxDisplayTime = 20 * 60 * 1000; // 20 minutes max display time
        this.initialDelayMs = 1000; // 1 second delay before showing position
        this.apiErrorCount = 0; // Track consecutive API errors
        this.lastQueuePosition = 0; // Track last known queue position
        console.log('[QueueStatusTracker] Constructor called');
    }
    
    /**
     * Calculate polling interval based on queue position
     * - Position <= 5: Poll every 3 seconds
     * - Position <= 20: Poll every 5 seconds
     * - Position > 20: Poll every 10 seconds
     * @param {number} position Current queue position
     * @returns {number} Polling interval in milliseconds
     */
    getPollingInterval(position) {
        if (position <= 5) {
            return 3000; // 3 seconds for closer positions
        } else if (position <= 20) {
            return 5000; // 5 seconds for medium distance
        } else {
            return 10000; // 10 seconds for far positions
        }
    }

    /**
     * Initialize the queue status tracker
     */
    init() {
        if (this.initialized) return;
        this.initialized = true;

        console.log('[QueueStatusTracker] Initializing queue tracker');

        // Add CSS to head
        const style = document.createElement('style');
        style.textContent = `
            .queue-status-container {
                margin-top: 20px;
                width: 100%;
                font-family: sans-serif;
            }
            .queue-position-info {
                background-color: var(--md-sys-color-surface-container, #fff);
                border: 1px solid var(--md-sys-color-outline-variant, #ddd);
                border-radius: 5px;
                box-shadow: var(--md-sys-elevation-1, 0 2px 5px rgba(0,0,0,0.15));
                margin-top: 10px;
                padding: 12px;
                text-align: center;
                font-weight: bold;
                color: var(--md-sys-color-on-surface, #000);
                border-left: 4px solid var(--md-sys-color-primary, #0060aa);
                animation: queue-status-fade-in 0.3s ease-in-out;
                transition: background-color 0.3s ease;
            }
            @keyframes queue-status-fade-in {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .queue-position-info.processing {
                background-color: var(--md-sys-color-primary-container, #d0e4ff);
            }
        `;
        document.head.appendChild(style);
        console.log('[QueueStatusTracker] Styles injected into <head>');
    }

    /**
     * Create container for queue status if it doesn't exist
     */
    ensureContainer() {
        // Find container or create it if not present
        let container = document.getElementById('queueStatusContainer');
        if (container) {
            console.log('[QueueStatusTracker] Found existing queue container');
            return container;
        }

        console.log('[QueueStatusTracker] Creating new queue container');
        container = document.createElement('div');
        container.id = 'queueStatusContainer';
        container.className = 'queue-status-container';
        container.style.display = 'none';

        // Try to insert after the form
        const form = document.querySelector('form[action="/api/v1/convert/file/pdf"]');
        if (form) {
            console.log('[QueueStatusTracker] Found form, inserting container after it');
            form.parentNode.insertBefore(container, form.nextSibling);
        } else {
            // Fall back to appending to body
            console.log('[QueueStatusTracker] No form found, appending to body');
            document.body.appendChild(container);
        }

        return container;
    }

    /**
     * Generate a unique client task ID
     */
    generateClientTaskId() {
        return 'client-' + Math.random().toString(36).substring(2, 11);
    }

    /**
     * Track a task with polling for status
     * @param {string} clientTaskId - Client-generated task ID
     */
    trackTask(clientTaskId) {
        console.log(`[QueueStatusTracker] Starting to track task: ${clientTaskId}`);
        this.init();

        // Initialize container and elements
        const container = this.ensureContainer();
        
        // Wait a short delay before showing anything
        setTimeout(() => {
            container.style.display = 'block';
            console.log('[QueueStatusTracker] Queue status container is now visible (after delay)');
            
            // Create or get the position info element
            let positionInfo = document.getElementById('queuePositionInfo');
            if (!positionInfo) {
                positionInfo = document.createElement('div');
                positionInfo.id = 'queuePositionInfo';
                positionInfo.className = 'queue-position-info';
                // Add message content with HTML
                // We'll use the global i18n variables defined in common.html
                const positionMessageTemplate = typeof queuePositionInQueue !== 'undefined' ? 
                    queuePositionInQueue : 'Position in queue: {0}';
                
                positionInfo.innerHTML = `<span id="queuePositionText">${positionMessageTemplate.replace('{0}', '<span id="queuePosition">...</span>')}</span>`;
                container.appendChild(positionInfo);
                console.log('[QueueStatusTracker] Created position info element');
            }
        }, this.initialDelayMs);
        
        // Store the task data
        this.activeTaskIds.set(clientTaskId, {
            clientId: clientTaskId,
            addedTime: Date.now(),
            position: 0, // Initialize with unknown position
            active: true
        });
        console.log(`[QueueStatusTracker] Added task ${clientTaskId} to active tasks`);

        // Start polling to get and update the queue position
        this.startPolling();
        
        // Set maximum display time
        setTimeout(() => {
            console.log(`[QueueStatusTracker] Maximum display time reached for ${clientTaskId}`);
            this.removeAllTasks();
        }, this.maxDisplayTime);
    }

    /**
     * Update the queue position by polling the server for only the specific client task
     */
    updateTotalQueuePosition() {
        console.log('[QueueStatusTracker] Updating queue position...');
        
        // If we don't have any active task IDs, there's nothing to track
        if (this.activeTaskIds.size === 0) {
            console.log('[QueueStatusTracker] No active tasks to track');
            return;
        }
        
        // Get the client ID of the first task (we only track one at a time)
        const clientId = this.activeTaskIds.keys().next().value;
        console.log(`[QueueStatusTracker] Fetching status for client task: ${clientId}`);
        
        // Fetch queue status for only this specific client task
        fetch(`/api/v1/queue/status/client/${clientId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to get queue status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('[QueueStatusTracker] Got client queue status:', data);
                
                // Reset error count on successful API call
                this.apiErrorCount = 0;
                
                // Determine which queue type to use based on the form that was submitted
                let queuePosition = 0;
                const lastSubmittedAction = localStorage.getItem('lastSubmittedFormAction');
                
                // Find the appropriate processor based on the form action
                if (data && Object.keys(data).length > 0) {
                    // Just use the position from the first (and likely only) process type returned
                    // The backend has already filtered to just the relevant processor
                    const firstProcessType = Object.keys(data)[0];
                    queuePosition = data[firstProcessType].queuedCount || 0;
                } else {
                    // If no data returned for our specific client task, assume it's being processed
                    queuePosition = 0;
                }
                
                console.log(`[QueueStatusTracker] Queue position for client task: ${queuePosition}`);
                
                // Update last known position
                this.lastQueuePosition = queuePosition;
                
                // If position is 0, it's being processed now, show the processing message
                if (queuePosition === 0) {
                    console.log('[QueueStatusTracker] Task is being processed (position 0), showing processing message');
                    
                    // Show processing message
                    const processingMessage = typeof queueProcessing !== 'undefined' ? 
                        queueProcessing : 'Processing your file...';
                    const positionTextElem = document.getElementById('queuePositionText');
                    const positionInfo = document.getElementById('queuePositionInfo');
                    
                    if (positionTextElem) {
                        positionTextElem.textContent = processingMessage;
                    }
                    
                    if (positionInfo) {
                        positionInfo.classList.add('processing');
                    }
                    
                    // After 5 seconds, show the "ready shortly" message
                    setTimeout(() => {
                        const readyMessage = typeof queueReadyShortly !== 'undefined' ? 
                            queueReadyShortly : 'Your file will be ready shortly';
                        if (positionTextElem) {
                            positionTextElem.textContent = readyMessage;
                        }
                        
                        // After another 5 seconds, hide the message
                        setTimeout(() => {
                            this.removeAllTasks();
                        }, 5000);
                    }, 5000);
                    
                    return;
                }
                
                // Update the UI with position in queue
                const positionElem = document.getElementById('queuePosition');
                
                if (positionElem) {
                    // Just update the position number
                    positionElem.textContent = queuePosition;
                }
                
                // Store position in the client task
                const taskData = this.activeTaskIds.get(clientId);
                if (taskData) {
                    taskData.position = queuePosition;
                }
            })
            .catch(error => {
                console.error('[QueueStatusTracker] Error getting queue status:', error);
                
                // If we've had more than 3 consecutive failures, remove the queue indicator
                this.apiErrorCount = (this.apiErrorCount || 0) + 1;
                if (this.apiErrorCount > 3) {
                    console.warn('[QueueStatusTracker] Too many API failures, removing queue indicator');
                    this.removeAllTasks();
                    return;
                }
                
                // Otherwise just keep the previous position display
                console.warn('[QueueStatusTracker] API error, keeping previous position display');
            });
    }

    /**
     * Remove all tasks and clean up
     */
    removeAllTasks() {
        console.log('[QueueStatusTracker] Removing all tasks');
        
        // Clear tasks map
        this.activeTaskIds.clear();
        
        // Stop polling
        this.stopPolling();
        
        // Hide container
        const container = document.getElementById('queueStatusContainer');
        if (container) {
            container.style.display = 'none';
            console.log('[QueueStatusTracker] Hidden queue status container');
        }
    }

    /**
     * Start polling for queue status
     */
    startPolling() {
        if (this.isPolling) {
            console.log('[QueueStatusTracker] Polling already active');
            return;
        }
        
        this.isPolling = true;
        console.log('[QueueStatusTracker] Starting polling');
        
        // Poll every few seconds
        const poll = () => {
            if (this.activeTaskIds.size === 0) {
                this.stopPolling();
                return;
            }
            
            // Update queue positions
            this.updateTotalQueuePosition();
            
            // Calculate polling interval based on position
            const interval = this.getPollingInterval(this.lastQueuePosition);
            
            // Schedule next poll with dynamic interval
            console.log(`[QueueStatusTracker] Next poll in ${interval/1000} seconds (position: ${this.lastQueuePosition})`);
            this.pollingTimeoutId = setTimeout(poll, interval);
        };
        
        // First poll after a short delay to allow the system to process the request
        setTimeout(() => {
            this.updateTotalQueuePosition();
            
            // Then start regular polling with initial base interval
            this.pollingTimeoutId = setTimeout(poll, this.basePollingInterval);
        }, this.initialDelayMs);
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (!this.isPolling) return;
        
        console.log('[QueueStatusTracker] Stopping polling');
        this.isPolling = false;
        
        if (this.pollingTimeoutId) {
            clearTimeout(this.pollingTimeoutId);
            this.pollingTimeoutId = null;
        }
    }
}

// Create global instance
const queueStatusTracker = new QueueStatusTracker();
console.log('[QueueStatusTracker] Global instance created');

// Add submit event handler to show queue position when form is submitted
document.addEventListener('submit', function(event) {
    const form = event.target;
    
    // Check if this is a conversion or processing form
    // We need to track more API endpoints that might use the queue
    if (form && (
        // Main API categories
        form.action.includes('/api/v1/convert') || 
        form.action.includes('/api/v1/file/pdf') ||
        form.action.includes('/api/v1/compress') ||
        form.action.includes('/api/v1/ocr') ||
        form.action.includes('/api/v1/extract') ||
        form.action.includes('/api/v1/misc') ||
        form.action.includes('/api/v1/pipeline') ||
        
        // HTML/PDF conversions
        form.action.includes('/api/v1/convert/html/pdf') ||
        form.action.includes('/api/v1/convert/pdf/html') ||
        
        // Image extraction
        form.action.includes('/api/v1/extract/image/scans') ||
        
        // URL and Markdown
        form.action.includes('/api/v1/convert/url/pdf') ||
        form.action.includes('/api/v1/convert/markdown/pdf') ||
        
        // Office conversions
        form.action.includes('/api/v1/convert/pdf/docx') ||
        form.action.includes('/api/v1/convert/pdf/doc') ||
        form.action.includes('/api/v1/convert/pdf/odt') ||
        form.action.includes('/api/v1/convert/pdf/ppt') ||
        form.action.includes('/api/v1/convert/pdf/pptx') ||
        form.action.includes('/api/v1/convert/pdf/odp') ||
        form.action.includes('/api/v1/convert/pdf/rtf') ||
        form.action.includes('/api/v1/convert/pdf/xml') ||
        form.action.includes('/api/v1/convert/pdf/pdfa') ||
        
        // Calibre conversions
        form.action.includes('/api/v1/convert/pdf/epub') ||
        form.action.includes('/api/v1/convert/pdf/mobi')
    )) {
        console.log('[QueueStatusTracker] Form submission detected:', form.action);
        
        // Store the form action for later use in determining queue type
        localStorage.setItem('lastSubmittedFormAction', form.action);
        
        // Generate a client task ID
        const clientTaskId = queueStatusTracker.generateClientTaskId();
        
        // Start tracking the task
        queueStatusTracker.trackTask(clientTaskId);
        console.log(`[QueueStatusTracker] Tracking form submission with ID: ${clientTaskId}`);
    }
});

console.log('[QueueStatusTracker] Form submit event listener installed');