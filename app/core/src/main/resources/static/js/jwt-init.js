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
        
        // Check if user is authenticated via cookie
        if (window.JWTManager.isAuthenticated()) {
            console.log('User is authenticated with JWT cookie');
        } else {
            console.log('User is not authenticated');
            // Only redirect to login if we're not already on login/register pages
            const currentPath = window.location.pathname;
            const currentSearch = window.location.search;
            // Don't redirect if we're on logout page or already being logged out
            if (!currentPath.includes('/login') && 
                !currentPath.includes('/register') && 
                !currentPath.includes('/oauth') && 
                !currentPath.includes('/saml') &&
                !currentPath.includes('/error') &&
                !currentSearch.includes('logout=true')) {
                // Redirect to login after a short delay to allow other scripts to load
                setTimeout(() => {
                    window.location.href = '/login';
                }, 100);
            }
        }
    }

    // No form enhancement needed for cookie-based JWT
    // Cookies are automatically sent with form submissions
    function enhanceFormSubmissions() {
        // Cookie-based JWT is automatically included in form submissions
        // No additional processing needed
    }

    // Add logout functionality to logout buttons
    function enhanceLogoutButtons() {
        document.addEventListener('click', function(event) {
            const element = event.target;
            
            // Check if clicked element is a logout button/link
            if (element.matches('a[href="/logout"], button[data-action="logout"], .logout-btn')) {
                event.preventDefault();
                window.JWTManager.logout();
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeJWT();
            enhanceLogoutButtons();
        });
    } else {
        initializeJWT();
        enhanceLogoutButtons();
    }

    // Handle page visibility changes to check token expiration
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && !window.JWTManager.isAuthenticated()) {
            // Token expired while page was hidden, redirect to login
            const currentPath = window.location.pathname;
            if (!currentPath.includes('/login') && 
                !currentPath.includes('/register') && 
                !currentPath.includes('/oauth') && 
                !currentPath.includes('/saml')) {
                window.location.href = '/login';
            }
        }
    });
})();