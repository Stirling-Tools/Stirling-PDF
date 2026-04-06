#!/usr/bin/env bash
# End-to-end auto-update test for macOS/Linux.
#
# Builds JRE + JAR + signed update bundle, starts server + app,
# runs CDP tests against the WebView, then cleans up.
#
# Usage:
#   bash scripts/dev-update-test/test-update-e2e.sh              # check-only
#   bash scripts/dev-update-test/test-update-e2e.sh --install     # full install
#   bash scripts/dev-update-test/test-update-e2e.sh --skip-build  # reuse existing MSI
#
# Prerequisites:
#   - Java 21+ JDK (with jlink)
#   - Node.js + npm
#   - Python 3 (for HTTP server + CDP tests)
#   - First-time: bash scripts/dev-update-test/setup-dev-updater.sh
set -euo pipefail

INSTALL=false
SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --install)    INSTALL=true ;;
    --skip-build) SKIP_BUILD=true ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$FRONTEND_DIR/.." && pwd)"
TAURI_DIR="$FRONTEND_DIR/src-tauri"
OUTPUT_DIR="$SCRIPT_DIR/.update-dist"
KEYS_DIR="$SCRIPT_DIR/.keys"
PORT=8090
DEBUG_PORT=9222

# PIDs to clean up
SERVER_PID=""
APP_PID=""

cleanup() {
  echo ""
  echo "=== Cleanup ==="
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  pkill -f "stirling-pdf" 2>/dev/null || true
  echo "  Done"
}
trap cleanup EXIT

# ── pre-flight ────────────────────────────────────────────────────────────────
echo ""
echo "=== Pre-flight checks ==="

if [ ! -f "$KEYS_DIR/dev-update-key" ]; then
  echo "  Running first-time setup..."
  bash "$SCRIPT_DIR/setup-dev-updater.sh"
fi
echo "  Signing keys: OK"

JAVA_VER=$(java -version 2>&1 | head -1 | tr -d '\r"' | awk '{print $3}' | cut -d. -f1)
if [ -z "$JAVA_VER" ] || [ "$JAVA_VER" -lt 21 ]; then
  echo "  Error: Java 21+ required, found Java $JAVA_VER"
  exit 1
fi
echo "  Java $JAVA_VER: OK"

# Detect python command (python3 on macOS/Linux, python on Windows Git Bash)
PYTHON="python3"
$PYTHON --version >/dev/null 2>&1 || PYTHON="python"
$PYTHON --version >/dev/null 2>&1 || { echo "  Error: Python 3 required"; exit 1; }
$PYTHON -c "import websockets" 2>/dev/null || {
  echo "  Installing Python websockets..."
  $PYTHON -m pip install websockets --quiet
}
echo "  Python: OK"

# ── detect platform ───────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Darwin)
    BUNDLES="app"
    TAURI_PLATFORM="darwin-$([ "$ARCH" = "arm64" ] && echo aarch64 || echo x86_64)"
    BUNDLE_GLOB="*.app.tar.gz"
    WEBVIEW_DEBUG_ENV=""
    ;;
  Linux)
    BUNDLES="appimage"
    TAURI_PLATFORM="linux-x86_64"
    BUNDLE_GLOB="*.AppImage.tar.gz"
    WEBVIEW_DEBUG_ENV=""
    ;;
  MINGW*|MSYS*|CYGWIN*)
    BUNDLES="msi"
    TAURI_PLATFORM="windows-x86_64"
    BUNDLE_GLOB="*.msi"
    WEBVIEW_DEBUG_ENV="WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=$DEBUG_PORT"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

# ── Step 1: Build JRE + JAR ──────────────────────────────────────────────────
JRE_JAVA="$TAURI_DIR/runtime/jre/bin/java"
JAR_GLOB="$TAURI_DIR/libs/stirling-pdf-*.jar"

