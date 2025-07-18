// JWT Initialization Script
// This script handles JWT token extraction during OAuth/Login flows and initializes the JWT manager

(function() {
    // Extract JWT token from URL parameters (for OAuth redirects)
    function extractTokenFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('jwt') || urlParams.get('token');
        if (token) {
            window.JWTManager.storeToken(token);
            // Clean up URL by removing token parameter
            urlParams.delete('jwt');
            urlParams.delete('token');
            const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
            window.history.replaceState({}, '', newUrl);
        }
    }

    // Extract JWT token from cookie on page load (fallback)
    function extractTokenFromCookie() {
        const cookieValue = document.cookie
            .split('; ')
            .find(row => row.startsWith('STIRLING_JWT='))
            ?.split('=')[1];
        
        if (cookieValue) {
            window.JWTManager.storeToken(cookieValue);
            // Clear the cookie since we're using localStorage with consistent SameSite policy
            document.cookie = 'STIRLING_JWT=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure';
        }
    }

    // Initialize JWT handling when page loads
    function initializeJWT() {
        // Try to extract token from URL first (OAuth flow)
        extractTokenFromUrl();
        
        // If no token in URL, try cookie (login flow)
        if (!window.JWTManager.getToken()) {
            extractTokenFromCookie();
        }
        
        // Check if user is authenticated
        if (window.JWTManager.isAuthenticated()) {
            console.log('User is authenticated with JWT');
        } else {
            console.log('User is not authenticated or token expired');
            // Only redirect to login if we're not already on login/register pages
            const currentPath = window.location.pathname;
            if (!currentPath.includes('/login') && 
                !currentPath.includes('/register') && 
                !currentPath.includes('/oauth') && 
                !currentPath.includes('/saml') &&
                !currentPath.includes('/error')) {
                // Redirect to login after a short delay to allow other scripts to load
                setTimeout(() => {
                    window.location.href = '/login';
                }, 100);
            }
        }
    }

    // Override form submissions to include JWT
    function enhanceFormSubmissions() {
        // Override form submit for login forms
        document.addEventListener('submit', function(event) {
            const form = event.target;
            
            // Add JWT to form data if available
            const jwtToken = window.JWTManager.getToken();
            if (jwtToken && form.method && form.method.toLowerCase() !== 'get') {
                // Create a hidden input for JWT
                const jwtInput = document.createElement('input');
                jwtInput.type = 'hidden';
                jwtInput.name = 'jwt';
                jwtInput.value = jwtToken;
                form.appendChild(jwtInput);
            }
        });
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
            enhanceFormSubmissions();
            enhanceLogoutButtons();
        });
    } else {
        initializeJWT();
        enhanceFormSubmissions();
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