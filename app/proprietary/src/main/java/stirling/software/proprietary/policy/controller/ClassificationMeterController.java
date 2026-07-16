package stirling.software.proprietary.policy.controller;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
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
import stirling.software.proprietary.classification.ClassificationRunBiller;

/**
 * Records a client-side (non-AI) classification run. The heuristic classifier runs in the browser
 * when the AI engine is off; this fast, side-effect-only endpoint meters + audits it so both modes
 * bill identically. Does no classification itself; dispatched by the frontend, not for direct use.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/policies")
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class ClassificationMeterController {

    /** Audit step label mirrors the AI classify tool so both paths read alike in the trail. */
    private static final String CLASSIFY_STEP = "/api/v1/ai/tools/classify-and-label";

    private final ObjectProvider<ClassificationRunBiller> biller;

    public ClassificationMeterController(ObjectProvider<ClassificationRunBiller> biller) {
        this.biller = biller;
    }

    @PostMapping("/classify/meter")
    @Operation(
            summary = "Meter a client-side classification run",
            description =
                    "Records billing + audit for a non-AI classification performed in the browser."
                            + " Does no classification itself. Dispatched by the frontend, not for"
                            + " direct use.")
    public ResponseEntity<Void> meterClassification(
            @RequestBody(required = false) ClassifyMeterRequest body, HttpServletRequest request) {
        int documents = body != null && body.documentCount() != null ? body.documentCount() : 1;
        if (documents < 1) documents = 1;
        String policyName =
                body != null && body.policyName() != null && !body.policyName().isBlank()
                        ? body.policyName()
                        : "Classification";

        // Stamp the run so ControllerAuditAspect records it as a policy run, like the AI path.
        request.setAttribute(AuditContext.REQ_ATTR_POLICY_NAME, policyName);
        request.setAttribute(AuditContext.REQ_ATTR_POLICY_STEPS, List.of(CLASSIFY_STEP));

        ClassificationRunBiller runBiller = biller.getIfAvailable();
        if (runBiller != null) {
            try {
                runBiller.recordClassificationRun(documents);
            } catch (RuntimeException e) {
                log.warn(
                        "[classify meter] billing failed; classification proceeds unbilled: {}",
                        e.getMessage());
            }
        }
        return ResponseEntity.accepted().build();
    }

    /**
     * Frontend payload: how many docs were classified, plus the policy name for the audit label.
     */
    public record ClassifyMeterRequest(
            String policyName, Integer documentCount, List<String> labels) {}
}
