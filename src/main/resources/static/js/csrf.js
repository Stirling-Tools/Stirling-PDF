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
    forms.forEach(form => {
        // Remove any existing CSRF input fields
        const existingCsrfInputs = form.querySelectorAll('input[name="_csrf"]');
        existingCsrfInputs.forEach(input => input.remove());

        // Create and add new CSRF input field
        const csrfToken = decodeCsrfToken(getCsrfToken());
        if (csrfToken) {
            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = '_csrf';
            csrfInput.value = csrfToken;
            form.appendChild(csrfInput);
        }
    });
});