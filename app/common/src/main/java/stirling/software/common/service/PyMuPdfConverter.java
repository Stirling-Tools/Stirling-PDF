package stirling.software.common.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ProcessExecutor;

/**
 * Converts PDFs to Markdown by invoking the {@code pymupdf-convert} CLI tool as a separate
 * subprocess.
 */
@Slf4j
@Service
public class PyMuPdfConverter {

    private boolean available;

    @PostConstruct
    void init() {
        available = probe();
        if (available) {
            log.info("pymupdf-convert found — PyMuPDF Markdown conversion enabled.");
        } else {
            log.info("pymupdf-convert not found — PyMuPDF Markdown conversion disabled.");
        }
    }

    public boolean isAvailable() {
        return available;
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
