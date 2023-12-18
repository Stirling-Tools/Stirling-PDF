#!/bin/sh

/scripts/download-security-jar.sh

# Run the main command
exec "$@"