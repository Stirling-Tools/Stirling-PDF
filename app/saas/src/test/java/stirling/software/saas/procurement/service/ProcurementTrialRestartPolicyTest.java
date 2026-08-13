package stirling.software.saas.procurement.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.saas.procurement.model.ProcurementDeal;

/**
 * Which stages may (re)start a trial is a security policy, not a convenience.
 *
 * <p>From the agreement stage onward a deal's {@code licenseRef} points at the committed annual
 * licence. Starting a trial replaces it with a fresh 14-day key, rewinds the stage and resets the
 * extension counter — so an unguarded restart would downgrade a paying customer's entitlement while
 * Stripe kept billing them. This pins the allowed set so widening it has to be deliberate.
 */
class ProcurementTrialRestartPolicyTest {

    @Test
    @DisplayName("allowed before a deal exists, while exploring, and within the trial")
    void allowsOnlyPreCommitmentStages() {
        assertThat(ProcurementService.canStartTrial(null)).isTrue();
        assertThat(ProcurementService.canStartTrial(ProcurementDeal.STAGE_EXPLORING)).isTrue();
        assertThat(ProcurementService.canStartTrial(ProcurementDeal.STAGE_TRIAL)).isTrue();
    }

    @Test
    @DisplayName("refused once the deal is quoting or beyond")
    void refusesCommittedStages() {
        assertThat(ProcurementService.canStartTrial(ProcurementDeal.STAGE_QUOTE)).isFalse();
        assertThat(ProcurementService.canStartTrial(ProcurementDeal.STAGE_AGREEMENT)).isFalse();
        assertThat(ProcurementService.canStartTrial(ProcurementDeal.STAGE_PAYMENT)).isFalse();
        assertThat(ProcurementService.canStartTrial(ProcurementDeal.STAGE_LIVE)).isFalse();
    }

    @Test
    @DisplayName("an unrecognised stage is refused, not waved through")
    void refusesUnknownStages() {
        // A stage added later, or a hand-edited row, must fail closed.
        assertThat(ProcurementService.canStartTrial("renewal")).isFalse();
        assertThat(ProcurementService.canStartTrial("")).isFalse();
    }
}
