package stirling.software.proprietary.policy.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The {@link ProcessedLedger} contract, run against every implementation so they cannot drift. */
abstract class ProcessedLedgerContractTest {

    static final String POLICY = "p1";
    static final String OTHER_POLICY = "p2";
    static final String FILE = "/in/doc.pdf";
    static final String GATE = "100:1111";
    static final String NEW_GATE = "100:2222";
    static final String HASH = "hash-aaa";
    static final String NEW_HASH = "hash-bbb";

    final AtomicLong clock = new AtomicLong(1_000_000L);

    ProcessedLedger ledger;

    abstract ProcessedLedger newLedger(Supplier<Long> nowMillis);

    @BeforeEach
    void createLedger() {
        ledger = newLedger(clock::get);
    }

    @Test
    void aFileIsClaimedOnceAndSkippedWhileInFlight() {
        assertTrue(ledger.claim(POLICY, FILE, GATE, null));
        assertFalse(ledger.claim(POLICY, FILE, GATE, null));
        assertFalse(ledger.claim(POLICY, FILE, NEW_GATE, null)); // new version waits for settle
    }

    @Test
    void aSettledFileIsSkippedAtTheSameGate() {
        ledger.claim(POLICY, FILE, GATE, null);
        ledger.settle(POLICY, FILE, GATE, null, true);

        assertFalse(ledger.claim(POLICY, FILE, GATE, null));
    }

    @Test
    void aMovedGateIsReclaimedInGateOnlyMode() {
        ledger.claim(POLICY, FILE, GATE, null);
        ledger.settle(POLICY, FILE, GATE, null, true);

        assertTrue(ledger.claim(POLICY, FILE, NEW_GATE, null));
    }

    @Test
    void settlingAtTheOutputsVersionStopsAnInPlaceOverwriteLooping() {
        ledger.claim(POLICY, FILE, GATE, null);
        // The run overwrote the input; settle re-reads and lands on the produced version.
        ledger.settle(POLICY, FILE, NEW_GATE, null, true);

        assertFalse(ledger.claim(POLICY, FILE, NEW_GATE, null)); // own output: skip
        assertTrue(ledger.claim(POLICY, FILE, "100:3333", null)); // later user edit: reprocess
    }

    @Test
    void aFailedFileIsNotRetriedUntilItChanges() {
        ledger.claim(POLICY, FILE, GATE, null);
        ledger.settle(POLICY, FILE, GATE, null, false);

        assertFalse(ledger.claim(POLICY, FILE, GATE, null));
        assertTrue(ledger.claim(POLICY, FILE, NEW_GATE, null));
    }

    @Test
    void aTouchedButUnchangedFileRefreshesTheGateInsteadOfReprocessing() {
        ledger.claim(POLICY, FILE, GATE, hash(HASH));
        ledger.settle(POLICY, FILE, GATE, HASH, true);

        // Same content under a new gate (touch / identical re-copy): verified, not reprocessed.
        assertFalse(ledger.claim(POLICY, FILE, NEW_GATE, hash(HASH)));

        // The gate was refreshed, so the next sweep takes the cheap path: no content read at all.
        CountingSupplier counting = new CountingSupplier(HASH);
        assertFalse(ledger.claim(POLICY, FILE, NEW_GATE, counting));
        assertEquals(0, counting.invocations.get());
    }

    @Test
    void theVerificationTierIsNotConsultedWhileTheGateMatches() {
        ledger.claim(POLICY, FILE, GATE, hash(HASH));
        ledger.settle(POLICY, FILE, GATE, HASH, true);

        CountingSupplier counting = new CountingSupplier(HASH);
        assertFalse(ledger.claim(POLICY, FILE, GATE, counting));
        assertEquals(0, counting.invocations.get());
    }

    @Test
    void aRealContentChangeUnderANewGateIsReprocessed() {
        ledger.claim(POLICY, FILE, GATE, hash(HASH));
        ledger.settle(POLICY, FILE, GATE, HASH, true);

        assertTrue(ledger.claim(POLICY, FILE, NEW_GATE, hash(NEW_HASH)));
    }

    @Test
    void aGateOnlySettledRowCannotBeContentVerifiedSoItReprocesses() {
        ledger.claim(POLICY, FILE, GATE, null);
        ledger.settle(POLICY, FILE, GATE, null, true);

        // The row stored no hash, so "same content" is unprovable: reprocess on gate change.
        assertTrue(ledger.claim(POLICY, FILE, NEW_GATE, hash(HASH)));
    }

