package stirling.software.proprietary.security.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.proprietary.security.configuration.ee.DynamicLicenseService;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.filter.EnterpriseEndpointFilter;
import stirling.software.proprietary.service.UserLicenseSettingsService;

/**
 * The licence gates read the live licence rather than the boolean captured at startup, so
 * activating a key opens them without a restart. The startup value stays a floor the live check can
 * only widen, which keeps profiles that grant premium without a key (saas) working.
 */
class LicenceEndpointGateTest {

    private static ProceedingJoinPoint proceedingJoinPoint() throws Throwable {
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        when(joinPoint.proceed()).thenReturn("proceeded");
        return joinPoint;
    }

    private static LicenseServiceInterface licence(boolean proOrHigher, boolean enterprise) {
        LicenseServiceInterface service = mock(LicenseServiceInterface.class);
        when(service.isRunningProOrHigher()).thenReturn(proOrHigher);
        when(service.isRunningEE()).thenReturn(enterprise);
        return service;
    }

    @Nested
    class Premium {

        @Test
        @DisplayName("a licence activated after startup opens the gate without a restart")
        void liveLicenceOpensTheGate() throws Throwable {
            PremiumEndpointAspect aspect = new PremiumEndpointAspect(false, licence(true, false));

            assertEquals("proceeded", aspect.checkPremiumAccess(proceedingJoinPoint()));
        }

        @Test
        @DisplayName("no licence at startup and none activated stays forbidden")
        void unlicensedStaysForbidden() throws Throwable {
            PremiumEndpointAspect aspect = new PremiumEndpointAspect(false, licence(false, false));
            ProceedingJoinPoint joinPoint = proceedingJoinPoint();

            ResponseStatusException thrown =
                    assertThrows(
                            ResponseStatusException.class,
                            () -> aspect.checkPremiumAccess(joinPoint));
            assertEquals(HttpStatus.FORBIDDEN, thrown.getStatusCode());
        }

        @Test
        @DisplayName("a profile granting premium without a key keeps access")
        void startupGrantSurvivesAnUnlicensedLiveCheck() throws Throwable {
            PremiumEndpointAspect aspect = new PremiumEndpointAspect(true, licence(false, false));

            assertEquals("proceeded", aspect.checkPremiumAccess(proceedingJoinPoint()));
        }

        @Test
        @DisplayName("builds with no licence service fall back to the startup value")
        void noLicenceServiceFallsBackToStartup() throws Throwable {
            PremiumEndpointAspect granted = new PremiumEndpointAspect(true, null);
            PremiumEndpointAspect denied = new PremiumEndpointAspect(false, null);
            ProceedingJoinPoint joinPoint = proceedingJoinPoint();

            assertEquals("proceeded", granted.checkPremiumAccess(proceedingJoinPoint()));
            assertThrows(ResponseStatusException.class, () -> denied.checkPremiumAccess(joinPoint));
        }
    }

    @Nested
    class Enterprise {

        @Test
        @DisplayName("a licence activated after startup opens the gate without a restart")
        void liveLicenceOpensTheGate() throws Throwable {
            EnterpriseEndpointAspect aspect =
                    new EnterpriseEndpointAspect(false, licence(true, true));

            assertEquals("proceeded", aspect.checkEnterpriseAccess(proceedingJoinPoint()));
        }

        @Test
        @DisplayName("a Server licence does not open an Enterprise-only endpoint")
        void serverLicenceIsNotEnterprise() throws Throwable {
            EnterpriseEndpointAspect aspect =
                    new EnterpriseEndpointAspect(false, licence(true, false));
            ProceedingJoinPoint joinPoint = proceedingJoinPoint();

            ResponseStatusException thrown =
                    assertThrows(
                            ResponseStatusException.class,
                            () -> aspect.checkEnterpriseAccess(joinPoint));
            assertEquals(HttpStatus.FORBIDDEN, thrown.getStatusCode());
        }

        @Test
        @DisplayName("a profile granting enterprise without a key keeps access")
        void startupGrantSurvivesAnUnlicensedLiveCheck() throws Throwable {
            EnterpriseEndpointAspect aspect =
                    new EnterpriseEndpointAspect(true, licence(false, false));

            assertEquals("proceeded", aspect.checkEnterpriseAccess(proceedingJoinPoint()));
        }
    }

