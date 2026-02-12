#!/bin/bash
set -euo pipefail

SCRIPT_NAME="stirling-diagnostics"
DEFAULT_DAYS=1
DEFAULT_OUT_DIR="/configs"
DEFAULT_OUTPUT_DIR="$DEFAULT_OUT_DIR"
DEFAULT_STAGE_DIR="/tmp/${SCRIPT_NAME}-$(date +%Y%m%d-%H%M%S)"
CONFIG_FILE="${CONFIG_FILE:-/configs/settings.yml}"

log() { printf '%s\n' "$*" >&2; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

prompt_yes_no() {
  local prompt="$1" default="$2" reply
  if [ "$default" = "y" ]; then
    read -r -p "${prompt} [Y/n] " reply
  else
    read -r -p "${prompt} [y/N] " reply
  fi
  reply="${reply:-$default}"
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

prompt_value() {
  local prompt="$1" default="$2" reply
  read -r -p "${prompt} [${default}] " reply
  printf '%s' "${reply:-$default}"
}

is_text_file() {
  local file="$1"
  case "$file" in
    *.log|*.txt|*.yml|*.yaml|*.json|*.properties|*.cfg|*.conf|*.ini|*.csv|*.md) return 0 ;;
  esac
  if command_exists file; then
    file -b --mime-type "$file" 2>/dev/null | grep -q '^text/' && return 0
  fi
  return 1
}

redact_file() {
  local file="$1"
  local redact_secrets="$2"
  local redact_urls="$3"
  local redact_emails="$4"
  local redact_hosts="$5"
  local tmp="${file}.redact.tmp"
  local sed_args=()
  if [ "$redact_secrets" = true ]; then
    sed_args+=(
      -e 's/(Authorization:[[:space:]]*Bearer[[:space:]]+)[^[:space:]]+/\1[REDACTED]/g'
      -e 's/([A-Za-z0-9_.-]*(token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|authorization|bearer)[A-Za-z0-9_.-]*[[:space:]]*[:=][[:space:]]*)[^[:space:]]+/\1[REDACTED]/g'
    )
  fi
  if [ "$redact_urls" = true ]; then
    sed_args+=(
      -e 's#(https?://)[^/@: ]+#\1[REDACTED_HOST]#g'
    )
  fi
  if [ "$redact_emails" = true ]; then
    sed_args+=(
      -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[REDACTED_EMAIL]/g'
    )
  fi
  if [ "$redact_hosts" = true ]; then
    sed_args+=(
      -e 's/([Hh]ost(name)?|[Dd]omain|[Ss]erver)[[:space:]]*[:=][[:space:]]*[^[:space:]]+/\1: [REDACTED_HOST]/g'
    )
  fi
  if [ ${#sed_args[@]} -eq 0 ]; then
    return 0
  fi
  sed -E "${sed_args[@]}" "$file" > "$tmp" && mv "$tmp" "$file"
}

copy_file() {
  local src="$1" dest_root="$2"
  local rel="${src#/}"
  local dest="${dest_root}/${rel}"
  mkdir -p "$(dirname "$dest")"
  cp -p "$src" "$dest"
}

copy_dir_filtered() {
  local src="$1" dest_root="$2" days="$3"
  [ -d "$src" ] || return 0
  local find_args=(-type f)
  if [ "$days" -gt 0 ]; then
    find_args+=(-mtime "-${days}")
  fi
  while IFS= read -r -d '' file; do
    case "$file" in
      *.tar|*.tar.gz|*.tgz|*.zip|*.rar|*.7z|*.gz|*.bz2|*.xz|*.lz4|*.zst) continue ;;
      *.pdf|*.PDF) continue ;;
      *.jpg|*.jpeg|*.png|*.gif|*.bmp|*.tif|*.tiff|*.webp|*.heic) continue ;;
    esac
    copy_file "$file" "$dest_root"
  done < <(find "$src" "${find_args[@]}" -print0 2>/dev/null || true)
}

