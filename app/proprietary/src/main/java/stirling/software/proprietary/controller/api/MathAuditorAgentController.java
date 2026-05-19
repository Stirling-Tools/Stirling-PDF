package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.math.BigDecimal;

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

import stirling.software.proprietary.model.api.ai.Verdict;
import stirling.software.proprietary.service.AiToolInputValidator;
import stirling.software.proprietary.service.MathAuditorOrchestrator;

/**
 * Public entry point for the Math Auditor Agent (mathAuditorAgent).
 *
 * <p>Accepts a PDF from the client, hands it to the {@link MathAuditorOrchestrator} which runs the
 * multi-round Java-Python negotiation, and returns the Auditor's {@link Verdict} as JSON.
 *
 * <p>This endpoint is a pure specialist — it produces the structured finding and nothing more.
 * Presentation (rendering as a chat answer, projecting to PDF comments, etc.) is the responsibility
 * of the caller (e.g. the orchestrator's {@code delegate_pdf_question} or {@code
 * delegate_pdf_review} meta-agents).
 *
 * <p>Lives under {@code /api/v1/ai/tools/} so it is dispatchable by the AI orchestrator via the
 * standard {@code InternalApiClient} allowlist — no special-case plumbing needed.
 *
 * <p>The raw PDF never leaves Java. Python receives only structured text and CSV data.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai/tools")
@RequiredArgsConstructor
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class MathAuditorAgentController {

    private final MathAuditorOrchestrator orchestrator;

    @PostMapping(value = "/math-auditor-agent", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
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
    public ResponseEntity<Verdict> mathAuditorAgent(
            @Parameter(description = "The PDF document to audit", required = true)
                    @RequestParam("fileInput")
                    MultipartFile fileInput,
            @Parameter(
                            description =
                                    "Arithmetic tolerance — differences smaller than this are"
                                            + " ignored (default: 0.01)")
                    @RequestParam(value = "tolerance", defaultValue = "0.01")
                    BigDecimal tolerance) {

        AiToolInputValidator.validatePdfUpload(fileInput);
        if (tolerance.compareTo(BigDecimal.ZERO) < 0) {
            return ResponseEntity.badRequest().build();
        }

        String safeName =
                fileInput.getOriginalFilename() != null
                        ? fileInput.getOriginalFilename().replaceAll("[\\r\\n]", "_")
                        : "<unnamed>";
        log.info("[math-auditor-agent] request file={} tolerance={}", safeName, tolerance);

        try {
            Verdict verdict = orchestrator.audit(fileInput, tolerance);
            return ResponseEntity.ok(verdict);
        } catch (IOException e) {
            log.error("[math-auditor-agent] IO error during audit", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
