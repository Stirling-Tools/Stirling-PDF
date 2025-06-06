document.addEventListener('DOMContentLoaded', function() {
    // Get CSRF token from cookie
    const getCsrfToken = () => {
        return document.cookie
            .split('; ')
            .find(row => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1];
    };

    // Function to decode the URI-encoded cookie value
    const decodeCsrfToken = (token) => {
        if (token) {
            return decodeURIComponent(token);
        }
        return null;
    };

    // Find all forms and add CSRF token
    const forms = document.querySelectorAll('form');
    const csrfToken = decodeCsrfToken(getCsrfToken());

    // Only proceed if we have a cookie-based token
    if (csrfToken) {
        forms.forEach(form => {
            // Only now remove existing CSRF input fields since we have a new token
            const existingCsrfInputs = form.querySelectorAll('input[name="_csrf"]');
            existingCsrfInputs.forEach(input => input.remove());

            // Create and add new CSRF input field
            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = '_csrf';
            csrfInput.value = csrfToken;
            form.appendChild(csrfInput);
        });
    }
});