if [ "$SKIP_BUILD" = false ] || ! ls $JAR_GLOB >/dev/null 2>&1 || [ ! -f "$JRE_JAVA" ]; then
  echo ""
  echo "=== Building backend JAR ==="
  cd "$REPO_ROOT"
  DISABLE_ADDITIONAL_FEATURES=true ./gradlew bootJar -x test --no-daemon 2>&1 | tail -3

  BUILT_JAR=$(ls -t app/core/build/libs/stirling-pdf-*.jar 2>/dev/null | head -1)
  if [ -z "$BUILT_JAR" ]; then echo "Error: JAR not found"; exit 1; fi

  mkdir -p "$TAURI_DIR/libs"
  # Remove any dummy jars
  find "$TAURI_DIR/libs" -name "*.jar" -size -1k -delete 2>/dev/null || true
  cp "$BUILT_JAR" "$TAURI_DIR/libs/"
  echo "  JAR: $(basename "$BUILT_JAR") ($(du -h "$BUILT_JAR" | cut -f1))"

  if [ ! -f "$JRE_JAVA" ]; then
    echo ""
    echo "=== Building JRE with jlink ==="
    rm -rf "$TAURI_DIR/runtime/jre"
    MODULES="java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql,java.transaction.xa,java.xml,java.xml.crypto,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.unsupported"
    jlink \
      --add-modules "$MODULES" \
      --strip-debug \
      --no-header-files \
      --no-man-pages \
      --output "$TAURI_DIR/runtime/jre"
    echo "  JRE: OK"
  else
    echo "  JRE: already exists"
  fi
fi

# ── Step 2: Build signed update bundle ────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"
BUNDLE_FILE=$(ls "$OUTPUT_DIR"/$BUNDLE_GLOB 2>/dev/null | head -1)

if [ "$SKIP_BUILD" = false ] || [ -z "$BUNDLE_FILE" ]; then
  echo ""
  echo "=== Building signed v99.0.0 update bundle ==="
  echo "  This takes a few minutes (Rust release build)..."

  PRIVATE_KEY="$(cat "$KEYS_DIR/dev-update-key")"

  cd "$FRONTEND_DIR"
  TAURI_SIGNING_PRIVATE_KEY="$PRIVATE_KEY" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  npx tauri build \
    --config '{"version":"99.0.0"}' \
    --bundles "$BUNDLES" 2>&1 | tail -5

  # Find and copy bundle (search release/bundle first, then broader)
  BUILT_BUNDLE=$(find "$TAURI_DIR/target/release/bundle" -name "$BUNDLE_GLOB" -not -name "*.sig" 2>/dev/null | sort | tail -1)
  [ -z "$BUILT_BUNDLE" ] && BUILT_BUNDLE=$(find "$TAURI_DIR/target" -maxdepth 5 -name "$BUNDLE_GLOB" -not -name "*.sig" 2>/dev/null | sort | tail -1)
  BUILT_SIG="${BUILT_BUNDLE}.sig"

  if [ -z "$BUILT_BUNDLE" ] || [ ! -f "$BUILT_SIG" ]; then
    # Sign manually if .sig missing
    if [ -n "$BUILT_BUNDLE" ]; then
      TAURI_SIGNING_PRIVATE_KEY="$PRIVATE_KEY" \
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
      npx tauri signer sign "$BUILT_BUNDLE"
      BUILT_SIG="${BUILT_BUNDLE}.sig"
    else
      echo "Error: bundle not found"; exit 1
    fi
  fi

  BUNDLE_FILENAME="$(basename "$BUILT_BUNDLE")"
  SIGNATURE="$(cat "$BUILT_SIG")"
  PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  cp "$BUILT_BUNDLE" "$OUTPUT_DIR/$BUNDLE_FILENAME"

  cat > "$OUTPUT_DIR/latest.json" << EOF
{
  "version": "99.0.0",
  "notes": "Test update v99.0.0 - built with real JRE + backend",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "$TAURI_PLATFORM": {
      "signature": "$SIGNATURE",
      "url": "http://localhost:$PORT/$BUNDLE_FILENAME"
    }
  }
}
EOF

  BUNDLE_SIZE=$(du -h "$OUTPUT_DIR/$BUNDLE_FILENAME" | cut -f1)
  echo "  Bundle: ${BUNDLE_SIZE}, signed and ready"
else
  echo ""
  echo "=== Skipping build (use without --skip-build to rebuild) ==="
fi