    @Nested
    class ActuatorFilter {

        private static MockHttpServletResponse filter(
                boolean startupGrant, LicenseServiceInterface service, String uri)
                throws Exception {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
            request.setRequestURI(uri);
            MockHttpServletResponse response = new MockHttpServletResponse();
            new EnterpriseEndpointFilter(startupGrant, service)
                    .doFilter(request, response, new MockFilterChain());
            return response;
        }

        @Test
        @DisplayName("a licence activated after startup unblocks metrics without a restart")
        void liveLicenceUnblocksMetrics() throws Exception {
            assertEquals(
                    HttpStatus.OK.value(),
                    filter(false, licence(true, false), "/actuator/prometheus").getStatus());
        }

        @Test
        @DisplayName("metrics stay hidden while unlicensed")
        void unlicensedHidesMetrics() throws Exception {
            assertEquals(
                    HttpStatus.NOT_FOUND.value(),
                    filter(false, licence(false, false), "/actuator/prometheus").getStatus());
        }

        @Test
        @DisplayName("a request outside actuator never reaches the licence service")
        void nonActuatorRequestsSkipTheLicenceLookup() throws Exception {
            LicenseServiceInterface service = mock(LicenseServiceInterface.class);

            assertEquals(
                    HttpStatus.OK.value(),
                    filter(false, service, "/api/v1/general/merge-pdfs").getStatus());
            verify(service, never()).isRunningProOrHigher();
        }

        @Test
        @DisplayName("health checks stay reachable while unlicensed")
        void healthChecksAlwaysPass() {
            assertDoesNotThrow(
                    () ->
                            assertEquals(
                                    HttpStatus.OK.value(),
                                    filter(false, licence(false, false), "/actuator/health")
                                            .getStatus()));
        }
    }

    /**
     * The live check is a read of the tier {@link LicenseKeyChecker} stored the last time the key
     * changed. Keygen is contacted on that refresh, never on the request path, so no gate pays for
     * a verification per request.
     */
    @Nested
    class LiveLookup {

        private static LicenseKeyChecker checkerFor(KeygenLicenseVerifier verifier) {
            ApplicationProperties properties = new ApplicationProperties();
            properties.getPremium().setEnabled(true);
            properties.getPremium().setKey("a-key");
            LicenseKeyChecker checker =
                    new LicenseKeyChecker(
                            verifier, properties, mock(UserLicenseSettingsService.class));
            checker.init();
            return checker;
        }

        @Test
        @DisplayName("no gate re-verifies the key while serving a request")
        void gatesReadTheStoredTier() throws Throwable {
            KeygenLicenseVerifier verifier = mock(KeygenLicenseVerifier.class);
            when(verifier.verifyLicense(anyString())).thenReturn(License.ENTERPRISE);
            DynamicLicenseService service = new DynamicLicenseService(checkerFor(verifier));
            MockHttpServletRequest request =
                    new MockHttpServletRequest("GET", "/actuator/prometheus");
            request.setRequestURI("/actuator/prometheus");
            clearInvocations(verifier);

            new EnterpriseEndpointFilter(false, service)
                    .doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
            new PremiumEndpointAspect(false, service).checkPremiumAccess(proceedingJoinPoint());
            new EnterpriseEndpointAspect(false, service)
                    .checkEnterpriseAccess(proceedingJoinPoint());

            verify(verifier, never()).verifyLicense(anyString());
        }

        @Test
        @DisplayName("the stored tier is what a post-startup activation refreshes")
        void resyncOpensTheGate() throws Throwable {
            KeygenLicenseVerifier verifier = mock(KeygenLicenseVerifier.class);
            when(verifier.verifyLicense(anyString())).thenReturn(License.NORMAL);
            LicenseKeyChecker checker = checkerFor(verifier);
            PremiumEndpointAspect aspect =
                    new PremiumEndpointAspect(false, new DynamicLicenseService(checker));
            ProceedingJoinPoint blocked = proceedingJoinPoint();

            assertThrows(ResponseStatusException.class, () -> aspect.checkPremiumAccess(blocked));

            when(verifier.verifyLicense(anyString())).thenReturn(License.SERVER);
            checker.resyncLicense();

            assertEquals("proceeded", aspect.checkPremiumAccess(proceedingJoinPoint()));
        }
    }
}
