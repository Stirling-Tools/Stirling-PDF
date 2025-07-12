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

    return fetch(url, fetchOptions);
}
