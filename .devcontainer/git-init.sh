#!/usr/bin/env bash
# .devcontainer/git-init.sh

echo "git config --global --get user.name"
git config --global --get user.name

echo "git config --get user.name"
git config --get user.name

# Falls die globale Konfiguration verfügbar ist, diese auslesen; sonst Default-Werte setzen
GIT_USER=$(git config --get user.name || echo "Dein Name")
GIT_EMAIL=$(git config --get user.email || echo "deine.email@example.com")

git config --local user.name "$GIT_USER"
git config --local user.email "$GIT_EMAIL"

git config --local --add safe.directory /workspace
git config --local core.hooksPath /workspace/hooks