copy_dir_filtered_no_pdfs() {
  local src="$1" dest_root="$2"
  [ -d "$src" ] || return 0
  while IFS= read -r -d '' file; do
    case "$file" in
      *.tar|*.tar.gz|*.tgz|*.zip|*.rar|*.7z|*.gz|*.bz2|*.xz|*.lz4|*.zst) continue ;;
      *.pdf|*.PDF) continue ;;
      *.jpg|*.jpeg|*.png|*.gif|*.bmp|*.tif|*.tiff|*.webp|*.heic) continue ;;
    esac
    copy_file "$file" "$dest_root"
  done < <(find "$src" -type f -print0 2>/dev/null || true)
}

write_tree() {
  local src="$1" out="$2"
  [ -d "$src" ] || return 0
  if command_exists tree; then
    tree -a "$src" > "$out" 2>/dev/null || true
  else
    find "$src" -print > "$out" 2>/dev/null || true
  fi
}

write_kv() {
  local key="$1" value="$2" file="$3"
  printf '%s: %s\n' "$key" "$value" >> "$file"
}

fetch_url() {
  local url="$1" out="$2"
  if command_exists curl; then
    curl -fsS --max-time 5 "$url" -o "$out" 2>/dev/null && return 0
  elif command_exists wget; then
    wget -q -T 5 -O "$out" "$url" 2>/dev/null && return 0
  fi
  return 1
}

record_success() {
  local label="$1" value="$2"
  if [ "$label" = "metrics" ]; then
    METRICS_SUCCESS+=("$value")
  elif [ "$label" = "ui" ]; then
    UI_SUCCESS+=("$value")
  fi
}

