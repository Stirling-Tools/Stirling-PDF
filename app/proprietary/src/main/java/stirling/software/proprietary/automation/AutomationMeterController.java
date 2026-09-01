package stirling.software.proprietary.automation;

import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditContext;
import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;

/**
 * Meters + audits a client-side automation run so a browser-run automation bills like the
 * equivalent server-side policy. The meter endpoint for every automation that executes in
 * the browser (rather than through the billing interceptors). Side-effect only; does no
 * processing itself.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/automation")
public class AutomationMeterController {

    /** Cap on input documents accepted per call, guarding against a hostile client payload. */
    private static final int MAX_INPUTS = 10_000;

    /** Cap on operations recorded for the audit label. */
    private static final int MAX_OPERATIONS = 1_000;

    private final ObjectProvider<AutomationRunBiller> biller;

    public AutomationMeterController(ObjectProvider<AutomationRunBiller> biller) {
        this.biller = biller;
    }

    @PostMapping("/meter")
    @Operation(
            summary = "Meter a client-side automation run",
            description =
                    "Records billing + audit for an automation performed in the browser (the"
                            + " Automate tool or the local classification pass). Does no processing"
                            + " itself. Dispatched by the frontend, not for direct use.")
    public ResponseEntity<Void> meterAutomationRun(
            @RequestBody(required = false) AutomationMeterRequest body,
            HttpServletRequest request) {
        List<FileSize> inputs = sanitizeInputs(body);
        if (inputs.isEmpty()) {
            // No billable input set - nothing to charge (an empty run still returns 202).
            return ResponseEntity.accepted().build();
        }

        String automationName =
                body != null && body.automationName() != null && !body.automationName().isBlank()
                        ? body.automationName()
                        : "Automation";
        List<String> steps = sanitizeOperations(body);

        // Stamp the run so the audit trail records it as an automation, like a server-run policy.
        request.setAttribute(AuditContext.REQ_ATTR_POLICY_NAME, automationName);
        request.setAttribute(AuditContext.REQ_ATTR_POLICY_STEPS, steps);

        AutomationRunBiller runBiller = biller.getIfAvailable();
        if (runBiller != null) {
            try {
                runBiller.recordAutomationRun(inputs);
            } catch (RuntimeException e) {
                log.warn(
                        "[automate meter] billing failed; the run already completed unbilled: {}",
                        e.getMessage());
            }
        }
        return ResponseEntity.accepted().build();
    }

    /** Clamp to a sane count and drop malformed entries; negatives are treated as zero. */
    private static List<FileSize> sanitizeInputs(AutomationMeterRequest body) {
        if (body == null || body.inputs() == null) {
            return List.of();
        }
        List<FileSize> out = new ArrayList<>();
        for (InputDoc doc : body.inputs()) {
            if (doc == null) {
                continue;
            }
            int pages = doc.pages() != null ? Math.max(0, doc.pages()) : 0;
            long bytes = doc.bytes() != null ? Math.max(0L, doc.bytes()) : 0L;
            out.add(new FileSize(pages, bytes));
            if (out.size() >= MAX_INPUTS) {
                break;
            }
        }
        return out;
    }

    private static List<String> sanitizeOperations(AutomationMeterRequest body) {
        if (body == null || body.operations() == null) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String op : body.operations()) {
            if (op != null && !op.isBlank()) {
                out.add(op.trim());
            }
            if (out.size() >= MAX_OPERATIONS) {
                break;
            }
        }
        return out;
    }

    /** Frontend payload: the run's name, its operation ids, and per-input page/byte facts. */
    public record AutomationMeterRequest(
            String automationName, List<String> operations, List<InputDoc> inputs) {}

    /** One input document's page count (0 for non-PDF / unknown) and byte size. */
    public record InputDoc(Integer pages, Long bytes) {}
}
