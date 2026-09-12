package stirling.software.proprietary.security.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.service.LicenseServiceInterface;

/**
 * The tier is not fixed for the life of the process, so this gate must not answer from a copy of
 * it. A snapshot is how a Team plan bought after boot stayed refused, and how a cancelled one would
 * stay granted.
 */
class PremiumEndpointAspectTest {

    private final LicenseServiceInterface licenseService = mock(LicenseServiceInterface.class);
    private final PremiumEndpointAspect aspect = new PremiumEndpointAspect(licenseService);

    private ProceedingJoinPoint joinPointReturning(String value) throws Throwable {
        ProceedingJoinPoint point = mock(ProceedingJoinPoint.class);
        when(point.proceed()).thenReturn(value);
        return point;
    }

    @Test
    @DisplayName("refuses below Server")
    void refusesBelowServer() throws Throwable {
        when(licenseService.isRunningProOrHigher()).thenReturn(false);

        assertThatThrownBy(() -> aspect.checkPremiumAccess(joinPointReturning("teams")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("a plan bought after boot is honoured without a restart")
    void honoursAPlanBoughtAfterBoot() throws Throwable {
        // What a purchase looks like from here: the same aspect, asked twice, answered differently.
        when(licenseService.isRunningProOrHigher()).thenReturn(false, true);

        assertThatThrownBy(() -> aspect.checkPremiumAccess(joinPointReturning("teams")))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(aspect.checkPremiumAccess(joinPointReturning("teams"))).isEqualTo("teams");
    }

    @Test
    @DisplayName("a cancelled plan stops working without a restart")
    void refusesOnceCancelled() throws Throwable {
        when(licenseService.isRunningProOrHigher()).thenReturn(true, false);

        assertThat(aspect.checkPremiumAccess(joinPointReturning("teams"))).isEqualTo("teams");
        assertThatThrownBy(() -> aspect.checkPremiumAccess(joinPointReturning("teams")))
                .isInstanceOf(ResponseStatusException.class);
    }
}
