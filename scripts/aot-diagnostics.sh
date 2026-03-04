#!/bin/bash
# aot-diagnostics.sh - Project Leyden AOT cache diagnostic tool for Stirling-PDF
#
# Diagnoses AOT cache generation failures, especially on ARM64 (aarch64).
# Reports JVM feature support, memory limits, cache state, and fingerprint validity.
#
# Usage:
#   aot-diagnostics.sh [--test] [--cache PATH]
#
#   --test         Run a quick AOT RECORD smoke test (~10-30s). Shows exactly
#                  what error the JVM produces, useful for ARM debugging.
#   --cache PATH   Override the AOT cache path (default: /configs/cache/stirling.aot)
#
# Symlink aliases set up by init-without-ocr.sh: aot-diag, aot-diagnostics

set -euo pipefail

AOT_CACHE_DEFAULT="/configs/cache/stirling.aot"
RUN_SMOKE_TEST=false
AOT_CACHE_PATH=""

for arg in "$@"; do
  case "$arg" in
    --test)       RUN_SMOKE_TEST=true ;;
    --cache=*)    AOT_CACHE_PATH="${arg#--cache=}" ;;
    --cache)      shift; AOT_CACHE_PATH="${1:-}" ;;
    -h|--help)
      sed -n '/^#/,/^[^#]/{ /^#/{ s/^# \{0,1\}//; p } }' "$0" | head -20
      exit 0
      ;;
  esac
done

AOT_CACHE="${AOT_CACHE_PATH:-$AOT_CACHE_DEFAULT}"
AOT_FP="${AOT_CACHE}.fingerprint"

# ── Terminal colours ──────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_RED='\033[0;31m' C_GRN='\033[0;32m' C_YLW='\033[0;33m'
  C_CYN='\033[0;36m' C_BLD='\033[1m'    C_RST='\033[0m'
else
  C_RED='' C_GRN='' C_YLW='' C_CYN='' C_BLD='' C_RST=''
fi

PASS=0; WARN=0; FAIL=0

