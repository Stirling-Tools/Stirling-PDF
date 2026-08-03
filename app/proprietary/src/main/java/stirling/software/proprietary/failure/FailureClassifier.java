package stirling.software.proprietary.failure;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Maps a thrown failure onto a {@link FailureKind}. A tool's 4xx arrives as a {@link
 * RestClientResponseException} whose body is the Problem Details document carrying {@code
 * errorCode}, so this matches on codes rather than exception messages.
 *
 * <p>Anything unrecognised becomes {@link FailureKind#UNKNOWN}, so every failed run still gets a
 * record.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FailureClassifier {

    /** Set by {@code GlobalExceptionHandler#createProblemDetailResponse}. */
    private static final String ERROR_CODE_PROPERTY = "errorCode";

    private final ObjectMapper objectMapper;

    /**
     * Depth bound on the cause chain. The JDK forbids self-causation but not a longer cycle (A
     * caused by B caused by A), which an unbounded walk would spin on. Real chains are a handful
     * deep.
     */
    private static final int MAX_CAUSE_DEPTH = 16;

    /** Never null, never throws. A classifier that can fail would lose the failure it describes. */
    public FailureKind classify(Throwable throwable) {
        Throwable current = throwable;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
            FailureKind resolved = classifyOne(current);
            if (resolved != FailureKind.UNKNOWN) {
                return resolved;
            }
            Throwable cause = current.getCause();
            current = cause == current ? null : cause;
        }
        return FailureKind.UNKNOWN;
    }

    private FailureKind classifyOne(Throwable throwable) {
        // A tool step's 4xx/5xx: the Problem Details body names the error code.
        if (throwable instanceof RestClientResponseException responseException) {
            String code = errorCodeFromBody(responseException);
            if (code != null) {
                return FailureKind.byErrorCode(code).orElse(FailureKind.UNKNOWN);
            }
        }
        // Thrown in-process (not over loopback): the exception carries its own code.
        if (throwable instanceof ExceptionUtils.ErrorCodeProvider provider) {
            return FailureKind.byErrorCode(provider.getErrorCode()).orElse(FailureKind.UNKNOWN);
        }
        return FailureKind.UNKNOWN;
    }

    /**
     * Pull {@code errorCode} from a Problem Details body, or null when the body is absent, not
     * JSON, or has no such property (an entitlement sentinel has {@code error} instead).
     */
    private String errorCodeFromBody(RestClientResponseException exception) {
        String body = exception.getResponseBodyAsString();
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode code = root.get(ERROR_CODE_PROPERTY);
            if (code == null || !code.isTextual()) {
                return null;
            }
            String text = code.asString();
            return text.isBlank() ? null : text;
        } catch (JacksonException e) {
            log.debug("Downstream error body was not JSON; classifying as UNKNOWN");
            return null;
        }
    }
}
