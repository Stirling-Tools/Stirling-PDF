#!/bin/sh
# usage: run-matrix.sh <label> <qpdf:true|false> <modes...>; set SMOKE=1 for a quick check
label=$1; q=$2; shift 2
mkdir -p /tmp/c && javac -d /tmp/c -cp '/app/lib/*' /mb/Bench4.java || exit 1
CP="/tmp/c:/app/lib/*"
O="-Xmx4g --enable-native-access=ALL-UNNAMED -Djava.io.tmpdir=/tmp -Dlogback.configurationFile=logback-pdf-worker.xml -Djpdfium.merge.qpdfDirect=$q"
java $O -cp "$CP" Bench4 $label jpdfium 1 1 /b/small1.pdf 1 >/dev/null 2>&1
if [ -n "$SMOKE" ]; then for m in "$@"; do java $O -cp "$CP" Bench4 $label $m 2 1 /b/bookmarked1.pdf 3 2>&1 | grep -E "^$label|Exception" | head -3; done; exit 0; fi
for type in small text bookmarked large; do for files in 1 3 5; do for conc in 1 4 8; do
  rounds=3; [ $conc -gt 1 ] && rounds=2
  for m in "$@"; do
    timeout 1200 java $O -cp "$CP" Bench4 $label $m $conc $rounds /b/${type}1.pdf $files 2>>/tmp/err.log | grep -E "^$label," || echo "$label,$m,$conc,$type,$files,,,,,,,TIMEOUT"
  done; done; done; done
grep -iE "exception|error" /tmp/err.log | sort | uniq -c | head -8 >&2
