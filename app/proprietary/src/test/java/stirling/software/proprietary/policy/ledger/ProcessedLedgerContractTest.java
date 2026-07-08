package stirling.software.proprietary.policy.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The {@link ProcessedLedger} contract, run against every implementation (in-process and JPA) so
 * the two cannot drift: claim-once semantics, signature-change reclaim, sticky errors, bounded
 * interrupt retries, per-policy isolation, output recording, and presence cleanup.
 */
abstract class ProcessedLedgerContractTest {

    static final String POLICY = "p1";
    static final String OTHER_POLICY = "p2";
    static final String FILE = "/in/doc.pdf";
    static final String SIG = "100:1111";
    static final String NEW_SIG = "100:2222";

    final AtomicLong clock = new AtomicLong(1_000_000L);

    ProcessedLedger ledger;

    abstract ProcessedLedger newLedger(Supplier<Long> nowMillis);

    @BeforeEach
    void createLedger() {
        ledger = newLedger(clock::get);
    }

    @Test
    void aFileIsClaimedOnceAndSkippedWhileInFlight() {
        assertTrue(ledger.claim(POLICY, FILE, SIG));
        assertFalse(ledger.claim(POLICY, FILE, SIG));
        assertFalse(ledger.claim(POLICY, FILE, NEW_SIG)); // even a new version waits for settle
    }

    @Test
    void aSettledFileIsSkippedAtTheSameSignature() {
        ledger.claim(POLICY, FILE, SIG);
        ledger.settle(POLICY, FILE, SIG, true);

        assertFalse(ledger.claim(POLICY, FILE, SIG));
    }

    @Test
    void aChangedSignatureIsReclaimed() {
        ledger.claim(POLICY, FILE, SIG);
        ledger.settle(POLICY, FILE, SIG, true);

        assertTrue(ledger.claim(POLICY, FILE, NEW_SIG));
    }

    @Test
    void settlingAtTheOutputsSignatureStopsAnInPlaceOverwriteLooping() {
        ledger.claim(POLICY, FILE, SIG);
        // The run overwrote the input; settle re-stats and lands on the produced version.
        ledger.settle(POLICY, FILE, NEW_SIG, true);

        assertFalse(ledger.claim(POLICY, FILE, NEW_SIG)); // own output: skip
        assertTrue(ledger.claim(POLICY, FILE, "100:3333")); // later user edit: reprocess
    }

    @Test
    void aFailedFileIsNotRetriedUntilItChanges() {
        ledger.claim(POLICY, FILE, SIG);
        ledger.settle(POLICY, FILE, SIG, false);

        assertFalse(ledger.claim(POLICY, FILE, SIG));
        assertTrue(ledger.claim(POLICY, FILE, NEW_SIG));
    }

    @Test
    void interruptedRunsAreRetriedABoundedNumberOfTimes() {
        assertTrue(ledger.claim(POLICY, FILE, SIG)); // attempt 1 dies with the JVM
        ledger.recoverInterrupted();
        assertTrue(ledger.claim(POLICY, FILE, SIG)); // attempt 2
        ledger.recoverInterrupted();
        assertTrue(ledger.claim(POLICY, FILE, SIG)); // attempt 3, the last
        ledger.recoverInterrupted();

        assertFalse(ledger.claim(POLICY, FILE, SIG)); // parked: no crash-loop
    }

    @Test
    void aNewSignatureResetsTheInterruptRetryBudget() {
        for (int attempt = 0; attempt < ProcessedLedger.MAX_ATTEMPTS; attempt++) {
            ledger.claim(POLICY, FILE, SIG);
            ledger.recoverInterrupted();
        }
        assertFalse(ledger.claim(POLICY, FILE, SIG));

        assertTrue(ledger.claim(POLICY, FILE, NEW_SIG));
        ledger.recoverInterrupted();
        assertTrue(ledger.claim(POLICY, FILE, NEW_SIG)); // fresh budget at the new version
    }

