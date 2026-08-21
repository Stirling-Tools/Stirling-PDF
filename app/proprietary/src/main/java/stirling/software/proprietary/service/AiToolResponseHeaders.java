package stirling.software.proprietary.service;

/**
 * Custom response headers the AI tools use when returning a file body with structured metadata.
 *
 * <p>Kept in one place because the value is referenced both server-side (tools that produce the
 * header, orchestrator code that consumes it) and client-side (HTTP response handling in the
 * frontend). Changing the string requires updating every reader, so centralising avoids the "must
 * stay in sync" coupling.
 */
public final class AiToolResponseHeaders {

    /**
     * Header tools set to surface a structured metadata report alongside a file body. Value is a
     * JSON object whose shape depends on the tool (e.g. {@code annotationsApplied}, {@code
     * rationale} for pdf-comment-agent). Absent when the tool has no metadata to report.
     */
    public static final String TOOL_REPORT = "X-Stirling-Tool-Report";

    private AiToolResponseHeaders() {}
}
