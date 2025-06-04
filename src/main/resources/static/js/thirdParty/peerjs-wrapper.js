/**
 * PeerJS Wrapper - Simple initialization helper
 */

// Check if PeerJS is loaded properly
if (typeof Peer === 'undefined') {
    console.error('PeerJS is not defined. Make sure peerjs.min.js is loaded before this script.');
} else {
    console.log('PeerJS loaded successfully, version:', Peer.version || 'unknown');
}

// Create a global connection manager
window.PeerManager = {
    createPeer: function(id, options) {
        try {
            // Default options with cloud server
            var defaultOptions = {};
            
            // Merge options
            var finalOptions = options ? Object.assign({}, defaultOptions, options) : defaultOptions;
            
            console.log('Creating PeerJS instance with ID:', id);
            return new Peer(id, finalOptions);
        } catch (err) {
            console.error('Error creating PeerJS instance:', err);
            
            // Return a dummy peer that won't crash the application
            return {
                id: id,
                on: function(event, callback) {
                    if (event === 'error') {
                        setTimeout(function() {
                            callback(new Error('Could not create PeerJS instance'));
                        }, 100);
                    }
                    return this;
                },
                connect: function() {
                    return {
                        on: function() { return this; },
                        send: function() {}
                    };
                },
                destroy: function() {}
            };
        }
    }
};

console.log('PeerJS wrapper initialized successfully');