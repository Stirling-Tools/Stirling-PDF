#!/bin/sh

# Set default backend URL if not provided
BACKEND_URL=${BACKEND_URL:-"http://backend:8080"}

# Replace the placeholder in nginx.conf with the actual backend URL
sed -i "s|\${BACKEND_URL}|${BACKEND_URL}|g" /etc/nginx/nginx.conf

# Start nginx
exec nginx -g "daemon off;"