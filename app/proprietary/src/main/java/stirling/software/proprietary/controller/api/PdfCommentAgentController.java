package stirling.software.proprietary.controller.api;

import java.io.IOException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
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
@ApplicationScoped
@Path("/api/v1/ai/tools")
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class PdfCommentAgentController {

    @Inject PdfCommentAgentOrchestrator orchestrator;
    @Inject ObjectMapper objectMapper;

    @POST
    @Path("/pdf-comment-agent")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces("application/pdf")
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
    public Response pdfCommentAgent(
            @Parameter(description = "The PDF document to annotate", required = true)
                    @RestForm("fileInput")
                    FileUpload fileInputUpload,
            @Parameter(
                            description =
                                    "Natural-language instructions for the AI - what to comment on",
                            required = true)
                    @RestForm("prompt")
                    String prompt)
            throws IOException {

        MultipartFile fileInput = FileUploadMultipartFile.of(fileInputUpload);

        String safeName =
                fileInput.getOriginalFilename() != null
                        ? fileInput.getOriginalFilename().replaceAll("[\\r\\n]", "_")
                        : "<unnamed>";
        log.info(
                "[pdf-comment-agent] request file={} promptLen={}",
                safeName,
                prompt == null ? 0 : prompt.length());

        // ResponseStatusException (validation errors) propagates to the default handler;
        // IOException is re-thrown to produce a 500. Other RuntimeExceptions likewise propagate.
        AnnotatedPdf annotated = orchestrator.applyComments(fileInput, prompt);
        return Response.ok(annotated.bytes())
                .type("application/pdf")
                .header(HttpHeaders.CONTENT_LENGTH, annotated.bytes().length)
                .header(
                        "Content-Disposition",
                        "form-data; name=\"attachment\"; filename=\""
                                + annotated.fileName()
                                + "\"")
                .header(AiToolResponseHeaders.TOOL_REPORT, buildReportHeader(annotated))
                .build();
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
