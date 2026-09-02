# Quarkus Docker image (e2e / full-tool)

`Dockerfile` here layers the Quarkus **uber runner-jar** onto the prebuilt base
image (`stirlingtools/stirling-pdf-base`, which already ships Java 25 +
LibreOffice + Tesseract + qpdf + Ghostscript + Calibre + Python).

This is the image the cucumber (behave) e2e suite under `testing/cucumber` runs
against. It is deliberately a **two-step** build so the image build stays fast
for the test loop (the jar is built once by Gradle, then layered in):

```bash
# from the repo root, with JDK 25 on the toolchain (host `java` may be 21)
export JAVA_HOME=/path/to/temurin-25

# 1. build the runner-jar (uber-jar; NOT app/core/build/libs/*.jar)
./gradlew :stirling-pdf:quarkusBuild -x test --console=plain
#    -> app/core/build/stirling-pdf-<version>-runner.jar

# 2. build the image (context = repo root)
docker build -f docker/quarkus/Dockerfile -t stirling-pdf-quarkus:full .

# 3. run it (login off = most API tests; cucumber hardcodes port 8080)
docker rm -f sp-e2e 2>/dev/null || true
docker run -d --name sp-e2e -p 8080:8080 \
  -e SECURITY_ENABLELOGIN=false -e METRICS_ENABLED=true \
  -e SYSTEM_DEFAULTLOCALE=en-US -e SYSTEM_MAXFILESIZE=100 \
  stirling-pdf-quarkus:full
# wait for: curl localhost:8080/api/v1/info/status  == {"version":...,"status":"UP"}
```

`build-and-run.sh` wraps those three steps (jar -> image -> container -> wait
healthy). Pass `--skip-jar` to reuse an already-built runner-jar.

## Versioned jar path

The Dockerfile defaults `ARG JAR_FILE=app/core/build/stirling-pdf-2.12.0-runner.jar`.
If the project version changes, override it:

```bash
docker build -f docker/quarkus/Dockerfile \
  --build-arg JAR_FILE=app/core/build/stirling-pdf-X.Y.Z-runner.jar \
  -t stirling-pdf-quarkus:full .
```

## Why not docker/embedded/Dockerfile?

That one is Spring-Boot-specific: it uses `java -Djarmode=tools ... extract
--layers` and copies `spring-boot-loader` layers, neither of which exist for a
Quarkus jar. Migrating `embedded/Dockerfile*` to Quarkus (full from-source
multi-stage build, for CI / `testing/test.sh`) is tracked separately.