    @Test
    void aFailedFileStaysParkedThroughATouch() {
        ledger.claim(POLICY, FILE, GATE, hash(HASH));
        ledger.settle(POLICY, FILE, GATE, HASH, false);

        // A touch must not resurrect an ERROR row; only a real content change does.
        assertFalse(ledger.claim(POLICY, FILE, NEW_GATE, hash(HASH)));
        assertTrue(ledger.claim(POLICY, FILE, "100:3333", hash(NEW_HASH)));
    }

    @Test
    void interruptedRunsAreRetriedABoundedNumberOfTimes() {
        assertTrue(ledger.claim(POLICY, FILE, GATE, null)); // attempt 1 dies with the JVM
        ledger.recoverInterrupted();
        assertTrue(ledger.claim(POLICY, FILE, GATE, null)); // attempt 2
        ledger.recoverInterrupted();
        assertTrue(ledger.claim(POLICY, FILE, GATE, null)); // attempt 3, the last
        ledger.recoverInterrupted();

        assertFalse(ledger.claim(POLICY, FILE, GATE, null)); // parked: no crash-loop
    }

    @Test
    void aNewGateResetsTheInterruptRetryBudgetInGateOnlyMode() {
        for (int attempt = 0; attempt < ProcessedLedger.MAX_ATTEMPTS; attempt++) {
            ledger.claim(POLICY, FILE, GATE, null);
            ledger.recoverInterrupted();
        }
        assertFalse(ledger.claim(POLICY, FILE, GATE, null));

        assertTrue(ledger.claim(POLICY, FILE, NEW_GATE, null));
        ledger.recoverInterrupted();
        assertTrue(ledger.claim(POLICY, FILE, NEW_GATE, null)); // fresh budget at the new version
    }

    @Test
    void aTouchDoesNotResetTheInterruptRetryBudgetWhenContentIsVerified() {
        assertTrue(ledger.claim(POLICY, FILE, GATE, hash(HASH))); // attempt 1
        ledger.recoverInterrupted();
        // Same content, moved gate: still the interrupted work, still bounded.
        assertTrue(ledger.claim(POLICY, FILE, NEW_GATE, hash(HASH))); // attempt 2
        ledger.recoverInterrupted();
        assertTrue(ledger.claim(POLICY, FILE, "100:3333", hash(HASH))); // attempt 3
        ledger.recoverInterrupted();

        assertFalse(ledger.claim(POLICY, FILE, "100:4444", hash(HASH))); // parked
        assertTrue(ledger.claim(POLICY, FILE, "100:5555", hash(NEW_HASH))); // real change: fresh
    }

    @Test
    void recoveryOnlyTouchesInFlightRows() {
        ledger.claim(POLICY, FILE, GATE, null);
        ledger.settle(POLICY, FILE, GATE, null, true);
        ledger.recoverInterrupted();

        assertFalse(ledger.claim(POLICY, FILE, GATE, null)); // still DONE, not retried
    }

    @Test
    void anOutputIsSkippedByItsProducerButSeenByOtherPolicies() {
        ledger.recordOutput(POLICY, FILE, GATE, HASH);

        assertFalse(ledger.claim(POLICY, FILE, GATE, null)); // producer skips its own output
        assertTrue(ledger.claim(OTHER_POLICY, FILE, GATE, null)); // chaining still works
    }

    @Test
    void anOutputIsSkippedByAHashVerifyingProducerEvenIfTheGateMoved() {
        ledger.recordOutput(POLICY, FILE, GATE, HASH);

        assertFalse(ledger.claim(POLICY, FILE, NEW_GATE, hash(HASH)));
    }

    @Test
    void policiesTrackTheSameFileIndependently() {
        assertTrue(ledger.claim(POLICY, FILE, GATE, null));
        assertTrue(ledger.claim(OTHER_POLICY, FILE, GATE, null));
    }

    @Test
    void deletionConsensusNeedsEveryClaimantSettledDone() {
        assertTrue(ledger.allSettledDone(FILE)); // vacuous: no rows yet
        assertTrue(ledger.claim(POLICY, FILE, GATE, null));
        assertTrue(ledger.claim(OTHER_POLICY, FILE, GATE, null));
        ledger.settle(POLICY, FILE, GATE, null, true);
        assertFalse(ledger.allSettledDone(FILE)); // the other claim is still in flight
        ledger.settle(OTHER_POLICY, FILE, GATE, null, true);
        assertTrue(ledger.allSettledDone(FILE));
    }

