#!/usr/bin/env bash
# Generate API client SDKs (Python, TypeScript/Node, Go) from SwaggerDoc.json.
# Build-time only: nothing here ships in any image. Output lands in clients/
# which is gitignored; publish steps live with each package registry.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPEC="$ROOT/SwaggerDoc.json"
GENERATOR_VERSION=7.24.0
JAR="$ROOT/build/openapi-generator-cli-$GENERATOR_VERSION.jar"
OUT="$ROOT/clients"

if [ ! -f "$SPEC" ]; then
    echo "SwaggerDoc.json missing - run 'task backend:swagger' first" >&2
    exit 1
fi

if [ ! -f "$JAR" ]; then
    mkdir -p "$ROOT/build"
    echo "Fetching openapi-generator-cli $GENERATOR_VERSION"
    curl -fsSL -o "$JAR" \
        "https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/$GENERATOR_VERSION/openapi-generator-cli-$GENERATOR_VERSION.jar"
fi

generate() {
    local generator="$1" out_dir="$2"; shift 2
    echo "Generating $generator -> $out_dir"
    java -jar "$JAR" generate -i "$SPEC" -g "$generator" -o "$OUT/$out_dir" \
        --skip-validate-spec "$@"
}

rm -rf "$OUT"
generate python python \
    --additional-properties=packageName=stirling_pdf_client,projectName=stirling-pdf-client
generate typescript-node node \
    --additional-properties=npmName=@stirling-pdf/client,supportsES6=true
generate go go \
    --additional-properties=packageName=stirlingpdf

echo "SDKs generated under clients/"
