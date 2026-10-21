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

    /** Request attribute: the verified actor an aspect records as the event principal. */
    public static final String REQ_ATTR_SUBJECT = "stirling.audit.subject";

    /** Request attribute: an unverified identity a request claimed, recorded as event data only. */
    public static final String REQ_ATTR_ATTEMPTED_SUBJECT = "stirling.audit.attemptedSubject";

    private static final int MAX_SUBJECT_LENGTH = 200;

    /**
     * Names the verified actor behind this request; the aspects promote it to the audit event's
     * principal, which is the column team-scoped audit and document feeds filter on.
     *
     * <p>Only call it once the request has proved who it is. An identity taken from the request
     * body before any credential check belongs in {@link #setAttemptedSubject} instead, otherwise a
     * stranger can write rows into a named user's feed.
     */
    public static void setSubject(HttpServletRequest request, String subject) {
        if (request != null && subject != null) {
            request.setAttribute(REQ_ATTR_SUBJECT, subject);
        }
    }

    /**
     * Names the identity a request claimed but has not proved. The aspects record it as {@code
     * attemptedUsername} in the event data and never as the principal.
     */
    public static void setAttemptedSubject(HttpServletRequest request, String subject) {
        if (request != null && subject != null) {
            request.setAttribute(REQ_ATTR_ATTEMPTED_SUBJECT, subject);
        }
    }

    public static String subject(HttpServletRequest request) {
        return sanitized(request, REQ_ATTR_SUBJECT);
    }

    public static String attemptedSubject(HttpServletRequest request) {
        return sanitized(request, REQ_ATTR_ATTEMPTED_SUBJECT);
    }

    private static String sanitized(HttpServletRequest request, String attribute) {
        if (request == null) {
            return null;
        }
        Object stored = request.getAttribute(attribute);
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
