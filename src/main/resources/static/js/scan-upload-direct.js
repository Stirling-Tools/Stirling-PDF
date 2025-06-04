/**
 * Backward compatibility script for scan-upload-direct.js
 * This loads the modular version
 */

// Add async script loading
function loadScript(src, async = true) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = async;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Load the modules asynchronously
async function loadModules() {
    try {
        console.info('Loading scan-upload modules via compatibility layer...');
        
        // If using type="module" is not supported, load individual scripts
        if (typeof window.initScanUploadPC !== 'function' && 
            typeof window.initScanUploadMobile !== 'function') {
            
            // Load the necessary scripts
            await loadScript('/js/scan-upload/logger.js', true);
            await loadScript('/js/scan-upload/peer-connection.js', true);
            await loadScript('/js/scan-upload/camera.js', true);
            await loadScript('/js/scan-upload/scan-upload.js', true);
            
            console.info('Modules loaded via compatibility layer');
        }
    } catch (error) {
        console.error('Error loading modules:', error);
        alert('Failed to load scan-upload modules. Please try refreshing the page.');
    }
}

// Load scripts on page load
document.addEventListener('DOMContentLoaded', loadModules);

// Forward function calls to the module implementations
window.initScanUploadPC = function() {
    if (typeof window.initScanUploadPC === 'function') {
        return window.initScanUploadPC();
    } else {
        console.error('ScanUpload module not loaded correctly');
    }
};

window.initScanUploadMobile = function() {
    if (typeof window.initScanUploadMobile === 'function') {
        return window.initScanUploadMobile();
    } else {
        console.error('ScanUpload module not loaded correctly');
    }
};

// Backward compatibility stubs
window.generateRandomId = function() { return 'xxxx-xxxx-xxxx-xxxx'.replace(/[x]/g, () => (Math.random() * 16 | 0).toString(16)); };
window.updateStatus = function(message) { console.log(message); };
window.showError = function(message) { alert("Upload Error: " + message); };
window.logDebug = function(message) { console.log("LOG:", message); };