#!/usr/bin/env bash
# Signs the macOS native libraries packed inside the backend jars in <libs dir>
# with a Developer ID, because notarization rejects any unsigned binary in the
# app, even one inside a jar. JavaCPP (Tesseract, Leptonica) publishes its
# dylibs unsigned, in nested jars named *-macosx-*.jar; JPDFium's arrive signed
# and are left alone. Nested jars go back uncompressed, as Spring Boot requires.
#
# Usage: sign-jar-natives-mac.sh <libs dir> <signing identity>
set -euo pipefail

libs_dir=${1:?libs directory required}
identity=${2:?signing identity required}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

for boot_jar in "$libs_dir"/*.jar; do
  boot_jar="$(cd "$(dirname "$boot_jar")" && pwd)/$(basename "$boot_jar")"
  nested=$(unzip -Z1 "$boot_jar" 'BOOT-INF/lib/*-macosx-*.jar' 2>/dev/null || true)
  for entry in $nested; do
    rm -rf "${work:?}"/*
    (cd "$work" && unzip -q "$boot_jar" "$entry")
    mkdir "$work/unpacked"
    (cd "$work/unpacked" && unzip -q "../$entry")
    dylibs=$(cd "$work/unpacked" && find . -type f -name '*.dylib' | sed 's#^\./##')
    [ -n "$dylibs" ] || continue
    for lib in $dylibs; do
      codesign --force --timestamp --options runtime --sign "$identity" "$work/unpacked/$lib"
    done
    # shellcheck disable=SC2086 # one path per word; JavaCPP paths have no spaces
    (cd "$work/unpacked" && zip -q "../$entry" $dylibs)
    (cd "$work" && zip -q -0 "$boot_jar" "$entry")
    echo "Signed $(echo "$dylibs" | wc -l | tr -d ' ') libraries in $entry"
  done
done
