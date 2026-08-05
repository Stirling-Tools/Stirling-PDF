package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The privacy contract: a recorded failure carries no document identity. There is no name column,
 * so these tests cover the other route in — a name embedded in a raw failure message, which can
 * arrive from any downstream tool.
 */
@DisplayName("a recorded failure carries no document identity")
class RecordFailurePrivacyTest {

    private static RecordFailure withDetail(String detail) {
        return RecordFailure.forRun(
                FailureKind.UNKNOWN, 1L, "dana@example.com", "policy-1", "run-1", null, detail);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Step /api/v1/misc/ocr-pdf accepts [pdf] but received 'payslip-march.docx'",
                "Could not read /var/watched/HR/termination-letter.pdf",
                "s3://bucket/private/salary-review.XLSX could not be fetched",
                "attachment scan-0001.JPEG rejected",
                "Failed on medical-report.pdf and x-ray.png"
            })
    void redactsDocumentNamesOutOfTheFailureMessage(String message) {
        String stored = withDetail(message).detail();

        assertThat(stored).doesNotContainIgnoringCase("payslip");
        assertThat(stored).doesNotContainIgnoringCase("termination");
        assertThat(stored).doesNotContainIgnoringCase("salary");
        assertThat(stored).doesNotContainIgnoringCase("medical");
        assertThat(stored).doesNotContainIgnoringCase("x-ray");
        assertThat(stored).doesNotContainIgnoringCase("scan-0001");
        assertThat(stored).contains("<file>");
    }

    @Test
    void keepsTheDiagnosticPartsThatMakeAnUnknownFailureReadable() {
        // The whole value of UNKNOWN is the raw message, so redaction must be surgical. Fully
        // qualified names and endpoint paths survive: neither identifies a document.
        String stored =
                withDetail(
                                "Policy run failed: java.lang.NullPointerException at"
                                        + " stirling.software.proprietary.policy.engine.PolicyExecutor"
                                        + ".executeStep(PolicyExecutor.java:120) calling"
                                        + " /api/v1/misc/ocr-pdf")
                        .detail();

        assertThat(stored).contains("java.lang.NullPointerException");
        assertThat(stored).contains("stirling.software.proprietary.policy.engine.PolicyExecutor");
        assertThat(stored).contains("/api/v1/misc/ocr-pdf");
        // The accepted trade: a source file in a trace reads as <file>, and the line number that
        // actually locates the fault survives.
        assertThat(stored).contains("<file>:120");
    }

    @Test
    void redactsAnExtensionNobodyListedAnywhere() {
        // Matched by shape rather than a list of known formats, so supporting a new file type
        // needs no redaction list kept up to date.
        assertThat(withDetail("could not parse quarterly-report.wibble").detail())
                .isEqualTo("could not parse <file>");
    }

    @Test
    void doesNotMangleVersionNumbersOrOrdinaryProse() {
        String stored = withDetail("Ghostscript 10.05.1 failed. Retry attempt 2.").detail();

        assertThat(stored).isEqualTo("Ghostscript 10.05.1 failed. Retry attempt 2.");
    }

    @Test
    void toleratesAnAbsentMessage() {
        assertThat(withDetail(null).detail()).isNull();
    }

    @Test
    void hasNoFileNameFieldAtAll() {
        // Structural, not behavioural: if a fileName component is ever added back, this fails.
        assertThat(List.of(RecordFailure.class.getRecordComponents()))
                .extracting(RecordComponent::getName)
                .doesNotContain("fileName");
        assertThat(List.of(FileRunEventEntity.class.getDeclaredFields()))
                .extracting(Field::getName)
                .doesNotContain("fileName");
        assertThat(List.of(FileRunEventView.class.getRecordComponents()))
                .extracting(RecordComponent::getName)
                .doesNotContain("fileName");
    }

    @Test
    void dedupKeyIsBuiltOnlyFromOpaqueIdentifiers() {
        // Two files under the same policy hash differently (so they stay separate incidents), but
        // the inputs are ids, so the hash is not reversible to a document name.
        RecordFailure a =
                new RecordFailure(
                        FailureKind.INPUT_PASSWORD_PROTECTED,
                        FailureOrigin.POLICY,
                        1L,
                        null,
                        "policy-1",
                        "run-1",
                        null,
                        "file-aaa",
                        "x");
        RecordFailure b =
                new RecordFailure(
                        FailureKind.INPUT_PASSWORD_PROTECTED,
                        FailureOrigin.POLICY,
                        1L,
                        null,
                        "policy-1",
                        "run-1",
                        null,
                        "file-bbb",
                        "x");

        assertThat(a.dedupKey()).isNotEqualTo(b.dedupKey());
        assertThat(a.dedupKey()).hasSize(64).isEqualTo(a.dedupKey());
        assertThat(a.scopeRef()).doesNotContain(".pdf");
    }

    @Nested
    @DisplayName("the detail cap")
    class DetailCap {

        @Test
        void capsAnOversizedMessageAtTheLimitIncludingTheEllipsis() {
            String stored = withDetail("x".repeat(5_000)).detail();

            assertThat(stored).hasSize(2_000).endsWith("…");
        }

        @Test
        void leavesAMessageAtTheLimitAlone() {
            String atLimit = "x".repeat(2_000);

            assertThat(withDetail(atLimit).detail()).isEqualTo(atLimit);
        }

        @Test
        void neverCutsBetweenTheHalvesOfASurrogatePair() {
            // A string of astral-plane characters: every char is half of a surrogate pair, so a
            // blind substring at the cap has a 50% chance of storing invalid UTF-16.
            String stored = withDetail("\uD835\uDC9C".repeat(3_000)).detail();

            assertThat(new String(stored.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8))
                    .as("a round-trip through UTF-8 mangles an unpaired surrogate")
                    .isEqualTo(stored);
        }
    }
}
