#!/bin/sh
# usage: build-charts.sh <results dir> <out.html>; merges r-*.csv into one self-contained charts page.
R=$1; OUT=$2; H="$(cd "$(dirname "$0")" && pwd)"
{ echo "label,mode,conc,type,files,median_ms,max_ms,wall_ms,peak_server_mb,peak_total_mb,workers_live,status"; cat "$R"/r-*.csv | grep -v '^mode,'; } > "$R/all-runs.csv"
node -e '
const fs=require("fs");const [src,csv,out]=process.argv.slice(1);
const page=fs.readFileSync(src,"utf8").replace("/*CSV*/",()=>fs.readFileSync(csv,"utf8"));
fs.writeFileSync(out,"<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><style>body{margin:0}[hidden]{display:none!important}</style>\n"+page.replace("<div class=\"wrap\">","</head><body>\n<div class=\"wrap\">")+"\n</body></html>\n");' "$H/charts.src.html" "$R/all-runs.csv" "$OUT"
