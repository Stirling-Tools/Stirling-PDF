package stirling.software.proprietary.failure;

import org.springframework.web.client.RestClientResponseException;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Reads the human-readable {@code detail} out of a downstream Problem Details body, the sibling of
 * the {@code errorCode} {@link FailureClassifier} reads. Without it a failed run records the whole
 * JSON body behind a status line, so what the tool actually said never reaches the review surface.
 */
@Slf4j
public final class DownstreamProblemDetail {

    /** Set by {@code GlobalExceptionHandler#createBaseProblemDetail}. */
    private static final String DETAIL_PROPERTY = "detail";

    // Static because this is a utility with no state; Jackson mappers are thread-safe.
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private DownstreamProblemDetail() {}

    /** The body's {@code detail}, or null when the body is absent, not JSON, or carries none. */
    public static String detailOf(RestClientResponseException exception) {
        String body = exception.getResponseBodyAsString();
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            JsonNode detail = MAPPER.readTree(body).get(DETAIL_PROPERTY);
            if (detail == null || !detail.isTextual()) {
                return null;
            }
            String text = detail.asString().trim();
            return text.isEmpty() ? null : text;
        } catch (JacksonException e) {
            log.debug("Downstream error body was not JSON; keeping the raw failure message");
            return null;
        }
    }
}
