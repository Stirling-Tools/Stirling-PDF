package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.util.List;
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
        assertThat(service.allowance(42L, 1L)).isEqualTo(18);
        assertThat(service.allowance(42L, 1L)).isZero();
    }

    @Test
    void requiredCloudOwnerDoesNotConsumeTheLinkedServersFreeAllowance() {
        var team = new SaasTeamExtensions();
        team.setMaxSeats(5);
        team.setSeatsUsed(1);
        when(teams.findByTeamId(42L)).thenReturn(Optional.of(team));
        assertThat(service.allowance(42L, 1L)).isEqualTo(5);
        team.setSeatsUsed(0);
        assertThat(service.allowance(42L, 1L)).isEqualTo(5);
    }

    @Test
    void breakdownExemptsOneOwnerAndRetainsUnknownDeploymentCounts() {
        var team = new SaasTeamExtensions();
        team.setSeatsUsed(3);
        when(teams.findByTeamId(42L)).thenReturn(Optional.of(team));
        var unreported = new LinkedInstance();
        unreported.setDeviceId("first");
        unreported.setName("Office");
        var reported = new LinkedInstance();
        reported.setSeatCount(7);
        reported.setDeviceId("second");
        var revoked = new LinkedInstance();
        revoked.setRevokedAt(LocalDateTime.now());
        revoked.setSeatCount(99);
        when(instances.findByTeamIdOrderByCreatedAtDesc(42L))
                .thenReturn(List.of(unreported, reported, revoked));
        var breakdown = service.breakdown(42L);
        assertThat(breakdown.cloudUsers()).isEqualTo(2);
        assertThat(breakdown.excludedOwners()).isEqualTo(1);
        assertThat(breakdown.deployments()).hasSize(2);
        assertThat(breakdown.deployments().getFirst().users()).isNull();
        when(instances.findByTeamIdOrderByCreatedAtDesc(42L)).thenReturn(List.of(revoked));
        assertThat(service.breakdown(42L).cloudUsers()).isEqualTo(3);
        assertThat(service.breakdown(42L).excludedOwners()).isZero();
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
