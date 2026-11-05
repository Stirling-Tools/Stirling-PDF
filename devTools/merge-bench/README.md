# Merge engine benchmark

How to reproduce the PDF merge comparison: PDFBox, JPDFium 1.3.0, JPDFium with a qpdf direct merge, and JPDFium PR 148 (native PDFium domain), each in-process and with 2 or 4 worker processes.

This folder holds only the harness. Results are not committed.

## What is being compared

| Label | Engine | Code |
|---|---|---|
| `pdfbox` mode | PDFBox `PDFMergerUtility` with the v2.0.0 size-based scratch cache | `Bench4.java` |
| `v130-normal` | JPDFium 1.3.0, today's `MergeJob` (PDFium opens every input, `PdfMerge.merge`) | `temp/pdf-worker-pool` |
| `v130-qpdf` | JPDFium 1.3.0, `MergeJob` with `-Djpdfium.merge.qpdfDirect=true` | `temp/merge-qpdf-direct` |
| `pr148-normal` | JPDFium PR 148 at `0ff9c36`, today's `MergeJob` | jars from `build-pr148.sh` |
| `pr148-qpdf` | JPDFium PR 148 at `0ff9c36`, qpdf direct | jars from `build-pr148.sh` |

Each JPDFium label runs as three modes: `jpdfium` (in-process), `pool2` and `pool4` (the `PdfWorkerPool` with 2 or 4 worker processes).

qpdf direct means PDFium only reads each input's page count and bookmarks, qpdf merges the original files outside the PDFium lock (`PdfMerge.mergeFilesToFile`), and PDFium re-adds bookmarks only when there are any (qpdf drops them).

## Branches

- `temp/pdf-worker-pool`: the worker pool (`app/common/.../pdf/worker/`), `MergeJob`, settings and tests.
- `temp/merge-qpdf-direct`: the above plus the benchmark-only `jpdfium.merge.qpdfDirect` switch in `MergeJob`. Not meant to merge as is.
- `temp/merge-bench-harness`: the above plus this folder.

