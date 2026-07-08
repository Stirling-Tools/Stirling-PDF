package stirling.software.proprietary.policy.engine;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.function.Supplier;

import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;

/**
 * The {@link ResolveContext} for one policy sweep: scopes ledger calls to the policy, gathers the
 * present-identity union across sources, and vetoes presence cleanup when any source could not be
 * listed completely (pruning would wrongly forget its files).
 */
final class PolicySweep implements ResolveContext {

    private final String policyId;
    private final SweepKind kind;
    private final ProcessedLedger ledger;
    private final Set<String> present = new HashSet<>();
    private boolean cleanupVetoed;

    PolicySweep(String policyId, SweepKind kind, ProcessedLedger ledger) {
        this.policyId = policyId;
        this.kind = kind;
        this.ledger = ledger;
    }

    @Override
    public boolean claim(String identity, String gate, Supplier<String> contentHash) {
        return ledger.claim(policyId, identity, gate, contentHash);
    }

    @Override
    public void settle(
            String identity, String finalGate, String finalContentHash, boolean success) {
        ledger.settle(policyId, identity, finalGate, finalContentHash, success);
    }

    @Override
    public synchronized void reportPresent(Collection<String> identities) {
        if (kind == SweepKind.FULL) {
            present.addAll(identities);
        }
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
}
