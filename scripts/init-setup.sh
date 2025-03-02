#!/bin/bash
set -e

whoami

cd "$(dirname "$0")/.."

./gradlew bootRun
