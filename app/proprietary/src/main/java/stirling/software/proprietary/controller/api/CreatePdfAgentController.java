package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Dispatchable tool that converts an AI-generated HTML string to a PDF via Puppeteer.
 *
 * <p>Called by {@link stirling.software.proprietary.service.AiWorkflowService} when the engine
 * emits a {@code CREATE_PDF_FROM_HTML_AGENT} plan step. The Node script is bundled as a classpath
 * resource and extracted to a temp location on first use.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/ai/tools")
@RequiredArgsConstructor
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class CreatePdfAgentController {

    private final TempFileManager tempFileManager;
    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final AtomicReference<Path> scriptPathRef = new AtomicReference<>();
    private final AtomicReference<String> puppeteerPathRef = new AtomicReference<>();

    @PostConstruct
    void extractScript() throws IOException {
        ClassPathResource resource = new ClassPathResource("scripts/html_to_pdf.mjs");
        Path scriptPath = Files.createTempFile("html_to_pdf_", ".mjs");
        try (InputStream in = resource.getInputStream()) {
            Files.copy(in, scriptPath, StandardCopyOption.REPLACE_EXISTING);
        }
        scriptPath.toFile().deleteOnExit();
        scriptPathRef.set(scriptPath);
        log.debug("[create-pdf-agent] Puppeteer script extracted to {}", scriptPath);

        // Resolve puppeteer at startup so CWD is stable and predictable.
        String puppeteerPath = resolvePuppeteerPath();
        puppeteerPathRef.set(puppeteerPath);
        if (puppeteerPath != null) {
            log.info("[create-pdf-agent] Puppeteer resolved at startup: {}", puppeteerPath);
        } else {
            log.warn(
                    "[create-pdf-agent] Puppeteer not found at startup; set PUPPETEER_MODULE_PATH"
                            + " if HTML-to-PDF conversion is needed");
        }
    }

    @PostMapping(value = "/create-pdf-from-html", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Convert AI-generated HTML to a PDF",
            description =
                    "Accepts an HTML document as a plain-text parameter and returns a PDF."
                            + " This endpoint is dispatched by the AI workflow orchestrator as a"
                            + " plan step; it is not intended for direct client use.")
    public ResponseEntity<Resource> createPdfFromHtml(
            @RequestParam("htmlContent") String htmlContent,
            @RequestParam("filename") String filename)
            throws Exception {

        TempFile htmlFile = tempFileManager.createManagedTempFile(".html");
        TempFile pdfFile = tempFileManager.createManagedTempFile(".pdf");
        try {
            Files.writeString(htmlFile.getPath(), htmlContent);

            log.info("[create-pdf-agent] running Puppeteer — html_bytes={}", htmlContent.length());

            ProcessBuilder pb =
                    new ProcessBuilder(
                            "node",
                            scriptPathRef.get().toString(),
                            htmlFile.getPath().toString(),
                            pdfFile.getPath().toString());
            pb.redirectErrorStream(true);
            String puppeteerPath = puppeteerPathRef.get();
            if (puppeteerPath != null) {
                pb.environment().put("PUPPETEER_MODULE_PATH", puppeteerPath);
            }
            Process process = pb.start();

            String output = new String(process.getInputStream().readAllBytes());
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new IOException(
                        "html_to_pdf.mjs exited with code " + exitCode + ": " + output);
            }

            byte[] pdfBytes = Files.readAllBytes(pdfFile.getPath());
            pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);

            String safeFilename = Filenames.toSimpleFileName(filename);
            if (safeFilename == null || safeFilename.isBlank() || !safeFilename.endsWith(".pdf")) {
                safeFilename = "generated-document.pdf";
            }

            log.info(
                    "[create-pdf-agent] PDF ready — filename={} bytes={}",
                    safeFilename,
                    pdfBytes.length);

            TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
            try {
                Files.write(tempOut.getPath(), pdfBytes);
            } catch (Exception e) {
                tempOut.close();
                throw e;
            }
            return WebResponseUtils.pdfFileToWebResponse(tempOut, safeFilename);
        } finally {
            htmlFile.close();
            pdfFile.close();
        }
    }

    /**
     * Resolve the puppeteer ESM entry point. Checks PUPPETEER_MODULE_PATH env var first, then walks
     * up from the JAR/class location to find {@code frontend/node_modules/puppeteer} (dev layout),
     * then falls back to common global npm locations.
     */
    private static String resolvePuppeteerPath() {
        String envOverride = System.getenv("PUPPETEER_MODULE_PATH");
        if (envOverride != null && !envOverride.isBlank()) {
            return envOverride;
        }

        // Walk up from the class location to find the repo root (contains frontend/ dir).
        // This is more reliable than relying on the JVM working directory.
        try {
            Path classLocation =
                    Paths.get(
                                    CreatePdfAgentController.class
                                            .getProtectionDomain()
                                            .getCodeSource()
                                            .getLocation()
                                            .toURI())
                            .toAbsolutePath();
            Path dir = classLocation;
            for (int i = 0; i < 10; i++) {
                Path candidate =
                        dir.resolve(
                                "frontend/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js");
                if (Files.exists(candidate)) {
                    return candidate.toString();
                }
                Path parent = dir.getParent();
                if (parent == null) break;
                dir = parent;
            }
        } catch (Exception e) {
            log.debug(
                    "[create-pdf-agent] Could not resolve puppeteer via class location: {}",
                    e.getMessage());
        }

        // Fallback: absolute global npm paths (Docker image).
        String[] absoluteCandidates = {
            "/usr/lib/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js",
            "/usr/local/lib/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js",
        };
        for (String candidate : absoluteCandidates) {
            if (Files.exists(Paths.get(candidate))) {
                return candidate;
            }
        }
        return null;
    }
}
