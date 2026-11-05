#!/bin/sh
# usage: run-bench.sh <app dir> <results dir>
# env: LABEL QPDF OPS SKIP_PDFBOX POOL_ENGINES MERGE_TYPES MERGE_FILES CONC WARMUP ROUNDS PDFS PROFILE_CASES
#      PROFILE_RUNS PHASE_ROUNDS LEAF_SECONDS MALLOC_RUNS NATIVE_LIBS SKIP_TIMING SKIP_PROFILE SKIP_PHASES SKIP_NATIVE
set -eu
APP=$(cd "$1" && pwd); OUT=$2; H="$(cd "$(dirname "$0")" && pwd)"
LABEL=${LABEL:-v130}; QPDF=${QPDF:-false}
OPS=${OPS:-merge pagecount split splitsize redact text markdown render protect}
POOL_ENGINES=${POOL_ENGINES:-pool2}; MERGE_TYPES=${MERGE_TYPES:-small text image}; MERGE_FILES=${MERGE_FILES:-1 3 5}
CONC=${CONC:-1 4}; WARMUP=${WARMUP:-2}; ROUNDS=${ROUNDS:-2}; PDFS=${PDFS:-$OUT/pdfs}
PROFILE_CASES=${PROFILE_CASES:-merge:text:5 merge:image:3 pagecount:text200:1 split:text200:1 splitsize:text200:1 redact:text200:1 text:text200:1 markdown:text200:1 render:image:1 protect:text200:1}
PROFILE_RUNS=${PROFILE_RUNS:-10}; PHASE_ROUNDS=${PHASE_ROUNDS:-5}; LEAF_SECONDS=${LEAF_SECONDS:-10}; MALLOC_RUNS=${MALLOC_RUNS:-10}
NATIVE_LIBS=${NATIVE_LIBS:-libjpdfium|libpdfium|libqpdf}
mkdir -p "$OUT/raw" "$PDFS"; OUT=$(cd "$OUT" && pwd); PDFS=$(cd "$PDFS" && pwd)
C="$OUT/raw/classes-$LABEL"; mkdir -p "$C"
LIBS="$(ls "$APP"/*.jar | head -1):$APP/lib/*"
CP="$C:$LIBS"
JOPTS="-Xmx4g --enable-native-access=ALL-UNNAMED -Dlogback.configurationFile=logback-pdf-worker.xml -Djpdfium.merge.qpdfDirect=$QPDF"

engines_for() {
  case $1 in
    merge) e="pdfbox jpdfium $POOL_ENGINES" ;;
    split) e="pdfbox jpdfium jpdfium-file" ;;
    splitsize) e="jpdfium" ;;
    markdown) e="jpdfium jpdfium-adv" ;;
    *) e="pdfbox jpdfium" ;;
  esac
  [ -n "${SKIP_PDFBOX:-}" ] && e=$(echo "$e" | sed 's/pdfbox//')
  echo $e
}
types_for() {
  case $1 in
    merge) echo "$MERGE_TYPES" ;;
    pagecount|protect) echo "small text200 image" ;;
    split|splitsize|render) echo "text200 image" ;;
    *) echo "text200" ;;
  esac
}

[ -f "$PDFS/small.pdf" ] || python3 -I "$H/pdfs/mkpdf.py" "$PDFS/small.pdf" 1 150
[ -f "$PDFS/text.pdf" ] || python3 -I "$H/pdfs/mktext.py" "$PDFS/text.pdf" 2000 flate
[ -f "$PDFS/text200.pdf" ] || python3 -I "$H/pdfs/mktext.py" "$PDFS/text200.pdf" 200 flate
[ -f "$PDFS/image.pdf" ] || python3 -I "$H/pdfs/mkpdf.py" "$PDFS/image.pdf" 30 365

javac -nowarn -d "$C" -cp "$LIBS" "$H/PdfBench.java" "$H/PdfOps.java" "$H/PhaseBench.java" "$H/JfrSummary.java" 2>"$OUT/raw/javac-$LABEL.log" || { cat "$OUT/raw/javac-$LABEL.log" >&2; exit 1; }

{
  printf '{"label":"%s","qpdf_direct":%s,"ops":"%s","os":"%s","arch":"%s","cpus":%s,' "$LABEL" "$QPDF" "$OPS" "$(uname -sr)" "$(uname -m)" \
    "$(getconf _NPROCESSORS_ONLN)"
  printf '"java":"%s","jpdfium":"%s","pdfbox":"%s","warmup":%s,"rounds":%s,"profile_runs":%s,"profile_cases":"%s","date":"%s","files":{' \
    "$(java -version 2>&1 | head -1 | sed 's/"/\\"/g')" "$(ls "$APP/lib" | grep -E '^jpdfium-[0-9]' | sed 's/\.jar$//' | head -1)" \
    "$(ls "$APP/lib" | grep -E '^pdfbox-[0-9]' | sed 's/\.jar$//' | head -1)" "$WARMUP" "$ROUNDS" "$PROFILE_RUNS" "$PROFILE_CASES" "$(date -u +%Y-%m-%dT%H:%MZ)"
  sep=""; for t in small text text200 image; do printf '%s"%s":%s' "$sep" "$t" "$(wc -c < "$PDFS/$t.pdf" | tr -d ' ')"; sep=","; done
  printf '}}\n'
} > "$OUT/meta-$LABEL.json"