usage() {
  cat <<EOF
${SCRIPT_NAME} - interactive diagnostics bundle collector
Run without arguments and follow prompts.
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if ! [ -t 0 ]; then
  log "Non-interactive session detected. Please run in an interactive shell."
  exit 1
fi

log "=== Stirling-PDF Diagnostics ==="
log "This tool collects a diagnostic bundle for Stirling-PDF."
log "Auto mode includes: logs (last ${DEFAULT_DAYS} day(s)), configs, system info,"
log "metrics/health endpoints, and directory trees for main folders."
log "Custom mode lets you choose what to include and redaction options."

log "Choose collection mode:"
log "  1) Auto (recommended defaults)"
log "  2) Custom (answer prompts)"
MODE="$(prompt_value "Select 1 or 2" "1")"

LOG_DAYS="$DEFAULT_DAYS"
OUT_DIR="$DEFAULT_STAGE_DIR"

INCLUDE_LOGS=false
INCLUDE_CONFIGS=false
INCLUDE_CUSTOM=false
INCLUDE_PIPELINE=false
INCLUDE_TEMP=false
INCLUDE_SYSTEM=false
INCLUDE_ENV=false
INCLUDE_METRICS=false
INCLUDE_UI_DATA=false
REDACT=false
REDACT_SECRETS=false
REDACT_URLS=false
REDACT_EMAILS=false
REDACT_HOST_FIELDS=false
BASE_URL=""
OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"
METRICS_SUCCESS=()
UI_SUCCESS=()

if [ "$MODE" = "1" ]; then
  INCLUDE_LOGS=true
  INCLUDE_CONFIGS=true
  INCLUDE_SYSTEM=true
  INCLUDE_METRICS=true
  REDACT=false
  BASE_URL="http://127.0.0.1:8080"
  INCLUDE_UI_DATA=false
else
  OUTPUT_DIR="$(prompt_value "Output directory" "$DEFAULT_OUTPUT_DIR")"
  LOG_DAYS_RAW="$(prompt_value "Days of logs to include" "$DEFAULT_DAYS")"
  if printf '%s' "$LOG_DAYS_RAW" | grep -Eq '^[0-9]+$'; then
    LOG_DAYS="$LOG_DAYS_RAW"
  fi

  INCLUDE_LOGS=true
  if prompt_yes_no "Include /configs?" "y"; then INCLUDE_CONFIGS=true; fi
  if prompt_yes_no "Include /customFiles (excluding PDFs)?" "n"; then INCLUDE_CUSTOM=true; fi
  if prompt_yes_no "Include /pipeline (excluding PDFs)?" "n"; then INCLUDE_PIPELINE=true; fi
  if prompt_yes_no "Include /tmp/stirling-pdf?" "n"; then INCLUDE_TEMP=true; fi
  if prompt_yes_no "Include system information?" "y"; then INCLUDE_SYSTEM=true; fi
  if prompt_yes_no "Include environment variables?" "n"; then INCLUDE_ENV=true; fi
  if prompt_yes_no "Fetch app status/health/metrics endpoints?" "y"; then INCLUDE_METRICS=true; fi
  if prompt_yes_no "Include /api/v1/ui-data endpoints?" "n"; then INCLUDE_UI_DATA=true; fi
  if prompt_yes_no "Redact sensitive information from diagnostics?" "y"; then
    REDACT=true
    if prompt_yes_no "Redact secrets/tokens/passwords?" "y"; then REDACT_SECRETS=true; fi
    if prompt_yes_no "Redact URL hosts/domains?" "n"; then REDACT_URLS=true; fi
    if prompt_yes_no "Redact emails?" "n"; then REDACT_EMAILS=true; fi
    if prompt_yes_no "Redact Host/Domain/Server fields?" "n"; then REDACT_HOST_FIELDS=true; fi
  fi
fi


mkdir -p "$OUT_DIR"
DATA_DIR="${OUT_DIR}/bundle"
mkdir -p "$DATA_DIR"

SUMMARY="${OUT_DIR}/summary.txt"
: > "$SUMMARY"
log "Writing summary..."
write_kv "created_at" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$SUMMARY"
write_kv "version_tag" "${VERSION_TAG:-<unset>}" "$SUMMARY"
if [ -f /etc/stirling_version ]; then
  write_kv "stirling_version_file" "$(tr -d '\r\n' < /etc/stirling_version)" "$SUMMARY"
fi
write_kv "config_file" "$CONFIG_FILE" "$SUMMARY"
write_kv "output_dir" "$OUTPUT_DIR" "$SUMMARY"
write_kv "include_logs" "$INCLUDE_LOGS" "$SUMMARY"
write_kv "include_configs" "$INCLUDE_CONFIGS" "$SUMMARY"
write_kv "include_customFiles" "$INCLUDE_CUSTOM" "$SUMMARY"
write_kv "include_pipeline" "$INCLUDE_PIPELINE" "$SUMMARY"
write_kv "include_temp" "$INCLUDE_TEMP" "$SUMMARY"
write_kv "include_system" "$INCLUDE_SYSTEM" "$SUMMARY"
write_kv "include_env" "$INCLUDE_ENV" "$SUMMARY"
write_kv "include_metrics" "$INCLUDE_METRICS" "$SUMMARY"
write_kv "include_ui_data" "$INCLUDE_UI_DATA" "$SUMMARY"
write_kv "redaction" "$REDACT" "$SUMMARY"
write_kv "redact_secrets" "$REDACT_SECRETS" "$SUMMARY"
write_kv "redact_urls" "$REDACT_URLS" "$SUMMARY"
write_kv "redact_emails" "$REDACT_EMAILS" "$SUMMARY"
write_kv "redact_host_fields" "$REDACT_HOST_FIELDS" "$SUMMARY"
write_kv "log_days" "$LOG_DAYS" "$SUMMARY"

if [ "$INCLUDE_SYSTEM" = true ]; then
  log "Collecting system info..."
  SYS_DIR="${DATA_DIR}/system"
  mkdir -p "$SYS_DIR"
  uname -a > "${SYS_DIR}/uname.txt" 2>/dev/null || true
  if [ -f /etc/os-release ]; then cp -p /etc/os-release "${SYS_DIR}/os-release"; fi
  id > "${SYS_DIR}/id.txt" 2>/dev/null || true
  whoami > "${SYS_DIR}/whoami.txt" 2>/dev/null || true
  date -u > "${SYS_DIR}/date_utc.txt" 2>/dev/null || true
  df -h > "${SYS_DIR}/df.txt" 2>/dev/null || true
  if [ -f /proc/meminfo ]; then cp -p /proc/meminfo "${SYS_DIR}/meminfo.txt"; fi
  if [ -f /proc/cpuinfo ]; then cp -p /proc/cpuinfo "${SYS_DIR}/cpuinfo.txt"; fi
  if [ -f /proc/mounts ]; then cp -p /proc/mounts "${SYS_DIR}/mounts.txt"; fi
  if [ -f /proc/self/mountinfo ]; then cp -p /proc/self/mountinfo "${SYS_DIR}/mountinfo.txt"; fi
  if command_exists lscpu; then lscpu > "${SYS_DIR}/lscpu.txt" 2>/dev/null || true; fi
  if command_exists free; then free -m > "${SYS_DIR}/free.txt" 2>/dev/null || true; fi
  if command_exists ps; then ps -eo pid,ppid,user,etime,cmd --sort=pid > "${SYS_DIR}/ps.txt" 2>/dev/null || true; fi
  if command_exists java; then java -version > "${SYS_DIR}/java-version.txt" 2>&1 || true; fi
  if command_exists python; then python --version > "${SYS_DIR}/python-version.txt" 2>&1 || true; fi
fi

if [ "$INCLUDE_ENV" = true ]; then
  log "Collecting environment variables..."
  ENV_DIR="${DATA_DIR}/env"
  mkdir -p "$ENV_DIR"
  env | sort > "${ENV_DIR}/environment.txt"
fi

if [ "$INCLUDE_METRICS" = true ] && [ -n "$BASE_URL" ]; then
  log "Fetching metrics from ${BASE_URL}..."
  MET_DIR="${DATA_DIR}/metrics"
  mkdir -p "$MET_DIR"
  for endpoint in \
    /api/v1/info/status \
    /api/v1/info/uptime \
    /api/v1/info/wau \
    /api/v1/info/requests \
    /api/v1/info/requests/unique \
    /api/v1/info/requests/all \
    /api/v1/info/requests/all/unique \
    /api/v1/info/load \
    /api/v1/info/load/unique \
    /api/v1/info/load/all \
    /api/v1/info/load/all/unique; do
    if fetch_url "${BASE_URL}${endpoint}" "${MET_DIR}${endpoint}.json"; then
      record_success "metrics" "$endpoint"
    fi
  done
  if fetch_url "${BASE_URL}/api/v1/info/health" "${MET_DIR}/api/v1/info/health.json"; then
    record_success "metrics" "/api/v1/info/health"
  fi
  if fetch_url "${BASE_URL}/actuator/health" "${MET_DIR}/actuator/health.json"; then
    record_success "metrics" "/actuator/health"
  fi
  if fetch_url "${BASE_URL}/actuator/prometheus" "${MET_DIR}/actuator/prometheus.txt"; then
    record_success "metrics" "/actuator/prometheus"
  fi
  if [ "$INCLUDE_UI_DATA" = true ]; then
    for endpoint in \
      /api/v1/ui-data/sign \
      /api/v1/ui-data/pipeline \
      /api/v1/ui-data/ocr-pdf; do
      if fetch_url "${BASE_URL}${endpoint}" "${MET_DIR}${endpoint}.json"; then
        record_success "ui" "$endpoint"
      fi
    done
  fi
fi

if [ "$INCLUDE_METRICS" = true ] && [ -z "$BASE_URL" ]; then
  log "Auto-detecting metrics endpoint..."
  MET_DIR="${DATA_DIR}/metrics"
  mkdir -p "$MET_DIR"
  for port in ${SERVER_PORT:-} ${PORT:-} 8080 80 8081 8082 8888 5000; do
    [ -n "$port" ] || continue
    BASE_URL="http://127.0.0.1:${port}"
    if fetch_url "${BASE_URL}/api/v1/info/status" "${MET_DIR}/api/v1/info/status.json"; then
      record_success "metrics" "/api/v1/info/status"
      break
    fi
    if fetch_url "${BASE_URL}/actuator/health" "${MET_DIR}/actuator/health.json"; then
      record_success "metrics" "/actuator/health"
      break
    fi
    BASE_URL=""
  done
  if [ -n "$BASE_URL" ]; then
    for endpoint in \
      /api/v1/info/status \
      /api/v1/info/uptime \
      /api/v1/info/wau \
      /api/v1/info/requests \
      /api/v1/info/requests/unique \
      /api/v1/info/requests/all \
      /api/v1/info/requests/all/unique \
      /api/v1/info/load \
      /api/v1/info/load/unique \
      /api/v1/info/load/all \
      /api/v1/info/load/all/unique; do
      if fetch_url "${BASE_URL}${endpoint}" "${MET_DIR}${endpoint}.json"; then
        record_success "metrics" "$endpoint"
      fi
    done
    if fetch_url "${BASE_URL}/api/v1/info/health" "${MET_DIR}/api/v1/info/health.json"; then
      record_success "metrics" "/api/v1/info/health"
    fi
    if fetch_url "${BASE_URL}/actuator/prometheus" "${MET_DIR}/actuator/prometheus.txt"; then
      record_success "metrics" "/actuator/prometheus"
    fi
    if [ "$INCLUDE_UI_DATA" = true ]; then
      for endpoint in \
        /api/v1/ui-data/sign \
        /api/v1/ui-data/pipeline \
        /api/v1/ui-data/ocr-pdf; do
        if fetch_url "${BASE_URL}${endpoint}" "${MET_DIR}${endpoint}.json"; then
          record_success "ui" "$endpoint"
        fi
      done
    fi
  fi
fi

if [ "$INCLUDE_METRICS" = true ]; then
  write_kv "metrics_base_url" "${BASE_URL:-<none>}" "$SUMMARY"
  if [ ${#METRICS_SUCCESS[@]} -gt 0 ]; then
    write_kv "metrics_endpoints" "$(IFS=,; printf '%s' "${METRICS_SUCCESS[*]}")" "$SUMMARY"
  else
    write_kv "metrics_endpoints" "<none>" "$SUMMARY"
  fi
fi

if [ "$INCLUDE_LOGS" = true ]; then
  log "Collecting logs (last ${LOG_DAYS} days)..."
  copy_dir_filtered "/logs" "$DATA_DIR" "$LOG_DAYS"
fi
if [ "$INCLUDE_CONFIGS" = true ]; then
  log "Collecting configs..."
  copy_dir_filtered "/configs" "$DATA_DIR" 0
fi
if [ "$INCLUDE_CUSTOM" = true ]; then
  log "Collecting /customFiles (excluding PDFs)..."
  copy_dir_filtered_no_pdfs "/customFiles" "$DATA_DIR"
fi
if [ "$INCLUDE_PIPELINE" = true ]; then
  log "Collecting /pipeline (excluding PDFs)..."
  copy_dir_filtered_no_pdfs "/pipeline" "$DATA_DIR"
fi
if [ "$INCLUDE_TEMP" = true ]; then
  log "Collecting /tmp/stirling-pdf..."
  copy_dir_filtered "/tmp/stirling-pdf" "$DATA_DIR" 0
fi

log "Writing directory trees..."
TREE_DIR="${DATA_DIR}/tree"
mkdir -p "$TREE_DIR"
write_tree "/logs" "${TREE_DIR}/logs.txt"
write_tree "/configs" "${TREE_DIR}/configs.txt"
write_tree "/customFiles" "${TREE_DIR}/customFiles.txt"
write_tree "/pipeline" "${TREE_DIR}/pipeline.txt"
write_tree "/tmp/stirling-pdf" "${TREE_DIR}/tmp-stirling-pdf.txt"
write_tree "/usr/share/tesseract-ocr/5/tessdata" "${TREE_DIR}/tessdata.txt"
write_tree "/usr/share/tessdata" "${TREE_DIR}/tessdata-mount.txt"

if [ "$REDACT" = true ]; then
  log "Applying redaction..."
  while IFS= read -r -d '' file; do
    if is_text_file "$file"; then
      redact_file "$file" "$REDACT_SECRETS" "$REDACT_URLS" "$REDACT_EMAILS" "$REDACT_HOST_FIELDS"
    fi
  done < <(find "$DATA_DIR" -type f -print0 2>/dev/null || true)
  if [ "$INCLUDE_ENV" = true ]; then
    redact_file "${DATA_DIR}/env/environment.txt" "$REDACT_SECRETS" "$REDACT_URLS" "$REDACT_EMAILS" "$REDACT_HOST_FIELDS" || true
  fi
fi

log "Packaging tar.gz..."
TAR_BASENAME="${SCRIPT_NAME}-$(date +%Y%m%d-%H%M%S).tar.gz"
TAR_PATH="${OUTPUT_DIR}/${TAR_BASENAME}"
mkdir -p "$OUTPUT_DIR"
(cd "$OUT_DIR" && tar -czf "$TAR_PATH" "bundle" "summary.txt")
log "Created tar.gz: $TAR_PATH"

rm -rf "$OUT_DIR"

log "Diagnostics complete."
