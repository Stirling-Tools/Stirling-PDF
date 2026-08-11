package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;

import jakarta.annotation.PostConstruct;

import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.common.util.ExceptionUtils;

import tools.jackson.databind.json.JsonMapper;

/**
 * Tests for {@link FailureClassifier}. The fixtures matter as much as the assertions: a tool's 400
 * arrives as a {@link org.springframework.web.client.RestClientResponseException} carrying the
 * Problem Details body, so these build that exact shape rather than a convenient stand-in.
 */
class FailureClassifierTest {

    private final FailureClassifier classifier =
            new FailureClassifier(JsonMapper.builder().build());

    /** The Problem Details body {@code GlobalExceptionHandler} produces for a coded exception. */
    private static HttpClientErrorException problemDetail(HttpStatus status, String errorCode) {
        String body =
                """
                {"type":"/errors/pdf-password","title":"PDF password required",\
                "status":%d,"detail":"The PDF Document is passworded",\
                "errorCode":"%s","timestamp":"2026-01-01T00:00:00Z"}"""
                        .formatted(status.value(), errorCode);
        return HttpClientErrorException.create(
                status,
                status.getReasonPhrase(),
                new HttpHeaders(),
                body.getBytes(StandardCharsets.UTF_8),
                StandardCharsets.UTF_8);
    }

    private static HttpClientErrorException rawBody(String body) {
        return HttpClientErrorException.create(
                HttpStatus.BAD_REQUEST,
                "Bad Request",
                new HttpHeaders(),
                body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8),
                StandardCharsets.UTF_8);
    }

    @Nested
    @DisplayName("a downstream tool error")
    class DownstreamErrors {

        @Test
        void withAClaimedErrorCodeClassifiesToThatKind() {
            assertThat(classifier.classify(problemDetail(HttpStatus.BAD_REQUEST, "E004")))
                    .isEqualTo(FailureKind.INPUT_PASSWORD_PROTECTED);
        }

        @Test
        void withAnUnclaimedErrorCodeFallsBackToUnknown() {
            // E001 (corrupted PDF) is a real code that no kind has adopted yet. It must land in
            // UNKNOWN rather than being force-fitted to the nearest kind.
            assertThat(classifier.classify(problemDetail(HttpStatus.BAD_REQUEST, "E001")))
                    .isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void withANonJsonBodyFallsBackToUnknownWithoutThrowing() {
            assertThat(classifier.classify(rawBody("Internal Server Error")))
                    .isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void withAnEmptyBodyFallsBackToUnknown() {
            assertThat(classifier.classify(rawBody(""))).isEqualTo(FailureKind.UNKNOWN);
            assertThat(classifier.classify(rawBody(null))).isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void withJsonButNoErrorCodePropertyFallsBackToUnknown() {
            assertThat(classifier.classify(rawBody("{\"detail\":\"nope\"}")))
                    .isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void entitlementSentinelIsNotMistakenForACodedFailure() {
            // An entitlement 402 carries `error`, not `errorCode`. It must not be misclassified,
            // and specifically must not be attributed to a file problem.
            FailureKind kind =
                    classifier.classify(
                            rawBody("{\"error\":\"PAYG_LIMIT_REACHED\",\"subscribed\":false}"));
            assertThat(kind).isEqualTo(FailureKind.UNKNOWN);
            assertThat(kind).isNotEqualTo(FailureKind.INPUT_PASSWORD_PROTECTED);
        }
    }

    @Nested
    @DisplayName("an exception thrown in process")
    class InProcess {

        @Test
        void carryingItsOwnErrorCodeIsClassifiedByThatCode() {
            // Not every path goes over loopback; a coded exception thrown directly must work too.
            ExceptionUtils.PdfPasswordException e =
                    ExceptionUtils.createPdfPasswordException(new IOException("password"));
            assertThat(classifier.classify(e)).isEqualTo(FailureKind.INPUT_PASSWORD_PROTECTED);
        }

        @Test
        void isClassifiedWhenWrappedInsideAnotherException() {
            // The engine wraps and rethrows, so the code is often not on the outermost throwable.
            Throwable wrapped =
                    new IllegalStateException(
                            "step failed",
                            ExceptionUtils.createPdfPasswordException(new IOException("pw")));
            assertThat(classifier.classify(wrapped))
                    .isEqualTo(FailureKind.INPUT_PASSWORD_PROTECTED);
        }
    }

    @Nested
    @DisplayName("anything unrecognised")
    class Fallback {

        @Test
        void toolTimeoutIsUnknownUntilAKindClaimsIt() {
            // Deliberate: a timeout has its own catch site in the engine but no kind yet. This
            // proves the fallback holds even where specific handling already exists.
            InternalApiTimeoutException e =
                    new InternalApiTimeoutException(
                            "/api/v1/misc/ocr-pdf", Duration.ofSeconds(30), new IOException("t"));
            assertThat(classifier.classify(e)).isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void bareRuntimeExceptionIsUnknown() {
            assertThat(classifier.classify(new RuntimeException("boom")))
                    .isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void nullMessageDoesNotBreakClassification() {
            assertThat(classifier.classify(new RuntimeException((String) null)))
                    .isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void nullThrowableIsUnknown() {
            assertThat(classifier.classify(null)).isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void cyclicCauseChainTerminates() {
            // The JDK blocks self-causation but not a two-node cycle, and an unbounded walk would
            // spin on it forever, taking the run's error handling down with it.
            RuntimeException outer = new RuntimeException("outer");
            RuntimeException inner = new RuntimeException("inner", outer);
            outer.initCause(inner);

            assertThat(classifier.classify(outer)).isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void aCodeBuriedBeyondTheDepthBoundIsNotFound() {
            // Documents the trade: the bound is what guarantees termination, so a pathologically
            // deep chain classifies as UNKNOWN rather than hanging. UNKNOWN is always recoverable.
            Throwable deepest =
                    ExceptionUtils.createPdfPasswordException(new IOException("password"));
            Throwable chain = deepest;
            for (int i = 0; i < 20; i++) {
                chain = new IllegalStateException("wrap " + i, chain);
            }
            assertThat(classifier.classify(chain)).isEqualTo(FailureKind.UNKNOWN);
        }
    }

    @Nested
    @DisplayName("the boot guard on an ambiguous registry")
    class BootGuard {

        @Test
        void isWiredToRunAtStartupRatherThanOnlyBeingCallable() throws Exception {
            // The check moved out of FailureKind's class initialiser to get a readable message.
            // That only buys anything if Spring actually invokes it.
            assertThat(
                            FailureClassifier.class
                                    .getDeclaredMethod("verifyNoErrorCodeIsClaimedTwice")
                                    .isAnnotationPresent(PostConstruct.class))
                    .isTrue();
        }

        @Test
        void acceptsTheRealRegistry() {
            assertThatCode(classifier::verifyNoErrorCodeIsClaimedTwice).doesNotThrowAnyException();
        }

        @Test
        void wouldRejectADuplicate() {
            // FailureKind is a closed enum, so the guard cannot be handed a bad registry. What can
            // be shown is that the detection it depends on finds a duplicate when there is one.
            assertThat(FailureKind.duplicatesIn(Stream.of("E004", "E001", "E004")))
                    .containsExactly("E004");
        }
    }
}
