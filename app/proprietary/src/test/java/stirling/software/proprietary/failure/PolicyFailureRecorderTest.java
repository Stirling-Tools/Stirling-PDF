package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

import tools.jackson.databind.json.JsonMapper;

/**
 * Tests for {@link PolicyFailureRecorder}. Two behaviours beyond "it writes a row": the team comes
 * from the originating policy, and a store problem is swallowed rather than replacing the failure
 * being recorded.
 */
@ExtendWith(MockitoExtension.class)
class PolicyFailureRecorderTest {

    private static final Long TEAM = 11L;

    @Mock private PolicyStore policyStore;

    private InMemoryFileRunEventRepository repository;
    private FileRunEventStore store;
    private PolicyFailureRecorder recorder;

    @BeforeEach
    void setUp() {
        repository = new InMemoryFileRunEventRepository();
        store = new FileRunEventStore(repository);
        recorder =
                new PolicyFailureRecorder(
                        new FailureClassifier(JsonMapper.builder().build()), store, policyStore);
    }

    private static Policy policy(String id, Long teamId) {
        return new Policy(
                id,
                "Contract redaction",
                "owner@example.com",
                true,
                List.of(),
                List.of(),
                OutputSpec.inline(),
                List.of(),
                teamId);
    }

    private static HttpClientErrorException passwordFailure() {
        String body = "{\"type\":\"/errors/pdf-password\",\"errorCode\":\"E004\"}";
        return HttpClientErrorException.create(
                HttpStatus.BAD_REQUEST,
                "Bad Request",
                new HttpHeaders(),
                body.getBytes(StandardCharsets.UTF_8),
                StandardCharsets.UTF_8);
    }

    @Nested
    @DisplayName("classifying and recording")
    class Recording {

        @Test
        void classifiesTheCauseAndStoresTheRunsOwnMessage() {
            when(policyStore.get("policy-1")).thenReturn(Optional.of(policy("policy-1", TEAM)));

            recorder.recordRunFailure(
                    "run-1",
                    "policy-1",
                    "dana@example.com",
                    null,
                    "Policy run failed: locked",
                    passwordFailure());

            FileRunEvent event = store.list(TEAM, null, null, 10).getFirst();
            assertThat(event.kind()).isEqualTo(FailureKind.INPUT_PASSWORD_PROTECTED);
            assertThat(event.runId()).isEqualTo("run-1");
            assertThat(event.policyId()).isEqualTo("policy-1");
            assertThat(event.actor()).isEqualTo("dana@example.com");
            assertThat(event.origin()).isEqualTo(FailureOrigin.PROCESSOR);
            // The run's message, not the exception's: that is what the operator saw.
            assertThat(event.detail()).isEqualTo("Policy run failed: locked");
        }

        @Test
        void recordsAnUnclassifiableFailureAsUnknownRatherThanDroppingIt() {
            when(policyStore.get("policy-1")).thenReturn(Optional.of(policy("policy-1", TEAM)));

            recorder.recordRunFailure(
                    "run-2",
                    "policy-1",
                    null,
                    null,
                    "Policy run failed: java.lang.NullPointerException",
                    new RuntimeException("npe"));

            FileRunEvent event = store.list(TEAM, null, null, 10).getFirst();
            assertThat(event.kind()).isEqualTo(FailureKind.UNKNOWN);
            assertThat(event.detail()).contains("NullPointerException");
        }

        @Test
        void acceptsAPreDecidedKindForPathsWithNothingToClassify() {
            // A run rejected at admission threw nothing; the outcome is still known.
            when(policyStore.get("policy-1")).thenReturn(Optional.of(policy("policy-1", TEAM)));

            recorder.recordRunFailureAs(
                    FailureKind.UNKNOWN, "run-3", "policy-1", null, "could not be queued");

            assertThat(store.list(TEAM, null, null, 10)).hasSize(1);
        }

        @Test
        void twoFilesFailingTheSameWayUnderOnePolicyAreTwoIncidents() {
            // The producer records per run and cannot name a file, so a FILE-scoped kind has only
            // the
            // run to tell two documents apart. Tested here rather than against a hand-built
            // RecordFailure, because that is what let three locked files collapse into one row.
            when(policyStore.get("policy-1")).thenReturn(Optional.of(policy("policy-1", TEAM)));

            recorder.recordRunFailure(
                    "run-1", "policy-1", "dana@example.com", null, "locked", passwordFailure());
            recorder.recordRunFailure(
                    "run-2", "policy-1", "dana@example.com", null, "locked", passwordFailure());

            List<FileRunEvent> events = store.list(TEAM, null, null, 10);
            assertThat(events).hasSize(2);
            assertThat(events).allMatch(event -> event.occurrences() == 1);
            assertThat(events)
                    .extracting(FileRunEvent::runId)
                    .containsExactlyInAnyOrder("run-1", "run-2");
        }

