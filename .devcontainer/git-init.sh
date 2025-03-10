#!/usr/bin/env bash

GIT_USER=$(git config --get user.name)
GIT_EMAIL=$(git config --get user.email)

# Exit if GIT_USER or GIT_EMAIL is empty
if [ -z "$GIT_USER" ] || [ -z "$GIT_EMAIL" ]; then
  echo "GIT_USER or GIT_EMAIL is not set. Exiting."
  exit 1
fi

git config --local user.name "$GIT_USER"
git config --local user.email "$GIT_EMAIL"

# This directory should contain custom Git hooks for the repository
# Set the path for Git hooks to /workspace/hooks
git config --local core.hooksPath '%(prefix)/workspace/hooks'
# Set the safe directory to the workspace path
git config --local --add safe.directory /workspace
