package stirling.software.proprietary.failure;

import java.util.List;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Maps a thrown failure onto a {@link FailureKind}. A tool's 4xx arrives as a {@link
 * WebApplicationException} - the migrated {@code InternalApiClient} returns the upstream status, so
 * {@code PolicyExecutor} rethrows a non-OK tool response as one carrying that status and body. The
 * body is the Problem Details document carrying {@code errorCode}, so this matches on codes rather
 * than exception messages.
 *
 * <p>Anything unrecognised becomes {@link FailureKind#UNKNOWN}, so every failed run still gets a
 * record.
 */
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class FailureClassifier {

    /** Set by {@code GlobalExceptionHandler#createProblemDetailResponse}. */
    private static final String ERROR_CODE_PROPERTY = "errorCode";

    /**
     * Depth bound on the cause chain. The JDK forbids self-causation but not a longer cycle (A
     * caused by B caused by A), which an unbounded walk would spin on. Real chains are a handful
     * deep.
     */
    private static final int MAX_CAUSE_DEPTH = 16;

    private final ObjectMapper objectMapper;

    /**
     * Refuse to start on an ambiguous registry: two kinds claiming one code would make {@link
     * #classify} depend on declaration order. Checked here because this is what resolves codes to
     * kinds, and at boot so the message names the codes rather than arriving as a class-init error.
     */
    @PostConstruct
    void verifyNoErrorCodeIsClaimedTwice() {
        List<String> duplicates = FailureKind.duplicateErrorCodes();
        if (!duplicates.isEmpty()) {
            throw new IllegalStateException(
                    "Error codes claimed by more than one failure kind: " + duplicates);
        }
    }

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
        if (throwable instanceof WebApplicationException responseException) {
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
    private String errorCodeFromBody(WebApplicationException exception) {
        String body = bodyOf(exception.getResponse());
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

    /**
     * The response body as text. Null for the bodyless {@code WebApplicationException}s our own
     * resources throw for their 4xx, which then fall through to the error-code-provider check.
     */
    private static String bodyOf(Response response) {
        if (response == null) {
            return null;
        }
        Object entity = response.getEntity();
        return entity == null ? null : entity.toString();
    }
}
