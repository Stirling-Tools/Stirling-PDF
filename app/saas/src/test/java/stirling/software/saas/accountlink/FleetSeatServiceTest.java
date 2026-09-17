package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import stirling.software.saas.model.SaasTeamExtensions;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;

class FleetSeatServiceTest {
    private final LinkedInstanceRepository instances = mock(LinkedInstanceRepository.class);
    private final SaasTeamExtensionsRepository teams = mock(SaasTeamExtensionsRepository.class);
    private final FleetSeatService service = new FleetSeatService(instances, teams);

    @Test
    void allowanceSubtractsCloudAndOtherDeploymentsButNeverBecomesNegative() {
        var team = new SaasTeamExtensions();
        team.setMaxSeats(100);
        team.setSeatsUsed(8);
        when(teams.findByTeamId(42L)).thenReturn(Optional.of(team));
        when(instances.otherDeploymentSeats(42L, 1L)).thenReturn(75L, 120L);
        assertThat(service.allowance(42L, 1L)).isEqualTo(17);
        assertThat(service.allowance(42L, 1L)).isZero();
    }

    @Test
    void reportStoresZeroAndCannotRestoreRevokedDeployments() {
        when(instances.reportSeats(eq(42L), eq(1L), eq(0), any())).thenReturn(1, 0);
        service.report(42L, 1L, 0);
        assertThatThrownBy(() -> service.report(42L, 1L, 0))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.report(42L, 1L, -1))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
