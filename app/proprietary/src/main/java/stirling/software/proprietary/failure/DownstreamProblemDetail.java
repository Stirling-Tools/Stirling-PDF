package stirling.software.proprietary.failure;

import org.springframework.web.client.RestClientResponseException;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Reads a downstream Problem Details body: the human-readable {@code detail}, and the {@code
 * errorCode} beside it. Without these a failed run records the whole JSON body behind a status
 * line, so what the tool actually said never reaches the review surface.
 */
@Slf4j
public final class DownstreamProblemDetail {

    /** Set by {@code GlobalExceptionHandler#createBaseProblemDetail}. */
    private static final String DETAIL_PROPERTY = "detail";

    /** Set by {@code GlobalExceptionHandler#createProblemDetailResponse} for a coded failure. */
    private static final String ERROR_CODE_PROPERTY = "errorCode";

    // Static because this is a utility with no state; Jackson mappers are thread-safe.
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private DownstreamProblemDetail() {}

    /** The body's {@code detail}, or null when the body is absent, not JSON, or carries none. */
    public static String detailOf(RestClientResponseException exception) {
        return textProperty(exception, DETAIL_PROPERTY);
    }

    /**
     * The body's {@code errorCode}, or null when the failure carries none. Lets a run surface the
     * same code the review surface classifies on, so a client can branch on it too.
     */
    public static String errorCodeOf(RestClientResponseException exception) {
        return textProperty(exception, ERROR_CODE_PROPERTY);
    }

    private static String textProperty(RestClientResponseException exception, String property) {
        String body = exception.getResponseBodyAsString();
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            JsonNode node = MAPPER.readTree(body).get(property);
            if (node == null || !node.isTextual()) {
                return null;
            }
            String text = node.asString().trim();
            return text.isEmpty() ? null : text;
        } catch (JacksonException e) {
            log.debug("Downstream error body was not JSON; keeping the raw failure message");
            return null;
        }
    }
}