    @Test
    void aFailedClaimVetoesDeletionConsensus() {
        assertTrue(ledger.claim(POLICY, FILE, GATE, null));
        assertTrue(ledger.claim(OTHER_POLICY, FILE, GATE, null));
        ledger.settle(POLICY, FILE, GATE, null, true);
        ledger.settle(OTHER_POLICY, FILE, GATE, null, false);
        assertFalse(ledger.allSettledDone(FILE));
    }

    @Test
    void anInterruptedClaimVetoesDeletionConsensus() {
        assertTrue(ledger.claim(POLICY, FILE, GATE, null));
        ledger.recoverInterrupted();
        assertFalse(ledger.allSettledDone(FILE));
    }

    @Test
    void settleRecreatesARowRemovedMidRun() {
        ledger.claim(POLICY, FILE, GATE, null);
        ledger.clearPolicy(POLICY); // e.g. a clear-history while the run is in flight
        ledger.settle(POLICY, FILE, GATE, null, true);

        assertFalse(ledger.claim(POLICY, FILE, GATE, null));
    }

    @Test
    void presenceCleanupRemovesOnlyUnseenSettledRows() {
        String inFlight = "/in/in-flight.pdf";
        String stillPresent = "/in/still-present.pdf";
        String deleted = "/in/deleted.pdf";
        ledger.claim(POLICY, inFlight, GATE, null);
        ledger.recordOutput(POLICY, stillPresent, GATE, HASH);
        ledger.recordOutput(POLICY, deleted, GATE, HASH);

        clock.addAndGet(10_000);
        long sweepStart = clock.get();
        ledger.markSeen(POLICY, List.of(inFlight, stillPresent)); // deleted.pdf is gone from disk
        assertEquals(1, ledger.deleteUnseen(POLICY, sweepStart));

        assertFalse(ledger.claim(POLICY, inFlight, GATE, null)); // in-flight row survived
        assertFalse(ledger.claim(POLICY, stillPresent, GATE, null)); // stamped row survived
        assertTrue(ledger.claim(POLICY, deleted, GATE, null)); // forgotten: a re-drop reprocesses
    }

    @Test
    void presenceCleanupNeverRemovesInFlightRowsEvenUnstamped() {
        ledger.claim(POLICY, FILE, GATE, null);
        clock.addAndGet(10_000);

        assertEquals(0, ledger.deleteUnseen(POLICY, clock.get()));
        assertFalse(ledger.claim(POLICY, FILE, GATE, null));
    }

    @Test
    void rowsWrittenDuringTheSweepSurviveItsCleanup() {
        long sweepStart = clock.get();
        // Recorded after the sweep's cutoff: unseen by it, but newer, so it must survive.
        clock.addAndGet(5);
        ledger.recordOutput(POLICY, FILE, GATE, HASH);

        assertEquals(0, ledger.deleteUnseen(POLICY, sweepStart));
        assertFalse(ledger.claim(POLICY, FILE, GATE, null));
    }

    @Test
    void markSeenOnUnknownIdentitiesIsANoOp() {
        ledger.markSeen(POLICY, List.of("/never/claimed.pdf"));
        assertEquals(0, ledger.deleteUnseen(POLICY, clock.get()));
    }

    @Test
    void clearPolicyForgetsOnlyThatPolicy() {
        ledger.claim(POLICY, FILE, GATE, null);
        ledger.settle(POLICY, FILE, GATE, null, true);
        ledger.claim(OTHER_POLICY, FILE, GATE, null);
        ledger.settle(OTHER_POLICY, FILE, GATE, null, true);

        ledger.clearPolicy(POLICY);

        assertTrue(ledger.claim(POLICY, FILE, GATE, null));
        assertFalse(ledger.claim(OTHER_POLICY, FILE, GATE, null));
    }

    static Supplier<String> hash(String value) {
        return () -> value;
    }

    static final class CountingSupplier implements Supplier<String> {
        final AtomicInteger invocations = new AtomicInteger();
        private final String value;

        CountingSupplier(String value) {
            this.value = value;
        }

        @Override
        public String get() {
            invocations.incrementAndGet();
            return value;
        }
    }
}
