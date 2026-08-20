package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * The privacy contract: a recorded failure carries no document identity of its own. There is no
 * name column and the dedup key is built only from opaque ids, so nothing here derives from what a
 * document is called.
 *
 * <p>The message itself is stored verbatim. It is the user's own error about their own file, and
 * scrubbing it made rows harder to act on without making them meaningfully safer.
 */
@DisplayName("a recorded failure carries no document identity of its own")
class RecordFailurePrivacyTest {

    private static RecordFailure withDetail(String detail) {
        return RecordFailure.forRun(
                FailureKind.UNKNOWN,
                1L,
                "dana@example.com",
                "policy-1",
                "run-1",
                null,
                null,
                detail);
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
