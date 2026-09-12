package stirling.software.proprietary.policy.controller;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
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
 * Meters + audits a client-side (non-AI) classification run so both classify paths bill
 * identically. Side-effect only; does no classification itself.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/policies")
public class ClassificationMeterController {

    /** Audit step label mirrors the AI classify tool so both paths read alike in the trail. */
    private static final String CLASSIFY_STEP = "/api/v1/ai/tools/classify-and-label";

    /** Client-supplied count cap: the frontend meters one document per call. */
    private static final int MAX_DOCUMENTS = 10_000;

    /** Onboarding's Downloads sweep, priced separately from classification on upload. */
    private static final String ONBOARDING_SOURCE = "onboarding";

    private final ObjectProvider<ClassificationRunBiller> biller;

    /**
     * Whether onboarding's sweep is charged. Only that source is affected; classification on upload
     * bills regardless.
     *
     * <p>Keyed on the client-declared {@code source}, which this endpoint necessarily trusts: it
     * performs no classification and cannot observe one, so {@code documentCount} is already taken
     * on the caller's word and omitting the call entirely skips billing outright. Naming a source
     * therefore adds no trust assumption beyond the ones metering already rests on.
     */
    private final boolean billOnboarding;

    public ClassificationMeterController(
            ObjectProvider<ClassificationRunBiller> biller,
            @Value("${premium.classification.billOnboarding:true}") boolean billOnboarding) {
        this.biller = biller;
        this.billOnboarding = billOnboarding;
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
        if (documents > MAX_DOCUMENTS) documents = MAX_DOCUMENTS;
        String policyName =
                body != null && body.policyName() != null && !body.policyName().isBlank()
                        ? body.policyName()
                        : "Classification";

        // Stamp the run so ControllerAuditAspect records it as a policy run, like the AI path.
        request.setAttribute(AuditContext.REQ_ATTR_POLICY_NAME, policyName);
        request.setAttribute(AuditContext.REQ_ATTR_POLICY_STEPS, List.of(CLASSIFY_STEP));

        boolean billable =
                billOnboarding
                        || body == null
                        || !ONBOARDING_SOURCE.equalsIgnoreCase(body.source());

        ClassificationRunBiller runBiller = biller.getIfAvailable();
        if (runBiller != null && billable) {
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
     * Frontend payload. {@code source} names the flow that ran the classification, so it can be
     * priced on its own; {@code policyName} is the audit label.
     */
    public record ClassifyMeterRequest(
            String policyName, String source, Integer documentCount, List<String> labels) {}
}
