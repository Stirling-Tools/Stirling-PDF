package stirling.software.proprietary.policy.engine;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;

/**
 * The {@link ResolveContext} for one policy sweep: scopes ledger calls to the policy, gathers the
 * present-identity union across all of the policy's sources, and tracks whether presence cleanup is
 * safe. Any source that could not be listed completely (resolve failed, source paused, no bean for
 * its type, non-exhaustive listing) vetoes cleanup for the whole sweep - its files could not be
 * stamped, so pruning would wrongly forget them.
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
    public boolean claim(String identity, String signature) {
        return ledger.claim(policyId, identity, signature);
    }

    @Override
    public void settle(String identity, String finalSignature, boolean success) {
        ledger.settle(policyId, identity, finalSignature, success);
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
