package stirling.software.SPDF.controller.api.ai;

import java.math.BigDecimal;

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

import stirling.software.SPDF.model.api.ai.Verdict;
import stirling.software.SPDF.service.AuditOrchestrator;

/**
 * Public entry point for the Ledger Auditor feature.
 *
 * <p>Accepts a PDF from the client, hands it to the {@link AuditOrchestrator} which runs the
 * multi-round Java → Python negotiation, and returns the Auditor's {@link Verdict}.
 *
 * <p>The raw PDF never leaves Java. Python receives only structured text and CSV data.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Tag(
        name = "AI",
        description =
                """
                AI-powered document analysis endpoints.

                Ledger Auditor: validates mathematical calculations and table tallies in PDF documents.
                Catches arithmetic errors in invoices, financial statements, and reports.
                """)
public class MathValidationController {

    private final AuditOrchestrator orchestrator;

    @PostMapping(value = "/math-validate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Validate mathematical calculations in a PDF",
            description =
                    """
                    Analyses a PDF document for mathematical errors using the Ledger Auditor AI agent.

                    The auditor checks:
                    • Table row and column totals (tally errors)
                    • Inline arithmetic expressions (e.g. "100 + 200 = 300")
                    • Cross-page figure consistency (same figure cited differently on different pages)

                    The PDF is processed entirely on the Java side; only extracted text and table data
                    are sent to the AI engine. Large PDFs are handled efficiently — only pages
                    identified as relevant are extracted.

                    Returns a Verdict containing all discrepancies found, a clean flag, and a summary.

                    Input: PDF  Output: JSON  Type: SISO
                    """)
    public ResponseEntity<Verdict> validateMath(
            @Parameter(description = "The PDF document to audit", required = true)
            @RequestParam("fileInput") MultipartFile fileInput,

            @Parameter(description = "Arithmetic tolerance — differences smaller than this are ignored (default: 0.01)")
            @RequestParam(value = "tolerance", defaultValue = "0.01") BigDecimal tolerance)
            throws Exception {

        log.info("[ledger] math-validate request file={} tolerance={}", fileInput.getOriginalFilename(), tolerance);
        Verdict verdict = orchestrator.audit(fileInput, tolerance);
        return ResponseEntity.ok(verdict);
    }
}