    @Test
    void recoveryOnlyTouchesInFlightRows() {
        ledger.claim(POLICY, FILE, SIG);
        ledger.settle(POLICY, FILE, SIG, true);
        ledger.recoverInterrupted();

        assertFalse(ledger.claim(POLICY, FILE, SIG)); // still DONE, not retried
    }

    @Test
    void anOutputIsSkippedByItsProducerButSeenByOtherPolicies() {
        ledger.recordOutput(POLICY, FILE, SIG);

        assertFalse(ledger.claim(POLICY, FILE, SIG)); // producer skips its own output
        assertTrue(ledger.claim(OTHER_POLICY, FILE, SIG)); // chaining still works
    }

    @Test
    void policiesTrackTheSameFileIndependently() {
        assertTrue(ledger.claim(POLICY, FILE, SIG));
        assertTrue(ledger.claim(OTHER_POLICY, FILE, SIG));
    }

    @Test
    void settleRecreatesARowRemovedMidRun() {
        ledger.claim(POLICY, FILE, SIG);
        ledger.clearPolicy(POLICY); // e.g. a clear-history while the run is in flight
        ledger.settle(POLICY, FILE, SIG, true);

        assertFalse(ledger.claim(POLICY, FILE, SIG));
    }

    @Test
    void presenceCleanupRemovesOnlyUnseenSettledRows() {
        String inFlight = "/in/in-flight.pdf";
        String stillPresent = "/in/still-present.pdf";
        String deleted = "/in/deleted.pdf";
        ledger.claim(POLICY, inFlight, SIG);
        ledger.recordOutput(POLICY, stillPresent, SIG);
        ledger.recordOutput(POLICY, deleted, SIG);

        clock.addAndGet(10_000);
        long sweepStart = clock.get();
        ledger.markSeen(POLICY, List.of(inFlight, stillPresent)); // deleted.pdf is gone from disk
        assertEquals(1, ledger.deleteUnseen(POLICY, sweepStart));

        assertFalse(ledger.claim(POLICY, inFlight, SIG)); // in-flight row survived
        assertFalse(ledger.claim(POLICY, stillPresent, SIG)); // stamped row survived
        assertTrue(ledger.claim(POLICY, deleted, SIG)); // forgotten: a re-drop reprocesses
    }

    @Test
    void presenceCleanupNeverRemovesInFlightRowsEvenUnstamped() {
        ledger.claim(POLICY, FILE, SIG);
        clock.addAndGet(10_000);

        assertEquals(0, ledger.deleteUnseen(POLICY, clock.get()));
        assertFalse(ledger.claim(POLICY, FILE, SIG));
    }

    @Test
    void rowsWrittenDuringTheSweepSurviveItsCleanup() {
        long sweepStart = clock.get();
        // A concurrent delivery records an output (already DONE, not shielded by PROCESSING)
        // after this sweep began listing; the sweep never saw the file, but the row is newer
        // than the cutoff and must survive.
        clock.addAndGet(5);
        ledger.recordOutput(POLICY, FILE, SIG);

        assertEquals(0, ledger.deleteUnseen(POLICY, sweepStart));
        assertFalse(ledger.claim(POLICY, FILE, SIG));
    }

    @Test
    void markSeenOnUnknownIdentitiesIsANoOp() {
        ledger.markSeen(POLICY, List.of("/never/claimed.pdf"));
        assertEquals(0, ledger.deleteUnseen(POLICY, clock.get()));
    }

    @Test
    void clearPolicyForgetsOnlyThatPolicy() {
        ledger.claim(POLICY, FILE, SIG);
        ledger.settle(POLICY, FILE, SIG, true);
        ledger.claim(OTHER_POLICY, FILE, SIG);
        ledger.settle(OTHER_POLICY, FILE, SIG, true);

        ledger.clearPolicy(POLICY);

        assertTrue(ledger.claim(POLICY, FILE, SIG));
        assertFalse(ledger.claim(OTHER_POLICY, FILE, SIG));
    }
}
