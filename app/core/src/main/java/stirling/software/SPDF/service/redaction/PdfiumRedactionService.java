package stirling.software.SPDF.service.redaction;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.PdfiumRedactionRegion;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.TempFileManager;

@Service
@Slf4j
@RequiredArgsConstructor
public class PdfiumRedactionService {

    private static final String FRONTEND_FOLDER_NAME = "frontend";
    private static final String SCRIPT_RELATIVE_PATH = "scripts/pdfium/redact.cjs";
    private static final String WASM_RELATIVE_PATH =
            "node_modules/@embedpdf/pdfium/dist/pdfium.wasm";
    private static final int MAX_DIRECTORY_SEARCH_DEPTH = 6;
    private static final long ENVIRONMENT_TTL_MS = Duration.ofMinutes(5).toMillis();

    private final ApplicationProperties applicationProperties;
    private final TempFileManager tempFileManager;
    private final ObjectMapper objectMapper;

    private final Object stateLock = new Object();
    private volatile EnvironmentState cachedState;

    @PostConstruct
    void configureObjectMapper() {
        objectMapper.enable(JsonGenerator.Feature.WRITE_BIGDECIMAL_AS_PLAIN);
    }

    public boolean isAvailable() {
        return resolveEnvironment().available;
    }

    public Optional<byte[]> redact(
            byte[] inputPdf, String originalFilename, List<PdfiumRedactionRegion> regions) {
        return redact(inputPdf, originalFilename, regions, false);
    }