JPDFium PR 148 is [Stirling-Tools/JPDFium#148](https://github.com/Stirling-Tools/JPDFium/pull/148), branch `feat/native-safe-domain`. The runs used its reviewed head `0ff9c36`, because the later merge commit `e45cb7e` fails CI with FFM binding drift.

## Files

- `pdfs/mkpdf.py <out> <pages> <side>`: N pages of uncompressed random RGB images.
- `pdfs/mktext.py <out> <pages>`: N pages of 55 Helvetica text lines, no compression. Byte-identical to the file used.
- `Bench4.java`: one benchmark cell. Prints one CSV line, including how many workers were really running.
- `Bench4 mkbm <in> <out>`: adds one bookmark every 10 pages (used for the bookmarked file).
- `Verify.java`: merges the bookmarked file 3 times and prints the page and bookmark counts, to check output is correct.
- `run-matrix.sh <label> <qpdf> <modes...>`: runs every cell for one label. `SMOKE=1` runs a quick check instead.
- `docker/Dockerfile`: Ubuntu 24.04 plus Temurin 25 plus the system libraries the PR 148 dev build links (including qpdf 11.9). All runs use this image so the base is the same.
- `build-pr148.sh`: builds the PR 148 `jpdfium` and `jpdfium-natives-linux-x64` jars in a container.
- `charts.src.html` and `build-charts.sh`: the self-contained charts page (data inlined).

## 1. Make the test PDFs

```bash
mkdir -p ~/merge-bench/pdfs && cd ~/merge-bench/pdfs
python -I /path/to/devTools/merge-bench/pdfs/mkpdf.py small1.pdf 1 180
python -I /path/to/devTools/merge-bench/pdfs/mkpdf.py large1.pdf 50 590
python -I /path/to/devTools/merge-bench/pdfs/mktext.py text1.pdf 2000
```

The bookmarked file is made from `text1.pdf` after step 2, with the app's PDFBox:

```bash
docker run --rm -v "$APP:/app:ro" -v "$PWD:/b" -v "$BENCH:/mb:ro" eclipse-temurin:25-jdk sh -c 'mkdir -p /tmp/c && javac -d /tmp/c -cp "/app/lib/*" /mb/Bench4.java && java -cp "/tmp/c:/app/lib/*" Bench4 mkbm /b/text1.pdf /b/bookmarked1.pdf'
```

`$BENCH` is this folder, and `$APP` is the extracted app from step 2.

## 2. Build the Stirling-PDF app for each JPDFium build

Check out `temp/merge-bench-harness`, then:

```bash
./gradlew :stirling-pdf:bootJar -x test
java -Djarmode=tools -jar app/core/build/libs/stirling-pdf-*.jar extract --destination ~/merge-bench/app-v130 --force
```

A build on Windows bundles only `jpdfium-natives-windows-x64`. Swap it for `jpdfium-natives-linux-x64-1.3.0.jar` (from a Linux build or Maven Central) in `app-v130/lib`.

For PR 148, copy the app and swap the two JPDFium jars:

```bash
./build-pr148.sh /path/to/JPDFium-feat-native-safe-domain ~/merge-bench/pr148-jars
cp -r ~/merge-bench/app-v130 ~/merge-bench/app-pr148
rm ~/merge-bench/app-pr148/lib/jpdfium-1.3.0.jar ~/merge-bench/app-pr148/lib/jpdfium-natives-linux-x64-1.3.0.jar
cp ~/merge-bench/pr148-jars/*.jar ~/merge-bench/app-pr148/lib/
```

The PR 148 checkout needs `native/dist/linux-x64` built first. It was built in the `jpdfium-native-dev` container, using JPDFium's own native build scripts. The unpinned `build-qpdf-native-crypto.sh` and `build-harfbuzz-no-glib.sh` were not run.

## 3. Build the bench image

```bash
docker build -t bench-pr148:1 devTools/merge-bench/docker
```

## 4. Check before the long run

Correct output, both builds, both merge paths (expect `pages=6000 outline=600`):

```bash
for app in app-v130 app-pr148; do for q in false true; do
  docker run --rm -v "$HOME/merge-bench/$app:/app:ro" -v "$HOME/merge-bench/pdfs:/b:ro" -v "$BENCH:/mb:ro" bench-pr148:1 \
    sh -c "java -Djpdfium.merge.qpdfDirect=$q --enable-native-access=ALL-UNNAMED -Dlogback.configurationFile=logback-pdf-worker.xml -cp '/app/lib/*' /mb/Verify.java"
done; done
```

Workers really start (the last-but-one column must equal the worker count, and the last column must be `ok`):

```bash
docker run --rm -e SMOKE=1 -v "$HOME/merge-bench/app-v130:/app:ro" -v "$HOME/merge-bench/pdfs:/b:ro" -v "$BENCH:/mb:ro" bench-pr148:1 sh /mb/run-matrix.sh v130-normal false jpdfium pool2 pool4
```

If natives fail to load in a worker, `PdfWorkerPool` falls back to in-process silently. `Bench4` marks those rows `WORKERS_NOT_LIVE`.

## 5. Run the matrix

Four containers ran at the same time on a 16-thread machine, each pinned to its own 4 CPUs with a 6 GB cap, so every family saw the same contention. `run-matrix.sh` writes CSV to stdout:

```bash
R=~/merge-bench/results; mkdir -p $R
run() { name=$1 cpus=$2 app=$3 q=$4; shift 4
  docker run -d --rm --name bench-$name --cpuset-cpus=$cpus --memory=6g \
    -v "$HOME/merge-bench/$app:/app:ro" -v "$HOME/merge-bench/pdfs:/b:ro" -v "$BENCH:/mb:ro" -v "$R:/out" bench-pr148:1 \
    sh -c "sh /mb/run-matrix.sh $name $q $* > /out/r-$name.csv 2> /out/r-$name.err"; }
run v130-normal 0-3 app-v130 false pdfbox jpdfium pool2 pool4
run v130-qpdf 4-7 app-v130 true jpdfium pool2 pool4
run pr148-normal 8-11 app-pr148 false jpdfium pool2 pool4
run pr148-qpdf 12-15 app-pr148 true jpdfium pool2 pool4
docker wait bench-v130-normal bench-v130-qpdf bench-pr148-normal bench-pr148-qpdf
```

Each cell is a fresh JVM with `-Xmx4g`: one warm-up round, then 3 measured rounds at 1 request at once, or 2 at 4 or 8. The cells are 4 file types (small, text, bookmarked, large) x 1, 3 or 5 copies merged x 1, 4 or 8 requests at once. Memory is the peak resident memory (`VmHWM`) of the server process plus every worker process.

## 6. Build the charts page

```bash
devTools/merge-bench/build-charts.sh ~/merge-bench/results ~/merge-bench/merge-shootout.html
```

The page has a ranked bar chart for one scenario, a heatmap of every scenario (times slower than the best), and a sortable table. It needs the network only for its Google Fonts.

## Known differences between builds

- 1.3.0 bundles its own qpdf. The PR 148 dev build links the system qpdf 11.9 from Ubuntu 24.04.
- With 1 file, JPDFium copies the input unchanged, while PDFBox re-saves it.
- The large and small PDFs are random image data, so a rebuild gives files of the same size and structure but not the same bytes.
