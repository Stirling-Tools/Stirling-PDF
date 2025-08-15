// JWT Authentication Management Script
// This script handles cookie-based JWT authentication and page access control

(function() {
    // Clean up JWT token from URL parameters after OAuth/Login flows
    function cleanupTokenFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const hasToken = urlParams.get('jwt') || urlParams.get('token');
        if (hasToken) {
            // Clean up URL by removing token parameter
            // Token should now be set as cookie by server
            urlParams.delete('jwt');
            urlParams.delete('token');
            const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
            window.history.replaceState({}, '', newUrl);
        }
    }

    // Initialize JWT handling when page loads
    function initializeJWT() {
        // Clean up any JWT tokens from URL (OAuth flow)
        cleanupTokenFromUrl();

        // Authentication is handled server-side
        // If user is not authenticated, server will redirect to login
        console.log('JWT initialization complete - authentication handled server-side');
    }

    // No form enhancement needed for cookie-based JWT
    // Cookies are automatically sent with form submissions
    function enhanceFormSubmissions() {
        // Cookie-based JWT is automatically included in form submissions
        // No additional processing needed
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeJWT();
        });
    } else {
        initializeJWT();
    }
})();