    public Optional<byte[]> redact(
            byte[] inputPdf,
            String originalFilename,
            List<PdfiumRedactionRegion> regions,
            boolean drawBlackBoxes) {
        if (inputPdf == null || inputPdf.length == 0 || regions == null || regions.isEmpty()) {
            log.info(
                    "PDFium redact: early exit - inputPdf={}, regions={}",
                    inputPdf == null ? "null" : inputPdf.length + " bytes",
                    regions == null ? "null" : regions.size() + " regions");
            return Optional.empty();
        }

        EnvironmentState environment = resolveEnvironment();
        if (!environment.available) {
            log.warn("PDFium redact: environment not available");
            return Optional.empty();
        }

        File inputFile = null;
        File outputFile = null;
        File configFile = null;
        try {
            inputFile = tempFileManager.createTempFile(".pdf");
            outputFile = tempFileManager.createTempFile(".pdf");
            configFile = tempFileManager.createTempFile(".json");

            log.info(
                    "PDFium redact: writing {} bytes to temp input file: {}",
                    inputPdf.length,
                    inputFile.getAbsolutePath());
            Files.write(inputFile.toPath(), inputPdf);

            PdfiumCommandConfig config =
                    buildCommandConfig(
                            inputFile.toPath(),
                            outputFile.toPath(),
                            environment.wasmPath,
                            originalFilename,
                            regions,
                            drawBlackBoxes);
            objectMapper.writeValue(configFile, config);

            log.info(
                    "PDFium redact: config written to {} with {} operations covering {} regions (drawBlackBoxes={})",
                    configFile.getAbsolutePath(),
                    config.operations.size(),
                    regions.size(),
                    drawBlackBoxes);

            List<String> command =
                    List.of(
                            "node",
                            environment.scriptPath.toAbsolutePath().toString(),
                            "--config",
                            configFile.getAbsolutePath());

            log.info(
                    "PDFium redact: executing command in directory: {}",
                    environment.frontendDir.toFile().getAbsolutePath());

            ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFIUM_REDACTOR)
                    .runCommandWithOutputHandling(command, environment.frontendDir.toFile());

            if (!Files.exists(outputFile.toPath())) {
                log.error(
                        "PDFium redact: output file was not created at {}",
                        outputFile.getAbsolutePath());
                return Optional.empty();
            }

            byte[] processed = Files.readAllBytes(outputFile.toPath());
            log.info(
                    "PDFium redact: read {} bytes from output file (input was {} bytes)",
                    processed.length,
                    inputPdf.length);

            if (processed.length == 0) {
                log.warn("PDFium redact: output file is empty");
                return Optional.empty();
            }

            log.info("PDFium redact: SUCCESS - returning {} bytes", processed.length);
            return Optional.of(processed);
        } catch (IOException e) {
            log.warn("PDFium redaction failed: {}", e.getMessage());
            log.debug("PDFium redaction exception", e);
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("PDFium redaction interrupted: {}", e.getMessage());
            return Optional.empty();
        } finally {
            tempFileManager.deleteTempFile(inputFile);
            tempFileManager.deleteTempFile(outputFile);
            tempFileManager.deleteTempFile(configFile);
        }
    }

    private PdfiumCommandConfig buildCommandConfig(
            Path inputPath,
            Path outputPath,
            Path wasmPath,
            String originalFilename,
            List<PdfiumRedactionRegion> regions,
            boolean drawBlackBoxes) {
        PdfiumCommandConfig config = new PdfiumCommandConfig();
        config.inputPath = inputPath.toAbsolutePath().toString();
        config.outputPath = outputPath.toAbsolutePath().toString();
        config.wasmPath = wasmPath.toAbsolutePath().toString();
        config.originalName =
                StringUtils.hasText(originalFilename) ? originalFilename : "document.pdf";
        config.drawBlackBoxes = drawBlackBoxes;
        config.operations = groupRegions(regions);
        return config;
    }

    private List<PageRedaction> groupRegions(List<PdfiumRedactionRegion> regions) {
        Map<Integer, PageRedaction> grouped = new LinkedHashMap<>();
        int skippedCount = 0;

        for (PdfiumRedactionRegion region : regions) {
            if (region == null || region.getWidth() <= 0 || region.getHeight() <= 0) {
                skippedCount++;
                log.debug("Skipping invalid region: {}", region);
                continue;
            }
            PageRedaction page =
                    grouped.computeIfAbsent(
                            region.getPageIndex(),
                            idx -> {
                                PageRedaction redaction = new PageRedaction();
                                redaction.pageIndex = idx;
                                redaction.rects = new ArrayList<>();
                                return redaction;
                            });

            RectSpec rect = new RectSpec();
            rect.origin = new Point(region.getX(), region.getY());
            rect.size = new Size(region.getWidth(), region.getHeight());
            page.rects.add(rect);

            log.info(
                    "Grouped region for PDFium: page={} origin=({},{}) size=({},{})",
                    region.getPageIndex(),
                    region.getX(),
                    region.getY(),
                    region.getWidth(),
                    region.getHeight());
        }

        grouped.values().removeIf(page -> page.rects == null || page.rects.isEmpty());

        log.info(
                "PDFium region grouping: {} input regions -> {} page operations ({} skipped)",
                regions.size(),
                grouped.size(),
                skippedCount);

        return new ArrayList<>(grouped.values());
    }

    private EnvironmentState resolveEnvironment() {
        EnvironmentState state = cachedState;
        long now = System.currentTimeMillis();
        if (state != null && (now - state.checkedAt) < ENVIRONMENT_TTL_MS) {
            return state;
        }
        synchronized (stateLock) {
            state = cachedState;
            now = System.currentTimeMillis();
            if (state != null && (now - state.checkedAt) < ENVIRONMENT_TTL_MS) {
                return state;
            }
            EnvironmentState refreshed = computeEnvironmentState();
            cachedState = refreshed;
            return refreshed;
        }
    }

    private EnvironmentState computeEnvironmentState() {
        long checkedAt = System.currentTimeMillis();
        try {
            Path frontendDir = locateFrontendDirectory();
            if (frontendDir == null) {
                String reason = "Unable to locate frontend directory";
                log.warn(reason);
                return EnvironmentState.unavailable(reason, checkedAt);
            }

            Path scriptPath = frontendDir.resolve(SCRIPT_RELATIVE_PATH).normalize();
            if (!Files.isRegularFile(scriptPath)) {
                String reason =
                        "PDFium redaction script not found at " + scriptPath.toAbsolutePath();
                log.warn(reason);
                return EnvironmentState.unavailable(reason, checkedAt);
            }

            Path wasmPath = frontendDir.resolve(WASM_RELATIVE_PATH).normalize();
            if (!Files.isRegularFile(wasmPath)) {
                String reason = "PDFium wasm asset not found at " + wasmPath.toAbsolutePath();
                log.warn(reason);
                return EnvironmentState.unavailable(reason, checkedAt);
            }

            if (!isNodeAvailable(frontendDir)) {
                String reason = "Node.js executable not found in PATH";
                log.warn(reason);
                return EnvironmentState.unavailable(reason, checkedAt);
            }

            log.info("PDFium redaction environment ready (frontend path: {})", frontendDir);
            return EnvironmentState.available(frontendDir, scriptPath, wasmPath, checkedAt);
        } catch (Exception e) {
            String reason = "Failed to initialize PDFium redaction: " + e.getMessage();
            log.warn(reason);
            log.debug("PDFium environment initialization error", e);
            return EnvironmentState.unavailable(reason, checkedAt);
        }
    }

    private Path locateFrontendDirectory() {
        String configured =
                applicationProperties
                        .getSystem()
                        .getCustomPaths()
                        .getOperations()
                        .getEmbedpdfFrontend();
        if (StringUtils.hasText(configured)) {
            Path configuredPath = Paths.get(configured).toAbsolutePath().normalize();
            if (Files.isDirectory(configuredPath)) {
                return configuredPath;
            }
            log.warn("Configured embedpdfFrontend path does not exist: {}", configuredPath);
        }

        Path current = Paths.get("").toAbsolutePath();
        for (int depth = 0; depth < MAX_DIRECTORY_SEARCH_DEPTH && current != null; depth++) {
            Path candidate = current.resolve(FRONTEND_FOLDER_NAME);
            if (Files.isDirectory(candidate)) {
                return candidate.normalize();
            }
            current = current.getParent();
        }
        return null;
    }

    private boolean isNodeAvailable(Path workingDirectory) {
        try {
            Process process =
                    new ProcessBuilder("node", "-v").directory(workingDirectory.toFile()).start();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.debug("Node.js availability check failed: {}", e.getMessage());
            return false;
        }
    }

    private static final class EnvironmentState {
        private final boolean available;
        private final Path frontendDir;
        private final Path scriptPath;
        private final Path wasmPath;
        private final long checkedAt;

        @SuppressWarnings("unused")
        private final String message;

        private EnvironmentState(
                boolean available,
                Path frontendDir,
                Path scriptPath,
                Path wasmPath,
                long checkedAt,
                String message) {
            this.available = available;
            this.frontendDir = frontendDir;
            this.scriptPath = scriptPath;
            this.wasmPath = wasmPath;
            this.checkedAt = checkedAt;
            this.message = message;
        }

        static EnvironmentState unavailable(String message, long checkedAt) {
            return new EnvironmentState(false, null, null, null, checkedAt, message);
        }

        static EnvironmentState available(
                Path frontendDir, Path scriptPath, Path wasmPath, long checkedAt) {
            return new EnvironmentState(true, frontendDir, scriptPath, wasmPath, checkedAt, null);
        }
    }

    @SuppressWarnings("unused")
    private static class PdfiumCommandConfig {
        public String inputPath;
        public String outputPath;
        public String wasmPath;
        public String originalName;
        public boolean drawBlackBoxes;
        public List<PageRedaction> operations;
    }

    @SuppressWarnings("unused")
    private static class PageRedaction {
        public int pageIndex;
        public List<RectSpec> rects;
    }

    @SuppressWarnings("unused")
    private static class RectSpec {
        public Point origin;
        public Size size;
    }

    @SuppressWarnings("unused")
    private static class Point {
        public double x;
        public double y;

        Point() {}

        Point(double x, double y) {
            this.x = x;
            this.y = y;
        }
    }

    @SuppressWarnings("unused")
    private static class Size {
        public double width;
        public double height;

        Size() {}

        Size(double width, double height) {
            this.width = width;
            this.height = height;
        }
    }
}
