package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.SweepOutcome;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Tests for {@link RetryInFolderAction}, the one action that makes the server process a file for a
 * caller. Mostly about who may press it: a team leader reads rows they may not run.
 */
@ExtendWith(MockitoExtension.class)
class RetryInFolderActionTest {

    private static final String FOLDER_ID = "policy-folder-1";
    private static final String IDENTITY = "/Users/carol/Downloads/invoice.pdf";

    @Mock private PolicyStore policyStore;
    @Mock private PolicyAccessGuard policyAccessGuard;
    @Mock private ProcessedLedger processedLedger;
    @Mock private PolicyRunner policyRunner;
    @Mock private FileRunEventStore store;

    private RetryInFolderAction action;

    @BeforeEach
    void setUp() {
        action =
                new RetryInFolderAction(
                        policyStore, policyAccessGuard, processedLedger, policyRunner, store);
    }

    private static Policy folder(String surface) {
        return new Policy(
                FOLDER_ID,
                "Downloads",
                "carol",
                true,
                false,
                "",
                List.of(),
                List.of(),
                OutputSpec.inline(),
                List.of(),
                3L,
                null,
                surface,
                List.of());
    }

    private static FileRunEvent event(String policyId, String fileId) {
        return new FileRunEvent(
                "evt-1",
                3L,
                "carol",
                FailureKind.UNKNOWN,
                FailureStage.INTERNAL,
                FailureSeverity.ERROR,
                FailureScope.RUN,
                FailureOrigin.POLICY,
                policyId,
                "run-1",
                "source-1",
                fileId,
                "boom",
                "dedup",
                1,
                FileRunEventStatus.NEW,
                null,
                null,
                null,
                null);
    }

    @Nested
    @DisplayName("nobody runs a file in a folder that is not theirs")
    class Authorisation {

        @Test
        void refusesWhenTheGuardDoesNotGrantTheCallerThisFolder() {
            // The guard narrows a processing folder to its owner, so this is a leader reading a
            // colleague's row: visible to them, and not theirs to process.
            when(policyStore.get(FOLDER_ID))
                    .thenReturn(java.util.Optional.of(folder(Policy.SURFACE_PROCESSING_FOLDER)));
            when(policyAccessGuard.canAccess(any(Policy.class))).thenReturn(false);

            assertThatThrownBy(() -> action.execute(event(FOLDER_ID, IDENTITY), Map.of(), "leader"))
                    .isInstanceOf(FailureActionException.class);

            verifyNothingWasTouched();
        }

        @Test
        void refusesARowWhosePolicyIsNotAProcessingFolderAtAll() {
            // An org policy's runs are not a personal folder's, and its files are not addressed by
            // a ledger identity the presser owns.
            when(policyStore.get(FOLDER_ID))
                    .thenReturn(java.util.Optional.of(folder(Policy.SURFACE_POLICY)));

            assertThatThrownBy(() -> action.execute(event(FOLDER_ID, IDENTITY), Map.of(), "carol"))
                    .isInstanceOf(FailureActionException.class);

            verifyNothingWasTouched();
        }

        @Test
        void refusesARowThatNamesNoPolicy() {
            assertThatThrownBy(() -> action.execute(event(null, IDENTITY), Map.of(), "carol"))
                    .isInstanceOf(FailureActionException.class);

            verifyNothingWasTouched();
        }

        @Test
        void answersAForeignFolderAndAMissingOneAlike() {
            // Otherwise the refusal tells a caller whether a folder id exists, which is a probe.
            when(policyStore.get(FOLDER_ID)).thenReturn(java.util.Optional.empty());

            assertThatThrownBy(() -> action.execute(event(FOLDER_ID, IDENTITY), Map.of(), "carol"))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);
        }

