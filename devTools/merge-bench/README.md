# JPDFium operation benchmark

How to reproduce the comparison of every JPDFium operation Stirling-PDF uses against its PDFBox path, for JPDFium 1.3.0 and JPDFium PR 148 (native PDFium domain), plus the merge variants: qpdf direct and the PDF worker pool.

This folder holds only the harness. Results are not committed.

## What is being compared

Each operation copies the JPDFium and PDFBox calls of the controller that uses it (`PdfOps.java`).

| Op | App entry point | JPDFium | PDFBox |
|---|---|---|---|
| `merge` | `MergeController` → `MergeJob` | `jpdfium` in-process, `poolN` worker processes | `PDFMergerUtility` with the size-based scratch cache |
| `pagecount` | `InstanceEntitlementInterceptor`, `DefaultDocumentClassifier` | `PdfDocument.open(Path).pageCount()` | `Loader.loadPDF` + `getNumberOfPages` |
| `split` | `SplitPDFController` (10 equal parts, zipped) | `extractPageRange` + `save`; `jpdfium-file` is `extractPageRangeToFile`, which the app does not use | reload per part, `removePage`, `pruneOrphanedFormFields`, save (the app's AcroForm path) |
| `splitsize` | `SplitPdfBySizeController` (¼ of the file) | `computeSizeRanges` probes, then one save per range | none |
| `redact` | `RedactController` auto-redact, one term per page | `PdfRedactor.redact` with the controller's options | `findTextToRedact` + `redactFoundText` fallback (boxes only) |
| `text` | under markdown and DocParse | `PdfTextExtractor.extractAll` | `PDFTextStripper.getText` |
| `markdown` | `ConvertPDFToMarkdown`, `DocParseService` | `PdfMarkdownConverter` (`jpdfium`), `AdvancedPdfMarkdownConverter` (`jpdfium-adv`) | none |
| `render` | `PageRasterizer` for form detection, 20 pages | `renderAt(dpi)` to RGBA | `PDFRenderer.renderImageWithDPI` |
| `protect` | `PasswordController` restore protection | `PdfSecurity.copyEncryption` | `protect` + `save` |

Builds are labels:

| Label | Build |
|---|---|
| `v130` | JPDFium 1.3.0, the app as on `temp/merge-qpdf-direct` |
| `v130-qpdf` | the same with `-Djpdfium.merge.qpdfDirect=true` (merge only) |
| `pr148` | JPDFium PR 148 at `0ff9c36` |
| `pr148-qpdf` | PR 148 with qpdf direct (merge only) |

qpdf direct means PDFium only reads each input's page count and bookmarks, qpdf merges the original files outside the PDFium lock (`PdfMerge.mergeFilesToFile`), and PDFium re-adds bookmarks only when there are any.

## Branches

- `temp/pdf-worker-pool`: the worker pool (`app/common/.../pdf/worker/`), `MergeJob`, settings and tests.
- `temp/merge-qpdf-direct`: the above plus the benchmark-only `jpdfium.merge.qpdfDirect` switch in `MergeJob`. Not meant to merge as is.
- `temp/merge-bench-harness`: the above plus this folder.

JPDFium PR 148 is [Stirling-Tools/JPDFium#148](https://github.com/Stirling-Tools/JPDFium/pull/148), branch `feat/native-safe-domain`. The runs used `0ff9c36`, because the later merge commit `e45cb7e` fails CI with FFM binding drift.

## Files

- `pdfs/mkpdf.py <out> <pages> <side>`: N pages of uncompressed random RGB images.
- `pdfs/mktext.py <out> <pages> [flate]`: N pages of 55 Helvetica text lines; `flate` deflates the content streams.
- `PdfOps.java`: the operations above.
- `PdfBench.java`: one cell per JVM (`bench`), a JFR recording around N runs (`profile`), a loop external tools attach to (`loop`), and `mkbm <in> <out>`, which adds one bookmark every 10 pages.
- `PhaseBench.java`: times merge load, append/import, save and close separately for PDFBox and JPDFium, plus JPDFium's file-backed `mergeFilesToFile` and an open-only pass.
- `JfrSummary.java`: turns a recording into top CPU frames (native and Java), allocated classes and allocation stacks.
- `native-summary.mjs`: summarises macOS `sample` output (self time under the JPDFium libraries) and `malloc_history -allBySize` output (live native heap per run, PartitionAlloc reservations split out).
- `run-bench.sh <app dir> <results dir>`: runs all of the above for one build.
- `build-report.mjs <results dir> <out.html>`: builds the self-contained report from every build in the results folder. An `analysis.html` fragment in the results folder is shown as the "What to improve" section.
- `Verify.java`: merges a bookmarked file 3 times and prints the page and bookmark counts.
- `build-pr148.sh`: builds the PR 148 `jpdfium` and `jpdfium-natives-linux-x64` jars in a container.
- `docker/Dockerfile`: Ubuntu 24.04 plus Temurin 25 plus the system libraries the PR 148 Linux build links.

## 1. Build the Stirling-PDF app for each JPDFium build

```bash
./gradlew :stirling-pdf:bootJar -x test
java -Djarmode=tools -jar app/core/build/libs/stirling-pdf-*.jar extract --destination ~/merge-bench/app-v130 --force
```

The build bundles the natives for the machine it runs on (`-PjpdfiumPlatforms=linux-x64` and so on picks others).

### PR 148 on macOS

PDFium comes prebuilt from JPDFium's own release; only the bridge is compiled. In a throwaway clone of JPDFium at `0ff9c36`:

```bash
brew install cmake pkgconf libunibreak qpdf harfbuzz icu4c@79 freetype pcre2 pugixml
bash native/fetch-prebuilt-pdfium.sh darwin-arm64
PKG_CONFIG_PATH="$(brew --prefix icu4c@79)/lib/pkgconfig:$(brew --prefix)/lib/pkgconfig" JPDFIUM_OCR=0 bash native/build-real.sh
./gradlew -q :jpdfium:jar :jpdfium-natives:jpdfium-natives-darwin-arm64:jar -x test
```

Then copy the app and swap the two JPDFium jars:

```bash
cp -R ~/merge-bench/app-v130 ~/merge-bench/app-pr148
rm ~/merge-bench/app-pr148/lib/jpdfium-1.3.0.jar ~/merge-bench/app-pr148/lib/jpdfium-natives-darwin-arm64-1.3.0.jar
cp jpdfium/build/libs/jpdfium-*.jar jpdfium-natives/jpdfium-natives-darwin-arm64/build/libs/*.jar ~/merge-bench/app-pr148/lib/
```

This dev build links Homebrew's qpdf, harfbuzz, ICU and freetype instead of bundling them, so it only runs on a machine that has them. For Linux, `build-pr148.sh` does the jar step in a container once `native/dist/linux-x64` is built.

## 2. Run each build

```bash
H=devTools/merge-bench R=~/merge-bench/results; export PDFS=~/merge-bench/pdfs
LABEL=v130 sh $H/run-bench.sh ~/merge-bench/app-v130 $R
LABEL=v130-qpdf QPDF=true OPS=merge SKIP_PDFBOX=1 SKIP_PHASES=1 sh $H/run-bench.sh ~/merge-bench/app-v130 $R
LABEL=pr148 SKIP_PDFBOX=1 sh $H/run-bench.sh ~/merge-bench/app-pr148 $R
LABEL=pr148-qpdf QPDF=true OPS=merge SKIP_PDFBOX=1 SKIP_PHASES=1 sh $H/run-bench.sh ~/merge-bench/app-pr148 $R
```

Run the builds one after another, not at once, so they do not share CPUs. `sh` reads a script as it runs, so do not edit `run-bench.sh` during a run; run a copy if you are changing the harness. PDFBox runs once (the first build) because every build ships the same PDFBox jars.

The test PDFs are made in `$PDFS` on first use: `small` (1 page, ~70 KB), `text` (2,000 pages, ~1.3 MB, merge only), `text200` (200 pages, the text workload for every other op) and `image` (30 pages, ~12 MB).

A run has four passes, each skippable with `SKIP_TIMING`, `SKIP_PROFILE`, `SKIP_PHASES` or `SKIP_NATIVE`:

1. **Timing.** For every op in `OPS`, each file type, each `CONC` (`1 4`) and each engine, a fresh JVM (`-Xmx4g`) runs `WARMUP` rounds (2), then `ROUNDS` measured rounds (2), one run per concurrent request per round. Merge also varies the file count (`MERGE_FILES`, `1 3 5`). It records median and slowest latency, CPU per run and CPU/wall (the JVM plus worker processes), peak heap after a reset before the measured rounds, peak RSS of the JVM plus every worker (`VmHWM` on Linux, lifetime-max physical footprint on macOS), and how many pool workers were really running (`WORKERS_NOT_LIVE` otherwise). A failure, such as a method missing from a JPDFium build, is recorded as a `FAILED` row with the exception.
2. **JFR profile.** For each `PROFILE_CASES` entry (`op:type:files`), every in-process engine runs 2 warm-ups and then `PROFILE_RUNS` (10) inside a JFR recording: `settings=profile`, 5 ms execution and native sampling, and exact TLAB allocation events with stacks.
3. **Phases.** `PhaseBench` for the merge cases, median of `PHASE_ROUNDS` (5).
4. **Native (macOS only).** For each profile case and JPDFium engine: `sample` at 1 ms over `LEAF_SECONDS` (10) of back-to-back runs, then `MallocStackLogging=1` and `malloc_history -allBySize` after `MALLOC_RUNS` (10). `NATIVE_LIBS` picks which libraries count as JPDFium. Skipped on Linux.

Raw recordings and logs land in `<results>/raw/`.

## 3. Build the report

```bash
node devTools/merge-bench/build-report.mjs ~/merge-bench/results ~/merge-bench/jpdfium-profile.html
```

The page opens with every operation at a glance (median latency per build against PDFBox), the optional analysis, and the gaps the data shows (failures, paths slower than PDFBox, no fallback, native hot spots). An operation picker then drives charts per file type (time, CPU, peak heap or peak RSS, at each concurrency), the cost table, the JFR CPU and allocation profiles, allocation pressure and the native leaf profile; merge also has its phase breakdown. It loads d3 from cdnjs.

## Docker

To compare on Linux with the same base for every build, build the image (`docker build -t bench-pr148:1 devTools/merge-bench/docker`) and run `run-bench.sh` inside it with the app, PDFs, results and this folder mounted. The image has no Node, so build the report on the host. Pin each container to its own CPUs (`--cpuset-cpus`) and cap memory if several run at once.

## Check merge output

Make a bookmarked file with `PdfBench mkbm text.pdf bookmarked1.pdf`, then check both merge paths (expect `pages=6000 outline=600`):

```bash
for q in false true; do
  docker run --rm -v "$HOME/merge-bench/app-v130:/app:ro" -v "$HOME/merge-bench/pdfs:/b:ro" -v "$BENCH:/mb:ro" bench-pr148:1 \
    sh -c "java -Djpdfium.merge.qpdfDirect=$q --enable-native-access=ALL-UNNAMED -Dlogback.configurationFile=logback-pdf-worker.xml -cp '/app/lib/*' /mb/Verify.java"
done
```

## Known differences between builds

- 1.3.0 bundles its own qpdf. The PR 148 dev builds link the system qpdf (Homebrew 12.4 on macOS, Ubuntu 11.9 in Docker).
- PR 148 removes `PdfSecurity.copyEncryption`, which restore protection calls, so `protect` fails on it.
- With 1 file, JPDFium merge copies the input unchanged, while PDFBox re-saves it.
- The PDFBox redaction fallback only draws boxes; the text stays in the file. It is a speed reference, not an equivalent.
- The image PDFs are random data, so a rebuild gives files of the same size and structure but not the same bytes.
