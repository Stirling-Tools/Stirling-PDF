// Authentication utility for cookie-based JWT
window.JWTManager = {
    // Check if user is authenticated (simplified for cookie-based auth)
    isAuthenticated: function() {
        // With cookie-based JWT, we rely on server-side validation
        // This is a simplified check - actual authentication status is determined server-side
        return document.cookie.includes('stirling_jwt=');
    },
    
    // Logout - clear cookies and redirect to login
    logout: function() {
        
        // Clear JWT cookie manually (fallback)
        document.cookie = 'stirling_jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure';
        
        // Perform logout request to clear server-side session
        fetch('/logout', {
            method: 'POST',
            credentials: 'include'
        }).then(response => {
            if (response.redirected) {
                window.location.href = response.url;
            } else {
                window.location.href = '/login?logout=true';
            }
        }).catch(() => {
            // If logout fails, let server handle it
            window.location.href = '/logout';
        });
    }
};

window.fetchWithCsrf = async function(url, options = {}) {
    function getCsrfToken() {
        const cookieValue = document.cookie
            .split('; ')
            .find(row => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1];

        if (cookieValue) {
            return cookieValue;
        }
        const csrfElement = document.querySelector('input[name="_csrf"]');
        return csrfElement ? csrfElement.value : null;
    }

    // Create a new options object to avoid modifying the passed object
    const fetchOptions = { ...options };

    // Ensure headers object exists
    fetchOptions.headers = { ...options.headers };

    // Add CSRF token if available
    const csrfToken = getCsrfToken();
    if (csrfToken) {
        fetchOptions.headers['X-XSRF-TOKEN'] = csrfToken;
    }

    // Always include credentials to send JWT cookies
    fetchOptions.credentials = 'include';

    // Make the request
    const response = await fetch(url, fetchOptions);
    
    // Handle 401 responses (unauthorized)
    if (response.status === 401) {
        console.warn('Authentication failed, redirecting to login');
        window.JWTManager.logout();
        return response;
    }
    
    return response;
}

// Enhanced fetch function that always includes JWT
window.fetchWithJWT = async function(url, options = {}) {
    return window.fetchWithCsrf(url, options);
}
