package stirling.software.proprietary.audit;

import jakarta.servlet.http.HttpServletRequest;

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

    public static final String REQ_ATTR_SUBJECT = "stirling.audit.subject";

    private static final int MAX_SUBJECT_LENGTH = 200;

    public static void setSubject(HttpServletRequest request, String subject) {
        if (request != null && subject != null) {
            request.setAttribute(REQ_ATTR_SUBJECT, subject);
        }
    }

    public static String subject(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        Object stored = request.getAttribute(REQ_ATTR_SUBJECT);
        if (stored == null) {
            return null;
        }
        String value = String.valueOf(stored).replaceAll("[\\r\\n]", " ").trim();
        if (value.isEmpty()) {
            return null;
        }
        return value.length() > MAX_SUBJECT_LENGTH ? value.substring(0, MAX_SUBJECT_LENGTH) : value;
    }

    private AuditContext() {}
}
