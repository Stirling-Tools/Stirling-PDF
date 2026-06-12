package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.math.BigDecimal;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.proprietary.model.api.ai.Verdict;
import stirling.software.proprietary.service.AiToolInputValidator;
import stirling.software.proprietary.service.MathAuditorOrchestrator;

/**
 * Public entry point for the Math Auditor Agent (mathAuditorAgent).
 *
 * <p>Accepts a PDF from the client, hands it to the {@link MathAuditorOrchestrator} which runs the
 * multi-round Java-Python negotiation, and returns the Auditor's {@link Verdict} as JSON.
 *
 * <p>This endpoint is a pure specialist - it produces the structured finding and nothing more.
 * Presentation (rendering as a chat answer, projecting to PDF comments, etc.) is the responsibility
 * of the caller (e.g. the orchestrator's {@code delegate_pdf_question} or {@code
 * delegate_pdf_review} meta-agents).
 *
 * <p>Lives under {@code /api/v1/ai/tools/} so it is dispatchable by the AI orchestrator via the
 * standard {@code InternalApiClient} allowlist - no special-case plumbing needed.
 *
 * <p>The raw PDF never leaves Java. Python receives only structured text and CSV data.
 */
@Slf4j
@ApplicationScoped
@Path("/api/v1/ai/tools")
@RequiredArgsConstructor
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class MathAuditorAgentController {

    private final MathAuditorOrchestrator orchestrator;

    @POST
    @Path("/math-auditor-agent")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Validate mathematical calculations in a PDF",
            description =
                    """
                    Analyses a PDF document for mathematical errors using the Math Auditor Agent.

                    The auditor checks:
                    - Table row and column totals (tally errors)
                    - Inline arithmetic expressions (e.g. "100 + 200 = 300")
                    - Cross-page figure consistency
                    - Prose claims about percentages, growth rates, and comparisons

                    Returns a JSON Verdict describing every discrepancy found. How the Verdict is
                    presented to the end user (chat answer, PDF annotations, etc.) is up to the
                    caller.

                    Input: PDF  Output: JSON  Type: SISO
                    """)
    public Response mathAuditorAgent(
            @Parameter(description = "The PDF document to audit", required = true)
                    @RestForm("fileInput")
                    FileUpload fileInput,
            @Parameter(
                            description =
                                    "Arithmetic tolerance - differences smaller than this are"
                                            + " ignored (default: 0.01)")
                    @RestForm("tolerance")
                    BigDecimal tolerance) {

        BigDecimal effectiveTolerance = tolerance != null ? tolerance : new BigDecimal("0.01");

        MultipartFile fileInputMpf = FileUploadMultipartFile.of(fileInput);
        AiToolInputValidator.validatePdfUpload(fileInputMpf);
        if (effectiveTolerance.compareTo(BigDecimal.ZERO) < 0) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }

        String safeName =
                fileInputMpf.getOriginalFilename() != null
                        ? fileInputMpf.getOriginalFilename().replaceAll("[\\r\\n]", "_")
                        : "<unnamed>";
        log.info("[math-auditor-agent] request file={} tolerance={}", safeName, effectiveTolerance);

        try {
            Verdict verdict = orchestrator.audit(fileInputMpf, effectiveTolerance);
            return Response.ok(verdict).build();
        } catch (IOException e) {
            log.error("[math-auditor-agent] IO error during audit", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }
}
