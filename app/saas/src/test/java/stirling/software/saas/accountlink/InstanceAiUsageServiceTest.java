package stirling.software.saas.accountlink;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.saas.payg.charge.ChargeContext;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;

class InstanceAiUsageServiceTest {

    private final JobChargeService charges = mock(JobChargeService.class);
    private final LinkedInstanceRepository instances = mock(LinkedInstanceRepository.class);
    private final InstanceAiUsageService usage = new InstanceAiUsageService(charges, instances);

    @ParameterizedTest
    @ValueSource(strings = {"/health", "/api/v1/agents/capabilities", "/api/v1/documents/by-owner"})
    void healthAndLogoutCleanupNeverCharge(String path) {
        usage.recordCall(99L, 42L, path);

        verifyNoInteractions(charges, instances);
    }

    @Test
    void reasoningChargesTheLinkedTeamOnce() {
        LinkedInstance instance = new LinkedInstance();
        instance.setCreatedByUserId(7L);
        when(instances.findById(42L)).thenReturn(Optional.of(instance));

        usage.recordCall(99L, 42L, "/api/v1/pdf/questions");

        verify(charges)
                .chargeStandalone(
                        new ChargeContext(
                                7L,
                                99L,
                                JobSource.LINKED_INSTANCE,
                                ProcessType.SINGLE_TOOL,
                                BillingCategory.AI,
                                null),
                        1);
    }
}