        @Test
        void thatSameRunFailingTwiceStaysOneIncident() {
            when(policyStore.get("policy-1")).thenReturn(Optional.of(policy("policy-1", TEAM)));

            recorder.recordRunFailure(
                    "run-1", "policy-1", "dana@example.com", null, "locked", passwordFailure());
            recorder.recordRunFailure(
                    "run-1", "policy-1", "dana@example.com", null, "locked", passwordFailure());

            assertThat(store.list(TEAM, null, null, 10))
                    .singleElement()
                    .extracting(FileRunEvent::occurrences)
                    .isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("team resolution")
    class TeamResolution {

        @Test
        void takesTheTeamFromTheOriginatingPolicy() {
            when(policyStore.get("policy-1")).thenReturn(Optional.of(policy("policy-1", TEAM)));

            recorder.recordRunFailure(
                    "run-1", "policy-1", null, null, "boom", new RuntimeException());

            assertThat(store.list(TEAM, null, null, 10)).hasSize(1);
        }

        @Test
        void leavesAnAdHocRunUnteamedRatherThanGuessing() {
            // No stored policy means no team to attribute it to. Recorded unteamed rather than
            // attributed to whichever team happened to be nearby.
            recorder.recordRunFailure("run-1", null, null, null, "boom", new RuntimeException());

            assertThat(store.list(null, null, null, 10)).hasSize(1);
            assertThat(store.list(TEAM, null, null, 10)).isEmpty();
        }

        @Test
        void survivesAPolicyLookupFailure() {
            when(policyStore.get(anyString())).thenThrow(new RuntimeException("db down"));

            assertThatCode(
                            () ->
                                    recorder.recordRunFailure(
                                            "run-1",
                                            "policy-1",
                                            null,
                                            null,
                                            "boom",
                                            new RuntimeException()))
                    .doesNotThrowAnyException();
            // Still recorded, just unteamed: a lookup problem must not lose the incident.
            assertThat(store.list(null, null, null, 10)).hasSize(1);
        }
    }

    @Nested
    @DisplayName("recording is best effort")
    class BestEffort {

        @Test
        void aStoreFailureIsSwallowedSoItCannotReplaceTheRealFailure() {
            // If this threw, the engine's catch block would report a store error instead of the
            // password problem that actually stopped the run.
            FileRunEventStore broken = mock(FileRunEventStore.class);
            when(broken.record(any())).thenThrow(new RuntimeException("event store unavailable"));
            lenient()
                    .when(policyStore.get("policy-1"))
                    .thenReturn(Optional.of(policy("policy-1", TEAM)));
            PolicyFailureRecorder fragile =
                    new PolicyFailureRecorder(
                            new FailureClassifier(JsonMapper.builder().build()),
                            broken,
                            policyStore);

            assertThatCode(
                            () ->
                                    fragile.recordRunFailure(
                                            "run-1",
                                            "policy-1",
                                            null,
                                            null,
                                            "Policy run failed: locked",
                                            passwordFailure()))
                    .doesNotThrowAnyException();
        }

        @Test
        void aNullCauseDoesNotBreakRecording() {
            when(policyStore.get("policy-1")).thenReturn(Optional.of(policy("policy-1", TEAM)));

            assertThatCode(
                            () ->
                                    recorder.recordRunFailure(
                                            "run-1", "policy-1", null, null, "no cause", null))
                    .doesNotThrowAnyException();
            assertThat(store.list(TEAM, null, null, 10).getFirst().kind())
                    .isEqualTo(FailureKind.UNKNOWN);
        }
    }

    @Nested
    @DisplayName("repeats")
    class Repeats {

        @Test
        void twoIdenticalRunFailuresFoldIntoOneIncident() {
            when(policyStore.get("policy-1")).thenReturn(Optional.of(policy("policy-1", TEAM)));

            recorder.recordRunFailure(
                    "run-1", "policy-1", null, null, "boom", new IOException("x"));
            recorder.recordRunFailure(
                    "run-1", "policy-1", null, null, "boom", new IOException("x"));

            List<FileRunEvent> events = store.list(TEAM, null, null, 10);
            assertThat(events).hasSize(1);
            assertThat(events.getFirst().occurrences()).isEqualTo(2);
        }

        @Test
        void twoDifferentRunsAreSeparateIncidents() {
            // UNKNOWN is RUN-scoped, so the run id is what distinguishes them.
            when(policyStore.get("policy-1")).thenReturn(Optional.of(policy("policy-1", TEAM)));

            recorder.recordRunFailure(
                    "run-1", "policy-1", null, null, "boom", new IOException("x"));
            recorder.recordRunFailure(
                    "run-2", "policy-1", null, null, "boom", new IOException("x"));

            assertThat(store.list(TEAM, null, null, 10)).hasSize(2);
        }
    }
}
