package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;

/** The claim gate, which is where a sweep's scope is decided. */
class PolicySweepTest {

    @Test
    void aTargetedSweepClaimsThatIdentityAndRefusesEveryOther() {
        PolicySweep sweep =
                new PolicySweep(
                        "p1", SweepKind.LIGHT, new InProcessProcessedLedger(), "/in/wanted.pdf");

        assertTrue(sweep.claim("/in/wanted.pdf", "gate-1", () -> null));
        // Refused even though it has no ledger row: a per-file retry must not pick up the
        // folder's other unclaimed files, such as an original a restore just brought back.
        assertFalse(sweep.claim("/in/restored.pdf", "gate-2", () -> null));
    }

    @Test
    void anUntargetedSweepClaimsAnything() {
        PolicySweep sweep =
                new PolicySweep("p1", SweepKind.LIGHT, new InProcessProcessedLedger(), null);

        assertTrue(sweep.claim("/in/a.pdf", "gate-1", () -> null));
        assertTrue(sweep.claim("/in/b.pdf", "gate-2", () -> null));
    }
}
