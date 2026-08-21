package stirling.software.common.service;

import java.time.Duration;

/**
 * Thrown when an internal Stirling tool invocation exceeds its configured read timeout or otherwise
 * fails at the transport layer. Distinguishes a hung/timed-out tool from a tool that returned a
 * non-2xx HTTP response (which is reported via the response status itself), so callers can present
 * a clear "the tool didn't respond in time" message to the user instead of a generic stack trace.
 */
public class InternalApiTimeoutException extends RuntimeException {

    private final String endpointPath;
    private final Duration readTimeout;

    public InternalApiTimeoutException(String endpointPath, Duration readTimeout, Throwable cause) {
        super(buildMessage(endpointPath, readTimeout, cause), cause);
        this.endpointPath = endpointPath;
        this.readTimeout = readTimeout;
    }

    public String getEndpointPath() {
        return endpointPath;
    }

    public Duration getReadTimeout() {
        return readTimeout;
    }

    private static String buildMessage(String endpointPath, Duration readTimeout, Throwable cause) {
        String reason = cause != null && cause.getMessage() != null ? cause.getMessage() : "";
        return String.format(
                "Internal tool %s did not respond within %ds (%s)",
                endpointPath, readTimeout.toSeconds(), reason);
    }
}
