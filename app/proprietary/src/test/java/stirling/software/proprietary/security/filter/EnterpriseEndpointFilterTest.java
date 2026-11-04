package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import stirling.software.common.service.LicenseServiceInterface;

class EnterpriseEndpointFilterTest {
    @Test
    void purchaseAndRevocationChangeAccessWithoutRestart() throws Exception {
        LicenseServiceInterface license = mock(LicenseServiceInterface.class);
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(license);
        for (String path : new String[] {"/actuator/prometheus"}) {
            when(license.isRunningProOrHigher()).thenReturn(true);
            MockHttpServletResponse paid = new MockHttpServletResponse();
            filter.doFilter(
                    new MockHttpServletRequest("GET", path),
                    paid,
                    (req, res) -> res.setContentType("passed"));
            assertEquals("passed", paid.getContentType());
            when(license.isRunningProOrHigher()).thenReturn(false);
            MockHttpServletResponse revoked = new MockHttpServletResponse();
            filter.doFilter(
                    new MockHttpServletRequest("GET", path),
                    revoked,
                    (req, res) -> res.setContentType("passed"));
            assertEquals(404, revoked.getStatus());
        }
    }

    @Test
    void percentEncodedActuatorPathIsGatedLikeThePlainPath() throws Exception {
        LicenseServiceInterface license = mock(LicenseServiceInterface.class);
        when(license.isRunningProOrHigher()).thenReturn(false);
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(license);

        MockHttpServletRequest encoded =
                new MockHttpServletRequest("GET", "/%61ctuator/prometheus");
        MockHttpServletResponse blocked = new MockHttpServletResponse();
        filter.doFilter(encoded, blocked, (req, res) -> res.setContentType("passed"));
        assertEquals(404, blocked.getStatus());

        MockHttpServletRequest health = new MockHttpServletRequest("GET", "/%61ctuator/health");
        MockHttpServletResponse allowed = new MockHttpServletResponse();
        filter.doFilter(health, allowed, (req, res) -> res.setContentType("passed"));
        assertEquals("passed", allowed.getContentType());
    }

    @Test
    void malformedEscapeIsRejected() throws Exception {
        EnterpriseEndpointFilter filter =
                new EnterpriseEndpointFilter(mock(LicenseServiceInterface.class));
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(
                new MockHttpServletRequest("GET", "/actuator/%zz"),
                response,
                (req, res) -> res.setContentType("passed"));
        assertEquals(400, response.getStatus());
    }
}
