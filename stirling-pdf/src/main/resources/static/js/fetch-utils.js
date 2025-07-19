// JWT Management Utility
window.JWTManager = {
    JWT_STORAGE_KEY: 'stirling_jwt',
    
    // Store JWT token in localStorage
    storeToken: function(token) {
        if (token) {
            localStorage.setItem(this.JWT_STORAGE_KEY, token);
        }
    },
    
    // Get JWT token from localStorage
    getToken: function() {
        return localStorage.getItem(this.JWT_STORAGE_KEY);
    },
    
    // Remove JWT token from localStorage
    removeToken: function() {
        localStorage.removeItem(this.JWT_STORAGE_KEY);
    },
    
    // Extract JWT from Authorization header in response
    extractTokenFromResponse: function(response) {
        const authHeader = response.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7); // Remove 'Bearer ' prefix
            this.storeToken(token);
            return token;
        }
        return null;
    },
    
    // Check if user is authenticated (has valid JWT)
    isAuthenticated: function() {
        const token = this.getToken();
        if (!token) return false;
        
        try {
            // Basic JWT expiration check (decode payload)
            const payload = JSON.parse(atob(token.split('.')[1]));
            const now = Date.now() / 1000;
            return payload.exp > now;
        } catch (error) {
            console.warn('Invalid JWT token:', error);
            this.removeToken();
            return false;
        }
    },
    
    // Logout - remove token and redirect to login
    logout: function() {
        this.removeToken();
        
        // Clear all possible token storage locations
        localStorage.removeItem(this.JWT_STORAGE_KEY);
        sessionStorage.removeItem(this.JWT_STORAGE_KEY);
        
        // Clear JWT cookie manually (fallback)
        document.cookie = 'STIRLING_JWT=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure';
        
        // Perform logout request to clear server-side session
        fetch('/logout', {
            method: 'POST',
            credentials: 'include'
        }).then(() => {
            window.location.href = '/login';
        }).catch(() => {
            // Even if logout fails, redirect to login
            window.location.href = '/login';
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

    // Add JWT token to Authorization header if available
    const jwtToken = window.JWTManager.getToken();
    if (jwtToken) {
        fetchOptions.headers['Authorization'] = `Bearer ${jwtToken}`;
        // Include credentials when JWT is enabled
        fetchOptions.credentials = 'include';
    }

    // Make the request
    const response = await fetch(url, fetchOptions);
    
    // Extract JWT from response if present
    window.JWTManager.extractTokenFromResponse(response);
    
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
