package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.service.AiToolInputValidator;
import stirling.software.proprietary.service.PdfToMarkdownOrchestrator;

/**
 * Public entry point for the PDF-to-Markdown Agent.
 *
 * <p>Accepts a PDF, delegates to {@link PdfToMarkdownOrchestrator} which chunks the layout data and
 * calls the Python engine in parallel, then streams the reconstructed Markdown back as a download.
 *
 * <p>Lives under {@code /api/v1/ai/tools/} so it is dispatchable by the AI orchestrator via the
 * standard {@code InternalApiClient} allowlist — no special-case plumbing needed.
 *
 * <p>The raw PDF never leaves Java. Python receives only structured text and layout data.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai/tools")
@RequiredArgsConstructor
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class PdfToMarkdownAgentController {

    private final PdfToMarkdownOrchestrator orchestrator;

    @PostMapping(value = "/pdf-to-markdown-agent", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Convert a PDF to Markdown using AI",
            description =
                    """
                    Extracts the structure and content of a PDF and reconstructs it as Markdown.

                    Java parses the PDF into layout and table data, sends it to the AI engine
                    in parallel chunks, and reassembles the Markdown in page order.

                    Accepts an optional user message to guide extraction style or focus.

                    Input: PDF  Output: Markdown  Type: SISO
                    """)
    public ResponseEntity<Resource> pdfToMarkdownAgent(
            @Parameter(description = "The PDF document to convert", required = true)
                    @RequestParam("fileInput")
                    MultipartFile fileInput,
            @Parameter(description = "Optional instructions to guide the Markdown extraction")
                    @RequestParam(value = "userMessage", defaultValue = "")
                    String userMessage) {

        AiToolInputValidator.validatePdfUpload(fileInput);
        String safeName =
                fileInput.getOriginalFilename() != null
                        ? fileInput.getOriginalFilename().replaceAll("[\\r\\n]", "_")
                        : "<unnamed>";
        log.info("[pdf-to-markdown-agent] request file={}", safeName);

        try {
            List<Resource> results = orchestrator.execute(fileInput, userMessage);
            if (results.isEmpty()) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
            }
            Resource result = results.getFirst();
            String filename = result.getFilename() != null ? result.getFilename() : "output.md";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentDisposition(
                    ContentDisposition.attachment().filename(filename).build());
            return ResponseEntity.ok()
                    .headers(headers)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(result);
        } catch (IOException e) {
            log.error("[pdf-to-markdown-agent] IO error during conversion", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