if [ -z "${SKIP_TIMING:-}" ]; then
  CSV="$OUT/bench-$LABEL.csv"
  echo "row,label,op,file_type,files,concurrent_requests,engine,median_seconds,max_seconds,cpu_seconds_per_merge,cpu_per_wall,peak_heap_mb,peak_rss_mb,workers_live,status" > "$CSV"
  for op in $OPS; do
    files="1"; [ "$op" = merge ] && files=$MERGE_FILES
    for t in $(types_for $op); do for n in $files; do for c in $CONC; do for e in $(engines_for $op); do
      java $JOPTS -cp "$CP" PdfBench bench "$LABEL" "$op" "$e" "$c" "$WARMUP" "$ROUNDS" "$t" "$PDFS/$t.pdf" "$n" \
        2>>"$OUT/raw/bench-$LABEL.err" | grep -E "^$LABEL-" >> "$CSV" || echo "$LABEL-$op-$e-$t-$n-$c,$LABEL,$op,$t,$n,$c,$e,,,,,,,,FAILED" >> "$CSV"
      tail -1 "$CSV" >&2
    done; done; done; done
  done
fi

in_ops() { echo " $OPS " | grep -q " $1 "; }

if [ -z "${SKIP_PROFILE:-}" ]; then
  for case in $PROFILE_CASES; do op=${case%%:*}; rest=${case#*:}; t=${rest%%:*}; n=${rest##*:}
    in_ops "$op" || continue
    for e in $(engines_for $op); do
      case $e in pool*) continue ;; esac
      tag="$LABEL-$op-$e-$t-$n"; jfr="$OUT/raw/profile-$tag.jfr"
      line=$(java $JOPTS -cp "$CP" PdfBench profile "$op" "$e" "$PDFS/$t.pdf" "$n" "$PROFILE_RUNS" "$jfr" 2>>"$OUT/raw/profile-$LABEL.err" | grep peak_rss_mb) || { echo "profile $tag FAILED" >&2; continue; }
      java -cp "$CP" JfrSummary "$jfr" "$PROFILE_RUNS" "${line##*=}" "$OUT/profile-$tag.json"
      echo "profile $tag done" >&2
    done
  done
fi

if [ -z "${SKIP_PHASES:-}" ] && in_ops merge; then
  : > "$OUT/phases-$LABEL.jsonl"
  for case in $PROFILE_CASES; do op=${case%%:*}; rest=${case#*:}; t=${rest%%:*}; n=${rest##*:}
    [ "$op" = merge ] || continue
    for e in pdfbox jpdfium; do
      java $JOPTS -cp "$CP" PhaseBench "$e" "$t" "$PDFS/$t.pdf" "$n" "$PHASE_ROUNDS" 2>>"$OUT/raw/phases-$LABEL.err" | grep '^{' >> "$OUT/phases-$LABEL.jsonl" || true
    done
  done
fi

loop_attach() {
  fifo="$OUT/raw/loop.fifo"; log="$OUT/raw/loop-$1.log"; rm -f "$fifo"; mkfifo "$fifo"
  env $2 java $JOPTS -cp "$CP" PdfBench loop "$3" "$4" "$PDFS/$5.pdf" "$6" $7 < "$fifo" > "$log" 2>&1 &
  exec 3>"$fifo"
  while ! grep -q -e READY -e Exception "$log"; do sleep 0.2; done
  pid=$(awk '/READY/{print $2}' "$log")
}
loop_done() { while ! grep -q -e DONE -e Exception "$log"; do sleep 0.2; done; }
loop_end() {
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo end >&3; fi
  exec 3>&-; wait || true; rm -f "$fifo"
}

if [ -z "${SKIP_NATIVE:-}" ] && [ "$(uname -s)" = Darwin ]; then
  for case in $PROFILE_CASES; do op=${case%%:*}; rest=${case#*:}; t=${rest%%:*}; n=${rest##*:}
    in_ops "$op" || continue
    for e in $(engines_for $op); do
      case $e in jpdfium*) ;; *) continue ;; esac
      tag="$LABEL-$op-$e-$t-$n"
      loop_attach "leaf-$tag" "" "$op" "$e" "$t" "$n" "$LEAF_SECONDS s"
      if [ -n "$pid" ]; then
        echo go >&3
        sample "$pid" "$LEAF_SECONDS" 1 -mayDie -file "$OUT/raw/leaf-$tag.txt" >/dev/null 2>&1 || true
        loop_done; runs=$(awk '/DONE/{print $2}' "$log")
      fi
      loop_end
      [ -n "$pid" ] && [ -f "$OUT/raw/leaf-$tag.txt" ] && node "$H/native-summary.mjs" leaf "$OUT/raw/leaf-$tag.txt" "$NATIVE_LIBS" "$OUT/leaf-$tag.json" "$runs"

      loop_attach "malloc-$tag" "MallocStackLogging=1" "$op" "$e" "$t" "$n" "$MALLOC_RUNS"
      if [ -n "$pid" ]; then
        echo go >&3; loop_done
        malloc_history "$pid" -allBySize > "$OUT/raw/malloc-$tag.txt" 2>/dev/null || true
      fi
      loop_end
      [ -n "$pid" ] && node "$H/native-summary.mjs" malloc "$OUT/raw/malloc-$tag.txt" "$NATIVE_LIBS" "$OUT/malloc-$tag.json" "$MALLOC_RUNS"
      echo "native $tag done" >&2
    done
  done
elif [ -z "${SKIP_NATIVE:-}" ]; then
  echo "native leaf and malloc passes use macOS sample/malloc_history; skipped on $(uname -s)" >&2
fi
echo "results in $OUT" >&2
