package stirling.software.common.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ProcessExecutor;

/**
 * Converts PDFs to Markdown by invoking the {@code pymupdf-convert} CLI tool as a separate
 * subprocess.
 *
 * <p>{@code pymupdf-convert} is a SEPARATE, AGPL-3.0 licensed program (see the {@code
 * pymupdf-worker/} directory). Stirling PDF invokes it as an ordinary OS subprocess — the same
 * pattern used for LibreOffice, Tesseract, and other external tools — so the AGPL copyleft attaches
 * to that program alone and does not extend to this MIT-licensed code. Do not replace this
 * subprocess boundary with an in-process import of PyMuPDF.
 */
@Slf4j
@Service
public class PyMuPdfConverter {

    private static final Duration AVAILABILITY_CACHE_TTL = Duration.ofSeconds(30);

    private final AtomicBoolean cachedAvailable = new AtomicBoolean(false);
    private final AtomicReference<Instant> cacheExpiry = new AtomicReference<>(Instant.EPOCH);

    /**
     * Returns {@code true} when {@code pymupdf-convert} is on PATH. Result is cached for {@link
     * #AVAILABILITY_CACHE_TTL} to avoid a shell probe on every conversion request.
     */
    public boolean isAvailable() {
        Instant now = Instant.now();
        if (now.isBefore(cacheExpiry.get())) {
            return cachedAvailable.get();
        }
        boolean result = probe();
        cachedAvailable.set(result);
        cacheExpiry.set(now.plus(AVAILABILITY_CACHE_TTL));
        return result;
    }

    private boolean probe() {
        boolean isWindows =
                System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("windows");
        List<String> cmd =
                isWindows
                        ? List.of("where", "pymupdf-convert")
                        : List.of("which", "pymupdf-convert");
        try {
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            boolean done = p.waitFor(5, TimeUnit.SECONDS);
            return done && p.exitValue() == 0;
        } catch (Exception e) {
            log.debug("pymupdf-convert availability check failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Convert a PDF to Markdown by invoking {@code pymupdf-convert} as a subprocess.
     *
     * @throws IOException on process failure or if the tool is not installed
     */
    public String convertToMarkdown(byte[] pdfBytes, String filename) throws IOException {
        String safeName =
                (filename == null || filename.isBlank())
                        ? "document.pdf"
                        : filename.replace("\"", "");
        Path tempDir = Files.createTempDirectory("stirling-pymupdf-");
        Path inputPdf = tempDir.resolve(safeName);
        Path outputMd = tempDir.resolve("output.md");
        try {
            Files.write(inputPdf, pdfBytes);
            ProcessExecutor.getInstance(ProcessExecutor.Processes.PYMUPDF_CONVERT)
                    .runCommandWithOutputHandling(
                            List.of(
                                    "pymupdf-convert",
                                    inputPdf.toAbsolutePath().toString(),
                                    outputMd.toAbsolutePath().toString()));
            return Files.readString(outputMd, StandardCharsets.UTF_8);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("PyMuPDF conversion interrupted", e);
        } finally {
            Files.deleteIfExists(inputPdf);
            Files.deleteIfExists(outputMd);
            Files.deleteIfExists(tempDir);
        }
    }
}
