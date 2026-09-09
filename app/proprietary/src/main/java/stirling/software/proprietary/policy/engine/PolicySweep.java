package stirling.software.proprietary.policy.engine;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.ledger.ClaimState;
import stirling.software.proprietary.policy.ledger.ProcessedFileStatus;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;

/**
 * The {@link ResolveContext} for one policy sweep: scopes ledger calls to the policy, gathers the
 * present-identity union across sources, prefetches claim state in bulk so per-file claims skip
 * their row lookup, and vetoes presence cleanup when any source could not be listed completely
 * (pruning would wrongly forget its files).
 */
final class PolicySweep implements ResolveContext {

    private final String policyId;
    private final SweepKind kind;
    private final ProcessedLedger ledger;
    private final Set<String> present = new HashSet<>();
    // Claim states loaded in bulk at reportPresent; a claim outside the prefetch falls back to a
    // single lookup. A stale entry cannot double-claim (the ledger re-checks every transition),
    // it can only defer a file to the next sweep.
    private final Map<String, ClaimState> prefetched = new HashMap<>();
    private final Set<String> prefetchedIdentities = new HashSet<>();
    private boolean cleanupVetoed;

    PolicySweep(String policyId, SweepKind kind, ProcessedLedger ledger) {
        this.policyId = policyId;
        this.kind = kind;
        this.ledger = ledger;
    }

    @Override
    public synchronized boolean claim(String identity, String gate, Supplier<String> contentHash) {
        ClaimState observed =
                prefetchedIdentities.contains(identity)
                        ? prefetched.get(identity)
                        : ledger.statesFor(policyId, List.of(identity)).get(identity);
        boolean claimed = ledger.claim(policyId, identity, gate, contentHash, observed);
        if (claimed) {
            // A nested source surfacing the same file later in this sweep sees it in flight
            // without another lookup.
            prefetchedIdentities.add(identity);
            prefetched.put(identity, new ClaimState(ProcessedFileStatus.PROCESSING, gate, null));
        }
        return claimed;
    }

    @Override
    public void settle(
            String identity, String finalGate, String finalContentHash, boolean success) {
        ledger.settle(policyId, identity, finalGate, finalContentHash, success);
    }

    @Override
    public boolean allSettledDone(String identity) {
        // Deliberately not policy-scoped: consume deletion needs every claimant's consensus.
        return ledger.allSettledDone(identity);
    }

    @Override
    public synchronized void reportPresent(Collection<String> identities) {
        if (kind == SweepKind.FULL) {
            present.addAll(identities);
        }
        prefetched.putAll(ledger.statesFor(policyId, identities));
        prefetchedIdentities.addAll(identities);
    }

    synchronized void vetoCleanup() {
        cleanupVetoed = true;
    }

    synchronized boolean cleanupAllowed() {
        return kind == SweepKind.FULL && !cleanupVetoed;
    }

    synchronized Set<String> presentIdentities() {
        return Set.copyOf(present);
    }

    /**
     * Summarise the sweep from state already in hand (no extra ledger reads): the prefetched rows
     * were loaded before claiming, and successful claims flipped their entries to PROCESSING, so
     * what remains DONE or ERROR is exactly what this sweep skipped.
     */
    synchronized SweepOutcome outcome(List<String> runIds) {
        int alreadyProcessed = 0;
        int parked = 0;
        int processing = 0;
        for (String identity : present) {
            ClaimState state = prefetched.get(identity);
            if (state == null) {
                continue;
            }
            switch (state.status()) {
                case DONE -> alreadyProcessed++;
                case ERROR -> parked++;
                case PROCESSING, INTERRUPTED -> processing++;
            }
        }
        return new SweepOutcome(
                runIds,
                present.size(),
                alreadyProcessed,
                parked,
                Math.max(0, processing - runIds.size()));
    }
}