        private void verifyNothingWasTouched() {
            verify(processedLedger, never()).forgetFailure(anyString(), anyString());
            verify(policyRunner, never()).runFile(any(), anyString());
        }
    }

    @Nested
    @DisplayName("the owner's own folder")
    class Owner {

        @Test
        void runsOnlyTheFileTheRowNames() {
            when(policyStore.get(FOLDER_ID))
                    .thenReturn(java.util.Optional.of(folder(Policy.SURFACE_PROCESSING_FOLDER)));
            when(policyAccessGuard.canAccess(any(Policy.class))).thenReturn(true);
            when(processedLedger.forgetFailure(FOLDER_ID, IDENTITY)).thenReturn(true);
            when(policyRunner.runFile(any(Policy.class), anyString())).thenReturn(oneRun());
            when(store.applyStatus(any(), any(), any(), any()))
                    .thenReturn(mock(FileRunEvent.class));

            action.execute(event(FOLDER_ID, IDENTITY), Map.of("name", "../../etc/passwd"), "carol");

            // The identity comes from the row, so the inputs cannot redirect it at a sibling file.
            verify(policyRunner)
                    .runFile(any(Policy.class), org.mockito.ArgumentMatchers.eq(IDENTITY));
        }

        @Test
        void leavesTheRowOpenWhenTheFolderYieldedNoRun() {
            // A paused or unreadable folder, or a file that has since left it, starts nothing.
            // Resolving anyway would make the failure vanish with nothing re-run.
            when(policyStore.get(FOLDER_ID))
                    .thenReturn(java.util.Optional.of(folder(Policy.SURFACE_PROCESSING_FOLDER)));
            when(policyAccessGuard.canAccess(any(Policy.class))).thenReturn(true);
            when(processedLedger.forgetFailure(FOLDER_ID, IDENTITY)).thenReturn(true);
            when(policyRunner.runFile(any(Policy.class), anyString())).thenReturn(noRuns());

            assertThatThrownBy(() -> action.execute(event(FOLDER_ID, IDENTITY), Map.of(), "carol"))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.NOTHING_TO_RUN);

            verify(store, never()).applyStatus(any(), any(), any(), any());
        }

        @Test
        void refusesWhenThereIsNoParkedFailureLeftToRun() {
            // Already retried, reverted, or swept: pressing again would claim work nobody asked to
            // redo.
            when(policyStore.get(FOLDER_ID))
                    .thenReturn(java.util.Optional.of(folder(Policy.SURFACE_PROCESSING_FOLDER)));
            when(policyAccessGuard.canAccess(any(Policy.class))).thenReturn(true);
            when(processedLedger.forgetFailure(FOLDER_ID, IDENTITY)).thenReturn(false);

            assertThatThrownBy(() -> action.execute(event(FOLDER_ID, IDENTITY), Map.of(), "carol"))
                    .isInstanceOf(FailureActionException.class);

            verify(policyRunner, never()).runFile(any(), anyString());
        }

        @Test
        void refusesARowThatNamesNoDocument() {
            when(policyStore.get(FOLDER_ID))
                    .thenReturn(java.util.Optional.of(folder(Policy.SURFACE_PROCESSING_FOLDER)));
            when(policyAccessGuard.canAccess(any(Policy.class))).thenReturn(true);

            assertThatThrownBy(() -> action.execute(event(FOLDER_ID, null), Map.of(), "carol"))
                    .isInstanceOf(FailureActionException.class);

            verify(processedLedger, never()).forgetFailure(anyString(), anyString());
        }
    }

    private static SweepOutcome oneRun() {
        return new SweepOutcome(List.of("run-2"), 1, 0, 0, 0, 0);
    }

    private static SweepOutcome noRuns() {
        return new SweepOutcome(List.of(), 0, 0, 0, 0, 0);
    }

    @Test
    void isTheServerHalfOfTheRetryTheBellOffers() {
        assertThat(action.id()).isEqualTo(FailureActionId.OPEN_IN_TOOL);
        assertThat(action.id().canRunOnServer()).isTrue();
        assertThat(action.id().executionFor(true)).isEqualTo(FailureActionId.Execution.SERVER);
    }
}
