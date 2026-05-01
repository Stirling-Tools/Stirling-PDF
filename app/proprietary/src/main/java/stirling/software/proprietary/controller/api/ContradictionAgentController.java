package stirling.software.proprietary.controller.api;

import java.io.IOException;

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

import stirling.software.proprietary.model.api.ai.contradiction.ContradictionVerdict;
import stirling.software.proprietary.service.AiToolInputValidator;
import stirling.software.proprietary.service.ContradictionAgentOrchestrator;

/**
 * Public entry point for the Contradiction Agent (contradictionAgent).
 *
 * <p>Accepts a PDF from the client, hands it to the {@link ContradictionAgentOrchestrator} which
 * runs the multi-round Java-Python negotiation, and returns the agent's {@link
 * ContradictionVerdict} as JSON.
 *
 * <p>This endpoint is a pure specialist — it produces the structured finding and nothing more.
 * Presentation (rendering as a chat answer, projecting to PDF comments, etc.) is the responsibility
 * of the caller (e.g. the orchestrator's {@code delegate_pdf_question} or {@code
 * delegate_pdf_review} meta-agents).
 *
 * <p>Lives under {@code /api/v1/ai/tools/} so it is dispatchable by the AI orchestrator via the
 * standard {@code InternalApiClient} allowlist — no special-case plumbing needed.
 *
 * <p>Scope is purely <strong>textual</strong>: arguments, claimed facts, recommendations, and
 * stated positions that conflict with one another across the document. Numeric arithmetic is
 * handled by the separate Math Auditor Agent.
 *
 * <p>The raw PDF never leaves Java. Python receives only structured text data.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai/tools")
@RequiredArgsConstructor
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class ContradictionAgentController {

    private final ContradictionAgentOrchestrator orchestrator;

    @PostMapping(value = "/contradiction-agent", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Detect textual contradictions in a PDF",
            description =
                    """
                    Analyses a PDF document for textual contradictions using the Contradiction
                    Agent.

                    The agent looks for:
                    - Conflicting factual claims about the same entity or topic
                    - Opposing recommendations or stances (approve vs reject, etc.)
                    - Inconsistent attribute claims across pages
                    - Cross-page tension between arguments and points of view

                    Numeric / arithmetic errors are out of scope — those are handled by the
                    separate Math Auditor Agent.

                    Returns a JSON ContradictionVerdict describing every conflict found, each
                    anchored to two verbatim quotes (one per conflicting page). How the verdict is
                    presented to the end user (chat answer, paired sticky-note comments, etc.) is
                    up to the caller.

                    Input: PDF  Output: JSON  Type: SISO
                    """)
    public ResponseEntity<ContradictionVerdict> contradictionAgent(
            @Parameter(description = "The PDF document to audit", required = true)
                    @RequestParam("fileInput")
                    MultipartFile fileInput) {

        AiToolInputValidator.validatePdfUpload(fileInput);

        String safeName =
                fileInput.getOriginalFilename() != null
                        ? fileInput.getOriginalFilename().replaceAll("[\\r\\n]", "_")
                        : "<unnamed>";
        log.info("[contradiction-agent] request file={}", safeName);

        try {
            ContradictionVerdict verdict = orchestrator.audit(fileInput);
            return ResponseEntity.ok(verdict);
        } catch (IOException e) {
            log.error("[contradiction-agent] IO error during audit", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