pass()  { printf "${C_GRN}[PASS]${C_RST} %s\n" "$*"; PASS=$((PASS+1)); }
warn()  { printf "${C_YLW}[WARN]${C_RST} %s\n" "$*"; WARN=$((WARN+1)); }
fail()  { printf "${C_RED}[FAIL]${C_RST} %s\n" "$*"; FAIL=$((FAIL+1)); }
info()  { printf "${C_CYN}[INFO]${C_RST} %s\n" "$*"; }
hdr()   { printf "\n${C_BLD}=== %s ===${C_RST}\n" "$*"; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

# ── Section 1: Environment ────────────────────────────────────────────────────
hdr "Environment"
info "Date:         $(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date)"
info "Hostname:     $(hostname 2>/dev/null || echo unknown)"
info "Architecture: $(uname -m)"
info "Kernel:       $(uname -r)"
if [ -f /etc/stirling_version ]; then
  info "Version:      $(tr -d '\r\n' < /etc/stirling_version)"
elif [ -n "${VERSION_TAG:-}" ]; then
  info "Version:      ${VERSION_TAG}"
else
  warn "VERSION_TAG not set and /etc/stirling_version not found"
fi

if [ -f /etc/os-release ]; then
  info "OS:           $(. /etc/os-release; echo "${PRETTY_NAME:-${NAME:-unknown}}")"
fi

# Warn about external JVM option vars — these break AOT training if set
for _jvm_var in JAVA_TOOL_OPTIONS JDK_JAVA_OPTIONS _JAVA_OPTIONS; do
  _jvm_val="$(eval echo "\${${_jvm_var}:-}")"
  if [ -n "$_jvm_val" ]; then
    warn "${_jvm_var}='${_jvm_val}'"
    warn "  External JVM options are cleared during AOT training (fixed), but may"
    warn "  affect the running app. Ensure they are compatible with -Xmx limits."
  fi
done
unset _jvm_var _jvm_val

# ── Section 2: JVM Detection ──────────────────────────────────────────────────
hdr "JVM Detection"
if ! command_exists java; then
  fail "java not found in PATH. PATH=${PATH}"
  exit 1
fi

JDK_VER="$(JAVA_TOOL_OPTIONS= JDK_JAVA_OPTIONS= _JAVA_OPTIONS= java -version 2>&1 | head -1)"
info "JDK:          ${JDK_VER}"
info "java binary:  $(command -v java)"

ARCH="$(uname -m)"

# --- AOTMode support (Project Leyden) ---
AOT_SUPPORTED=false
if java -XX:AOTMode=off -version >/dev/null 2>&1; then
  pass "AOTMode supported (-XX:AOTMode=off accepted)"
  AOT_SUPPORTED=true
else
  fail "AOTMode NOT supported on this JVM build ($(uname -m))"
  fail "  This JDK does not support Project Leyden (JEP 483/514/515)."
  fail "  AOT cache generation will be skipped."
  if [[ "$ARCH" == "aarch64" ]]; then
    warn "  ARM64: some vendor JDK 25 builds omit Leyden. Try eclipse-temurin:25-jre."
  fi
fi

# --- CompactObjectHeaders support (Project Lilliput) ---
COMPACT_HEADERS_FLAG=""
if java -XX:+UseCompactObjectHeaders -version >/dev/null 2>&1; then
  pass "UseCompactObjectHeaders supported (Project Lilliput active)"
  COMPACT_HEADERS_FLAG="-XX:+UseCompactObjectHeaders"
else
  warn "UseCompactObjectHeaders NOT supported on $(uname -m)"
  warn "  AOT training will run without this flag. Runtime must also omit it."
  if [[ "$ARCH" == "aarch64" ]]; then
    warn "  This is the most common cause of ARM AOT failures: the flag was"
    warn "  hardcoded in training but unsupported at runtime (or vice-versa)."
  fi
fi

# --- CompressedOops ---
COMPRESSED_OOPS_FLAG="-XX:+UseCompressedOops"
if java -XX:+UseCompressedOops -version >/dev/null 2>&1; then
  pass "UseCompressedOops accepted by JVM"
else
  warn "UseCompressedOops flag not accepted — will use -XX:-UseCompressedOops"
  COMPRESSED_OOPS_FLAG="-XX:-UseCompressedOops"
fi

# ── Section 3: Memory Limits ──────────────────────────────────────────────────
hdr "Memory Limits"

MEM_MB=0
if [ -f /sys/fs/cgroup/memory.max ]; then
  RAW="$(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo '')"
  if [ "$RAW" = "max" ]; then
    info "cgroup v2 memory.max: unlimited"
  elif [ -n "$RAW" ] && [ "$RAW" -gt 0 ] 2>/dev/null; then
    MEM_MB=$(( RAW / 1048576 ))
    info "cgroup v2 memory.max: ${MEM_MB}MB"
  fi
elif [ -f /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
  RAW="$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo '')"
  if [ "${#RAW}" -ge 19 ]; then
    info "cgroup v1 limit: unlimited (max uint64)"
  elif [ -n "$RAW" ] && [ "$RAW" -gt 0 ] 2>/dev/null; then
    MEM_MB=$(( RAW / 1048576 ))
    info "cgroup v1 limit: ${MEM_MB}MB"
  fi
else
  info "No cgroup memory limit detected"
fi

if [ "$MEM_MB" -eq 0 ] && [ -f /proc/meminfo ]; then
  MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
  info "System MemTotal: ${MEM_MB}MB"
fi

MIN_MEM=768
if [ "$ARCH" = "aarch64" ]; then
  MIN_MEM=1024
fi

if [ "$MEM_MB" -eq 0 ]; then
  warn "Could not determine container memory. AOT generation may be skipped."
elif [ "$MEM_MB" -le "$MIN_MEM" ]; then
  warn "Available memory (${MEM_MB}MB) is at or below AOT generation minimum (${MIN_MEM}MB on ${ARCH})."
  warn "  AOT background generation will be skipped for this architecture."
  warn "  Increase container memory above ${MIN_MEM}MB to enable AOT cache generation."
else
  pass "Memory OK: ${MEM_MB}MB available, minimum ${MIN_MEM}MB for ${ARCH}"
fi

if command_exists free; then
  FREE_MB="$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}')"
  info "Available (free+cache): ${FREE_MB:-?}MB"
fi

# ── Section 4: AOT Cache State ────────────────────────────────────────────────
hdr "AOT Cache State"
info "Cache path:       ${AOT_CACHE}"
info "Fingerprint path: ${AOT_FP}"

if [ -f "${AOT_CACHE}" ]; then
  CACHE_SIZE="$(du -h "${AOT_CACHE}" 2>/dev/null | cut -f1 || echo '?')"
  CACHE_MTIME="$(stat -c '%y' "${AOT_CACHE}" 2>/dev/null | cut -d. -f1 || echo '?')"
  info "Cache exists:     ${CACHE_SIZE} (modified ${CACHE_MTIME})"
  if [ -s "${AOT_CACHE}" ]; then
    pass "Cache file is non-empty"
  else
    fail "Cache file is empty — will be regenerated on next boot"
    rm -f "${AOT_CACHE}" "${AOT_FP}" 2>/dev/null || true
  fi
else
  warn "No cache file at ${AOT_CACHE}"
  info "  Cache will be generated in background on next boot."
  if [ ! -d "$(dirname "${AOT_CACHE}")" ]; then
    warn "  Parent directory $(dirname "${AOT_CACHE}") does not exist."
    warn "  Ensure /configs is volume-mounted and writable."
  fi
fi

# --- Fingerprint validation ---
if [ -f "${AOT_FP}" ]; then
  STORED_FP="$(tr -d '\r\n' < "${AOT_FP}" 2>/dev/null || echo '')"
  info "Stored fingerprint: ${STORED_FP}"

  # Recompute fingerprint using the same logic as init-without-ocr.sh
  FP=""
  FP+="jdk:$(JAVA_TOOL_OPTIONS= JDK_JAVA_OPTIONS= _JAVA_OPTIONS= java -version 2>&1 | head -1);"
  FP+="arch:${ARCH};"
  FP+="compact:${COMPACT_HEADERS_FLAG:-none};"
  FP+="oops:${COMPRESSED_OOPS_FLAG:-none};"
  if [ -f /app/app.jar ]; then
    FP+="app:$(stat -c '%s-%Y' /app/app.jar 2>/dev/null || echo unknown);"
  elif [ -f /app.jar ]; then
    FP+="app:$(stat -c '%s-%Y' /app.jar 2>/dev/null || echo unknown);"
  elif [ -d /app/lib ]; then
    FP+="app:$(ls -la /app/lib/ 2>/dev/null | md5sum 2>/dev/null | cut -c1-16 || echo unknown);"
  fi
  FP+="ver:${VERSION_TAG:-unknown};"
  if command_exists md5sum; then
    EXPECTED_FP="$(printf '%s' "$FP" | md5sum | cut -c1-16)"
  elif command_exists sha256sum; then
    EXPECTED_FP="$(printf '%s' "$FP" | sha256sum | cut -c1-16)"
  else
    EXPECTED_FP="$(printf '%s' "$FP" | cksum | cut -d' ' -f1)"
  fi
  info "Expected fingerprint: ${EXPECTED_FP}"

  if [ "$STORED_FP" = "$EXPECTED_FP" ]; then
    pass "Fingerprint valid — cache matches current JDK/arch/app"
  else
    fail "Fingerprint mismatch — cache is stale"
    info "  The cache was built with a different JDK, arch, flags, or app version."
    info "  It will be automatically removed and regenerated on next boot."
    # Print a diff of fingerprint components for easier debugging
    printf "  Stored FP string:   (run with --test to regenerate)\n"
    printf "  Expected FP string: %s\n" "$FP"
  fi
else
  if [ -f "${AOT_CACHE}" ]; then
    warn "Cache exists but no fingerprint file found"
    warn "  Cache will be treated as stale and regenerated on next boot."
  else
    info "No fingerprint file (expected — cache not yet generated)"
  fi
fi

# ── Section 5: JAR Layout Detection ──────────────────────────────────────────
hdr "JAR Layout"
if [ -f /app/app.jar ] && [ -d /app/lib ]; then
  pass "Spring Boot 4 layered layout: /app/app.jar + /app/lib/"
  info "  Classpath: -cp /app/app.jar:/app/lib/* stirling.software.SPDF.SPDFApplication"
  JAR_LAYOUT="layered"
elif [ -f /app.jar ]; then
  pass "Single JAR layout: /app.jar"
  info "  Invocation: -jar /app.jar"
  JAR_LAYOUT="single"
elif [ -d /app/BOOT-INF ]; then
  pass "Exploded Spring Boot 3 layout: /app/BOOT-INF"
  info "  Classpath: -cp /app org.springframework.boot.loader.launch.JarLauncher"
  JAR_LAYOUT="exploded"
else
  fail "No recognisable JAR layout found. Looked for:"
  fail "  /app/app.jar + /app/lib/   (Spring Boot 4 layered)"
  fail "  /app.jar                   (single fat JAR)"
  fail "  /app/BOOT-INF/             (Spring Boot 3 exploded)"
  JAR_LAYOUT="unknown"
fi

# ── Section 6: Disk Space ─────────────────────────────────────────────────────
hdr "Disk Space"
CACHE_DIR="$(dirname "${AOT_CACHE}")"
if [ -d "$CACHE_DIR" ]; then
  DF="$(df -h "$CACHE_DIR" 2>/dev/null | tail -1 || echo '')"
  info "Volume ($CACHE_DIR): $DF"
  AVAIL_PCT="$(df "$CACHE_DIR" 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%')"
  if [ -n "$AVAIL_PCT" ] && [ "$AVAIL_PCT" -ge 95 ]; then
    fail "Disk almost full (${AVAIL_PCT}% used). AOT cache creation will fail."
  elif [ -n "$AVAIL_PCT" ] && [ "$AVAIL_PCT" -ge 85 ]; then
    warn "Disk usage high (${AVAIL_PCT}% used). AOT cache is typically 50-150MB."
  else
    pass "Sufficient disk space available"
  fi
else
  warn "Cache directory ${CACHE_DIR} does not exist."
  warn "  /configs must be volume-mounted. AOT cache will not persist across restarts."
fi

# ── Section 7: Optional Smoke Test ───────────────────────────────────────────
if [ "$RUN_SMOKE_TEST" = true ]; then
  hdr "AOT RECORD Smoke Test"
  if [ "$AOT_SUPPORTED" = false ]; then
    warn "Skipping smoke test — AOTMode not supported on this JVM"
  elif [ "$JAR_LAYOUT" = "unknown" ]; then
    warn "Skipping smoke test — could not determine JAR layout"
  else
    info "Running minimal AOT RECORD phase (this may take 10-30s on ARM)..."
    SMOKE_CONF="/tmp/aot-diag-smoke.aotconf"
    SMOKE_LOG="/tmp/aot-diag-smoke.log"
    rm -f "$SMOKE_CONF" "$SMOKE_LOG"

    SMOKE_CMD=(java -Xmx256m ${COMPACT_HEADERS_FLAG:-} ${COMPRESSED_OOPS_FLAG}
      -Xlog:aot=info
      -XX:AOTMode=record
      -XX:AOTConfiguration="$SMOKE_CONF"
      -Dspring.main.banner-mode=off
      -Dspring.context.exit=onRefresh
      -Dstirling.datasource.url="jdbc:h2:mem:aotsmoke;DB_CLOSE_DELAY=-1;MODE=PostgreSQL")

    case "$JAR_LAYOUT" in
      layered)  SMOKE_CMD+=(-cp "/app/app.jar:/app/lib/*" stirling.software.SPDF.SPDFApplication) ;;
      single)   SMOKE_CMD+=(-jar /app.jar) ;;
      exploded) SMOKE_CMD+=(-cp /app org.springframework.boot.loader.launch.JarLauncher) ;;
    esac

    info "Command: ${SMOKE_CMD[*]}"
    SMOKE_EXIT=0
    if command_exists timeout; then
      JAVA_TOOL_OPTIONS= JDK_JAVA_OPTIONS= _JAVA_OPTIONS= \
        timeout 120s "${SMOKE_CMD[@]}" >"$SMOKE_LOG" 2>&1 || SMOKE_EXIT=$?
    else
      JAVA_TOOL_OPTIONS= JDK_JAVA_OPTIONS= _JAVA_OPTIONS= \
        "${SMOKE_CMD[@]}" >"$SMOKE_LOG" 2>&1 || SMOKE_EXIT=$?
    fi

    case "$SMOKE_EXIT" in
      0|1)
        if [ -f "$SMOKE_CONF" ] && [ -s "$SMOKE_CONF" ]; then
          CONF_SIZE="$(du -h "$SMOKE_CONF" | cut -f1)"
          pass "RECORD phase succeeded (exit=${SMOKE_EXIT}, conf=${CONF_SIZE})"
          info "  AOT cache generation should work on this system."
        else
          fail "RECORD phase exit=${SMOKE_EXIT} but no .aotconf produced"
          info "  Last 30 lines of AOT output:"
          tail -30 "$SMOKE_LOG" 2>/dev/null | while IFS= read -r line; do
            printf "    %s\n" "$line"
          done
        fi
        ;;
      124)
        fail "RECORD phase timed out after 120s"
        warn "  On ARM under QEMU or slow storage this can happen."
        warn "  Try running with more memory or on native ARM hardware."
        ;;
      137)
        fail "RECORD phase OOM-killed (exit 137)"
        warn "  Increase container memory. Minimum for ARM AOT training: 1GB."
        ;;
      *)
        fail "RECORD phase failed (exit=${SMOKE_EXIT})"
        info "  Last 30 lines of AOT output:"
        tail -30 "$SMOKE_LOG" 2>/dev/null | while IFS= read -r line; do
          printf "    %s\n" "$line"
        done
        ;;
    esac
    rm -f "$SMOKE_CONF" "$SMOKE_LOG"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
printf "\n${C_BLD}=== Summary: PASS=%d WARN=%d FAIL=%d ===${C_RST}\n" \
  "$PASS" "$WARN" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  printf "${C_RED}AOT cache has issues. See FAIL items above.${C_RST}\n"
  printf "To disable AOT: omit STIRLING_AOT_ENABLE (default is off) or set STIRLING_AOT_ENABLE=false\n"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  printf "${C_YLW}AOT cache may not function optimally. See WARN items above.${C_RST}\n"
  exit 0
else
  printf "${C_GRN}All AOT checks passed.${C_RST}\n"
  exit 0
fi
