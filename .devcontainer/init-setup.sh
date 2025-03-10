#!/usr/bin/env bash
set -e

# =============================================================================
# Dev Container Initialization Script (init-setup.sh)
#
# This script runs when the Dev Container starts and provides guidance on
# how to interact with the project. It prints an ASCII logo, displays the
# current user, changes to the project root, and then shows helpful command
# instructions.
#
# Instructions for future developers:
#
# - To start the application, use:
#     ./gradlew bootRun --no-daemon -Dspring-boot.run.fork=true -Dserver.address=0.0.0.0
#
# - To run tests, use:
#     ./gradlew test
#
# - To build the project, use:
#     ./gradlew build
#
# - For running pre-commit hooks (if configured), use:
#     pre-commit run --all-files
#
# Make sure you are in the project root directory after this script executes.
# =============================================================================

echo "Devcontainer started successfully!"

VERSION=$(grep "^version =" build.gradle | awk -F'"' '{print $2}')
GRADLE_VERSION=$(gradle -version | grep "^Gradle " | awk '{print $2}')
GRADLE_PATH=$(which gradle)
JAVA_VERSION=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}')
JAVA_PATH=$(which java)

echo """
 ____ _____ ___ ____  _     ___ _   _  ____       ____  ____  _____
/ ___|_   _|_ _|  _ \| |   |_ _| \ | |/ ___|     |  _ \|  _ \|  ___|
\___ \ | |  | || |_) | |    | ||  \| | |  _ _____| |_) | | | | |_
 ___) || |  | ||  _ <| |___ | || |\  | |_| |_____|  __/| |_| |  _|
|____/ |_| |___|_| \_\_____|___|_| \_|\____|     |_|   |____/|_|
"""
echo -e "Stirling-PDF Version: \e[32m$VERSION\e[0m"
echo -e "Gradle Version: \e[32m$GRADLE_VERSION\e[0m"
echo -e "Gradle Path: \e[32m$GRADLE_PATH\e[0m"
echo -e "Java Version: \e[32m$JAVA_VERSION\e[0m"
echo -e "Java Path: \e[32m$JAVA_PATH\e[0m"

# Display current active user (for permission/debugging purposes)
echo -e "Current user: \e[32m$(whoami)\e[0m"

# Change directory to the project root (parent directory of the script)
cd "$(dirname "$0")/.."
echo -e "Changed to project root: \e[32m$(pwd)\e[0m"

# Display available commands for developers
echo "=================================================================="
echo "Available commands:"
echo ""
echo "  To start unoserver: "
echo -e "\e[34m    nohup /opt/venv/bin/unoserver --port 2003 --interface 0.0.0.0 > /tmp/unoserver.log 2>&1 &\e[0m"
echo
echo "  To start the application: "
echo -e "\e[34m    gradle bootRun\e[0m"
echo ""
echo "  To run tests: "
echo -e "\e[34m    gradle test\e[0m"
echo ""
echo "  To build the project: "
echo -e "\e[34m    gradle build\e[0m"
echo ""
echo "  To run pre-commit hooks (if configured):"
echo -e "\e[34m    pre-commit run --all-files -c .pre-commit-config.yaml\e[0m"
echo "=================================================================="
