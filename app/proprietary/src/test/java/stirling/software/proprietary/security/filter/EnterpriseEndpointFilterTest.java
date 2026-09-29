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
}
