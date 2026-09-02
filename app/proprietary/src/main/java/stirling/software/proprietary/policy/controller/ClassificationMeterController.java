package stirling.software.proprietary.policy.controller;

import java.util.List;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditContext;
import stirling.software.proprietary.classification.ClassificationRunBiller;

/**
 * Meters + audits a client-side (non-AI) classification run so both classify paths bill
 * identically. Side-effect only; does no classification itself.
 */
@Slf4j
@Hidden
@ApplicationScoped
@Path("/api/v1/policies")
public class ClassificationMeterController {

    /** Audit step label mirrors the AI classify tool so both paths read alike in the trail. */
    private static final String CLASSIFY_STEP = "/api/v1/ai/tools/classify-and-label";

    /** Client-supplied count cap: the frontend meters one document per call. */
    private static final int MAX_DOCUMENTS = 10_000;

    // ObjectProvider.getIfAvailable() -> Instance.isResolvable()/get(); only SaaS supplies a bean.
    private final Instance<ClassificationRunBiller> biller;

    // Was a handler argument under Spring MVC; JAX-RS takes the servlet request by injection.
    private final HttpServletRequest request;

    public ClassificationMeterController(
            Instance<ClassificationRunBiller> biller, HttpServletRequest request) {
        this.biller = biller;
        this.request = request;
    }

    @POST
    @Path("/classify/meter")
    @Consumes(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Meter a client-side classification run",
            description =
                    "Records billing + audit for a non-AI classification performed in the browser."
                            + " Does no classification itself. Dispatched by the frontend, not for"
                            + " direct use.")
    public Response meterClassification(ClassifyMeterRequest body) {
        int documents = body != null && body.documentCount() != null ? body.documentCount() : 1;
        if (documents < 1) documents = 1;
        if (documents > MAX_DOCUMENTS) documents = MAX_DOCUMENTS;
        String policyName =
                body != null && body.policyName() != null && !body.policyName().isBlank()
                        ? body.policyName()
                        : "Classification";

        // Stamp the run so ControllerAuditAspect records it as a policy run, like the AI path.
        // Best-effort: the servlet request proxy throws UT000048 off an active servlet request.
        try {
            request.setAttribute(AuditContext.REQ_ATTR_POLICY_NAME, policyName);
            request.setAttribute(AuditContext.REQ_ATTR_POLICY_STEPS, List.of(CLASSIFY_STEP));
        } catch (RuntimeException e) {
            log.debug("[classify meter] audit stamp unavailable: {}", e.getMessage());
        }

        ClassificationRunBiller runBiller = biller.isResolvable() ? biller.get() : null;
        if (runBiller != null) {
            try {
                runBiller.recordClassificationRun(documents);
            } catch (RuntimeException e) {
                log.warn(
                        "[classify meter] billing failed; classification proceeds unbilled: {}",
                        e.getMessage());
            }
        }
        return Response.accepted().build();
    }

    /** Frontend payload: documents classified, plus the policy name for the audit label. */
    public record ClassifyMeterRequest(
            String policyName, Integer documentCount, List<String> labels) {}
}
