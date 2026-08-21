package stirling.software.proprietary.audit;

/**
 * Request-scoped keys a controller can set to enrich its own audit event with context the generic
 * aspect can't infer from the HTTP request alone (e.g. the policy a pipeline run belongs to). The
 * aspect copies these into the audit data in its {@code finally} block, after the controller body
 * has run. See {@code AuditService#addAutomationContext}.
 */
public final class AuditContext {

    /** Request attribute: the name of the policy/pipeline a run executes. */
    public static final String REQ_ATTR_POLICY_NAME = "stirling.audit.policyName";

    /** Request attribute: the ordered tool endpoint paths a run executes. */
    public static final String REQ_ATTR_POLICY_STEPS = "stirling.audit.policySteps";

    private AuditContext() {}
}
