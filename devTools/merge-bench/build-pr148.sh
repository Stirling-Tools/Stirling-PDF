#!/bin/sh
# usage: build-pr148.sh <JPDFium checkout at feat/native-safe-domain with native/dist/linux-x64 built> <out dir>
# Builds the PR 148 jpdfium jar and linux-x64 natives jar inside a JDK container.
SRC=$1; OUT=$2
docker run --rm -v "$SRC:/src:ro" -v "$OUT:/out" eclipse-temurin:25-jdk sh -c '
  cp -r /src /tmp/j && cd /tmp/j && rm -rf jpdfium-natives/jpdfium-natives-linux-x64/build &&
  ./gradlew --no-daemon -q :jpdfium:jar :jpdfium-natives:jpdfium-natives-linux-x64:jar -x test &&
  cp jpdfium/build/libs/jpdfium-*.jar jpdfium-natives/jpdfium-natives-linux-x64/build/libs/*.jar /out/'
