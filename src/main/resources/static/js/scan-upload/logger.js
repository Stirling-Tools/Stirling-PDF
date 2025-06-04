/**
 * Simplified logger module for the scan-upload functionality
 */
const Logger = {
    /**
     * Log a debug message to the console (disabled in production)
     * @param {string} message - Message to log
     */
    debug: function(message) {
        // Debug logging disabled
    },
    
    /**
     * Update status message in the UI
     * @param {string} message - Status message to display
     */
    updateStatus: function(message) {
        const el = document.getElementById('status-message');
        if (el) {
            el.textContent = message;
            el.style.display = message ? 'block' : 'none';
        }
    },
    
    /**
     * Show an error message
     * @param {string} message - Error message to display
     */
    showError: function(message) {
        this.updateStatus("Error: " + message);
        
        // Only show alerts for critical errors
        if (message.includes('failed') || message.includes('denied')) {
            alert("Upload Error: " + message);
        }
    }
};

export default Logger;