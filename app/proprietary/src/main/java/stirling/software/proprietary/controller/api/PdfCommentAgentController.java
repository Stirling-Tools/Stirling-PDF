package stirling.software.proprietary.controller.api;

import java.io.IOException;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
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

import stirling.software.proprietary.service.AiToolResponseHeaders;
import stirling.software.proprietary.service.PdfCommentAgentOrchestrator;
import stirling.software.proprietary.service.PdfCommentAgentOrchestrator.AnnotatedPdf;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Public entry point for the PDF Comment Agent (pdfCommentAgent).
 *
 * <p>Accepts a PDF and a natural-language prompt, delegates to {@link PdfCommentAgentOrchestrator}
 * which consults the Python engine and applies {@code PDAnnotationText} sticky-note annotations,
 * then streams the annotated PDF back in the response body. This shape matches the rest of the
 * Stirling tool endpoints ({@code /api/v1/misc/*}, {@code /api/v1/general/*}) and is what the AI
 * workflow orchestrator expects when dispatching this tool as a plan step.
 *
 * <p>The raw PDF never leaves Java. Python only receives positioned text chunks.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai/tools")
@RequiredArgsConstructor
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class PdfCommentAgentController {

    private final PdfCommentAgentOrchestrator orchestrator;
    private final ObjectMapper objectMapper;

    @PostMapping(
            value = "/pdf-comment-agent",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_PDF_VALUE)
    @Operation(
            summary = "Annotate a PDF with AI-generated sticky-note comments",
            description =
                    """
                    Runs the PDF Comment Agent against the supplied PDF. Java extracts positioned
                    text chunks from the document, ships them (with the user's prompt) to the
                    AI engine, then applies the returned comments as standard PDF Text
                    annotations (sticky notes) anchored to the relevant chunks.

                    The annotated PDF is streamed back in the response body with
                    Content-Type: application/pdf.

                    Input: PDF + prompt  Output: PDF  Type: SISO
                    """)
    public ResponseEntity<Resource> pdfCommentAgent(
            @Parameter(description = "The PDF document to annotate", required = true)
                    @RequestParam("fileInput")
                    MultipartFile fileInput,
            @Parameter(
                            description =
                                    "Natural-language instructions for the AI — what to comment on",
                            required = true)
                    @RequestParam("prompt")
                    String prompt)
            throws IOException {

        String safeName =
                fileInput.getOriginalFilename() != null
                        ? fileInput.getOriginalFilename().replaceAll("[\\r\\n]", "_")
                        : "<unnamed>";
        log.info(
                "[pdf-comment-agent] request file={} promptLen={}",
                safeName,
                prompt == null ? 0 : prompt.length());

        // ResponseStatusException (validation errors) propagates to Spring's default handler;
        // IOException is re-thrown to produce a 500. Other RuntimeExceptions likewise propagate.
        AnnotatedPdf annotated = orchestrator.applyComments(fileInput, prompt);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", annotated.fileName());
        headers.setContentLength(annotated.bytes().length);
        headers.set(AiToolResponseHeaders.TOOL_REPORT, buildReportHeader(annotated));
        return ResponseEntity.ok().headers(headers).body(new ByteArrayResource(annotated.bytes()));
    }

    /**
     * Build the metadata JSON surfaced in {@link AiToolResponseHeaders#TOOL_REPORT} alongside the
     * annotated PDF. Kept small (fits comfortably in a header): counts and the agent's rationale so
     * a chat UI can show "Added 3 comments: <rationale>" alongside the downloaded file.
     */
    private String buildReportHeader(AnnotatedPdf annotated) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("annotationsApplied", annotated.annotationsApplied());
        node.put("instructionsReceived", annotated.instructionsReceived());
        if (annotated.rationale() != null) {
            node.put("rationale", annotated.rationale());
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception e) {
            log.warn("Failed to serialise pdf-comment-agent report header: {}", e.getMessage());
            return "{\"annotationsApplied\":" + annotated.annotationsApplied() + "}";
        }
    }
}
