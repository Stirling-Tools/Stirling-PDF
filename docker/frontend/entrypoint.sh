#!/bin/sh

# Set default backend URL if not provided
VITE_API_BASE_URL=${VITE_API_BASE_URL:-"http://backend:8080"}

# Replace the placeholder in nginx.conf with the actual backend URL
sed -i "s|\${VITE_API_BASE_URL}|${VITE_API_BASE_URL}|g" /etc/nginx/nginx.conf

# Inject runtime configuration into config.js
cat > /usr/share/nginx/html/config.js << EOF
// Runtime configuration - injected at container startup
window.runtimeConfig = {
  apiBaseUrl: '${VITE_API_BASE_URL}'
};
EOF

# Start nginx
exec nginx -g "daemon off;"