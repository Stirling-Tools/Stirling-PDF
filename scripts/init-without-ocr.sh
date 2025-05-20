#!/bin/bash

export JAVA_TOOL_OPTIONS="${JAVA_BASE_OPTS} ${JAVA_CUSTOM_OPTS}"
echo "running with JAVA_TOOL_OPTIONS ${JAVA_BASE_OPTS} ${JAVA_CUSTOM_OPTS}"

# Detect if we're running as root (UID 0)
RUNNING_AS_ROOT=false
if [ "$(id -u)" -eq 0 ]; then
    RUNNING_AS_ROOT=true
    echo "Running container as root, will attempt to drop privileges"
fi

# Only attempt user/group modifications if running as root
if [ "$RUNNING_AS_ROOT" = true ]; then
    # Update the user and group IDs as per environment variables
    if [ ! -z "$PUID" ] && [ "$PUID" != "$(id -u stirlingpdfuser)" ]; then
        usermod -o -u "$PUID" stirlingpdfuser || echo "[WARN] Failed to update UID for stirlingpdfuser"
    fi

    if [ ! -z "$PGID" ] && [ "$PGID" != "$(getent group stirlingpdfgroup | cut -d: -f3)" ]; then
        groupmod -o -g "$PGID" stirlingpdfgroup || echo "[WARN] Failed to update GID for stirlingpdfgroup"
    fi
fi

# Apply umask in either case
umask "$UMASK" || true


# Skip download for fat Docker (already has security jar)
if [[ "$FAT_DOCKER" != "true" && "$RUNNING_AS_ROOT" = true ]]; then
  echo "Downloading security JAR (not necessary in fat Docker image)..."
  /scripts/download-security-jar.sh
elif [[ "$FAT_DOCKER" != "true" && "$RUNNING_AS_ROOT" != true ]]; then
  echo "[INFO] Skipping security JAR download in rootless mode"
fi

# Handle font installation
if [[ -n "$LANGS" && "$RUNNING_AS_ROOT" = true ]]; then
  echo "Installing fonts for languages: $LANGS"
  /scripts/installFonts.sh $LANGS
elif [[ -n "$LANGS" && "$RUNNING_AS_ROOT" != true ]]; then
  echo "[INFO] Skipping font installation in rootless mode"
fi

# Directory list we need to ensure are accessible
DIRS_TO_CHECK="$HOME /logs /scripts /usr/share/fonts/opentype/noto /configs /customFiles /customFiles/signatures /customFiles/templates /pipeline /pipeline/watchedFolders /pipeline/finishedFolders /usr/share/tessdata /tmp /tmp/stirling-pdf"
FILES_TO_CHECK="/app.jar"

# Skip copying tessdata files in rootless mode to avoid the error message
if [ "$RUNNING_AS_ROOT" = true ]; then
    # We're running as root, so try to copy tessdata files if they exist
    if [ -d "/usr/share/tessdata-original" ]; then
        echo "Copying original files without overwriting existing files"
        cp -n /usr/share/tessdata-original/* /usr/share/tessdata/ 2>/dev/null || true
    fi
    
    echo "Setting permissions and ownership for necessary directories..."
    # Attempt to change ownership of directories and files if running as root
    if chown -R stirlingpdfuser:stirlingpdfgroup $DIRS_TO_CHECK $FILES_TO_CHECK; then
        chmod -R 755 $DIRS_TO_CHECK $FILES_TO_CHECK || echo "[WARN] Failed to set directory permissions, but continuing"
        # If chown succeeds, execute the command as stirlingpdfuser
        echo "Running as stirlingpdfuser"
        exec su-exec stirlingpdfuser "$@"
    else
        # If chown fails, still try to make files accessible
        echo "[WARN] Chown failed, but will attempt to make files world-accessible"
        chmod -R 1777 /logs /configs /customFiles /pipeline || true
        echo "[WARN] Running as root user - could not drop privileges"
        exec "$@"
    fi
else
    # Already running as non-root (rootless mode)
    echo "Running in rootless mode"
    
    # In rootless mode, we'll only check critical paths that must be writable
    CRITICAL_DIRS="/configs /logs /customFiles /customFiles/signatures /customFiles/templates /pipeline/watchedFolders /pipeline/finishedFolders"
    
    for DIR in $CRITICAL_DIRS; do
        if [ -d "$DIR" ] && [ ! -w "$DIR" ]; then
            echo "[WARN] Cannot write to $DIR in rootless mode. Some functionality may be limited."
        fi
    done
    
    # Just execute the command as the current user
    echo "Executing as current user (UID: $(id -u))"
    exec "$@"
fi
