package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
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

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Dispatchable tool that converts an AI-generated HTML string to a PDF via WeasyPrint.
 *
 * <p>Called by {@link stirling.software.proprietary.service.AiWorkflowService} when the engine
 * emits a {@code CREATE_PDF_FROM_HTML_AGENT} plan step. The HTML comes from a trusted Jinja
 * template so sanitization is intentionally skipped.
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
    private final RuntimePathConfig runtimePathConfig;

    /**
     * Returns true only when WeasyPrint is definitively unavailable — either the binary could not
     * be launched at all, or it launched but immediately failed to load a required system library.
     * Other conversion failures (bad HTML, output errors, etc.) return false so they surface as
     * real errors rather than a misleading "dependency missing" message.
     */
    private static boolean isMissingDependencyError(IOException e) {
        String msg = e.getMessage();
        if (msg == null) return false;
        // OS could not start the process — binary not on PATH or not at the configured path.
        if (msg.contains("Cannot run program")) return true;
        // Process started but crashed immediately loading a shared library.
        // "cannot load library" — Python/cffi error (Linux and macOS via pip)
        // "Library not loaded" / "image not found" — macOS dyld error (Homebrew installs)
        String lower = msg.toLowerCase();
        if (lower.contains("cannot load library")) return true;
        if (lower.contains("library not loaded")) return true;
        if (lower.contains("image not found")) return true;
        return false;
    }

    @PostMapping(
            value = "/create-pdf-from-html-agent",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
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

        log.info(
                "[create-pdf-agent] converting HTML to PDF via WeasyPrint — html_bytes={}",
                htmlContent.length());

        try (TempFile htmlFile = tempFileManager.createManagedTempFile(".html");
                TempFile pdfFile = tempFileManager.createManagedTempFile(".pdf")) {

            Files.writeString(htmlFile.getPath(), htmlContent, StandardCharsets.UTF_8);

            List<String> command = new ArrayList<>();
            command.add(runtimePathConfig.getWeasyPrintPath());
            command.add("-e");
            command.add("utf-8");
            command.add("-v");
            // SSRF: the HTML is self-contained and the engine validates style colours, so no
            // external url() reaches WeasyPrint. For full isolation, run it network-isolated.
            command.add(htmlFile.getAbsolutePath());
            command.add(pdfFile.getAbsolutePath());

            try {
                ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                        .runCommandWithOutputHandling(command);
            } catch (IOException e) {
                if (isMissingDependencyError(e)) {
                    throw new IOException(
                            "AI document creation is not available on this server because a required"
                                    + " system dependency is not installed. Please contact your"
                                    + " system administrator.");
                }
                throw e;
            }

            String safeFilename = Filenames.toSimpleFileName(filename);
            if (safeFilename == null || safeFilename.isBlank() || !safeFilename.endsWith(".pdf")) {
                safeFilename = "generated-document.pdf";
            }

            // Stamp the standard Stirling metadata onto the WeasyPrint output and write the result
            // straight to the response temp file. Loading from the file and saving to the file
            // avoids materialising the whole document as a byte[] twice (read-all + re-serialise),
            // which matters for large generated documents.
            TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
            try (PDDocument document = pdfDocumentFactory.load(pdfFile.getPath())) {
                document.save(tempOut.getPath().toFile());
            } catch (Exception e) {
                tempOut.close();
                throw e;
            }

            log.info(
                    "[create-pdf-agent] PDF ready — filename={} bytes={}",
                    safeFilename,
                    Files.size(tempOut.getPath()));

            return WebResponseUtils.pdfFileToWebResponse(tempOut, safeFilename);
        }
    }
}