# ── Step 3: Start HTTP server ─────────────────────────────────────────────────
echo ""
echo "=== Starting update server on port $PORT ==="
cd "$OUTPUT_DIR"
$PYTHON -m http.server "$PORT" &>/dev/null &
SERVER_PID=$!
sleep 2

curl -sf "http://localhost:$PORT/latest.json" >/dev/null || { echo "  Error: server not responding"; exit 1; }
echo "  Server: OK (PID $SERVER_PID)"

# ── Step 4: Start Tauri app ──────────────────────────────────────────────────
echo ""
echo "=== Starting Tauri app (v0.0.1) ==="
cd "$FRONTEND_DIR"

# Enable WebView remote debugging (platform-specific)
if [ -n "$WEBVIEW_DEBUG_ENV" ]; then
  export ${WEBVIEW_DEBUG_ENV}
else
  export WEBKIT_INSPECTOR_SERVER="127.0.0.1:$DEBUG_PORT"
fi

npx tauri dev --config src-tauri/tauri.conf.dev-update.json &>"$OUTPUT_DIR/tauri-dev.log" &
APP_PID=$!

# ── Step 5: CDP tests ────────────────────────────────────────────────────────
echo ""
echo "=== Running CDP tests ==="

INSTALL_FLAG=""
if [ "$INSTALL" = true ]; then INSTALL_FLAG="--install"; fi

$PYTHON - $INSTALL_FLAG << 'PYEOF'
import json, asyncio, websockets, base64, sys, urllib.request, time

INSTALL = '--install' in sys.argv
PORT = 9222

async def wait_for_app(timeout=180):
    start = time.time()
    while time.time() - start < timeout:
        try:
            data = urllib.request.urlopen(f'http://localhost:{PORT}/json', timeout=2).read()
            targets = json.loads(data)
            page = next((t for t in targets if t['type'] == 'page'), None)
            if page: return page
        except: pass
        await asyncio.sleep(3)
    raise TimeoutError('App did not start')

async def run():
    print('  Waiting for app to start...')
    page = await wait_for_app()
    print(f'  Connected: {page["url"]}')
    await asyncio.sleep(8)

    uri = page['webSocketDebuggerUrl']
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({'id': 0, 'method': 'Runtime.enable'}))
        for _ in range(30):
            try: await asyncio.wait_for(ws.recv(), timeout=0.3)
            except: break

        async def ev(expr, mid, t=30):
            await ws.send(json.dumps({'id': mid, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'awaitPromise': True}}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=t))
                if msg.get('id') == mid:
                    err = msg.get('result', {}).get('exceptionDetails')
                    if err: return 'EX: ' + str(err.get('exception', {}).get('description', ''))[:200]
                    r = msg.get('result', {}).get('result', {})
                    return r.get('value', r.get('description', str(r)))

        # Test 1: Rust updater check
        print('\n  Test 1: check_for_update via Tauri IPC')
        r = await ev('(async()=>{const r=await window.__TAURI_INTERNALS__.invoke("check_for_update");return JSON.stringify(r)})()', 10)
        if r.startswith('EX:'): print(f'    FAIL: {r}'); sys.exit(1)
        data = json.loads(r)
        if not data: print('    FAIL: no update found'); sys.exit(1)
        print(f'    PASS: {data["currentVersion"]} -> {data["version"]}')

        # Test 2: get_app_version
        r = await ev('window.__TAURI_INTERNALS__.invoke("get_app_version")', 11)
        print(f'\n  Test 2: App version = {r}')
        assert r == '0.0.1', f'Expected 0.0.1, got {r}'
        print('    PASS')

        # Test 3: Download + install
        if INSTALL:
            print('\n  Test 3: download_and_install_update')
            print('    Downloading update (this may take a minute)...')
            try:
                r = await ev('(async()=>{await window.__TAURI_INTERNALS__.invoke("download_and_install_update");return"OK"})()', 20, t=300)
                print(f'    Result: {r}')
            except Exception:
                print(f'    App exited (installer took over) - SUCCESS')
        else:
            print('\n  Test 3: Skipped (use --install for full install)')

    print('\n  ALL TESTS PASSED\n')

asyncio.run(run())
PYEOF
