package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

@ExtendWith(MockitoExtension.class)
class InstanceEntitlementInterceptorTest {

    @Mock private InstanceEntitlementGate gate;

    private boolean preHandle(MockHttpServletResponse response) throws Exception {
        return new InstanceEntitlementInterceptor(gate)
                .preHandle(
                        new MockHttpServletRequest("GET", "/api/v1/ai/x"), response, new Object());
    }

    @Test
    void allowsWhenGateAllows() throws Exception {
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertTrue(preHandle(response));
        assertEquals(200, response.getStatus());
    }

    @Test
    void blocksWith402AndLinkSignalWhenGateBlocks() throws Exception {
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.block(GateDecision.Reason.NOT_LINKED));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(preHandle(response));
        assertEquals(HttpStatus.PAYMENT_REQUIRED.value(), response.getStatus());
        assertEquals("application/json", response.getContentType());
        assertTrue(response.getContentAsString().contains("ACCOUNT_LINK_REQUIRED"));
        assertTrue(response.getContentAsString().contains("NOT_LINKED"));
    }

    @Test
    void failsOpenWhenGateThrows() throws Exception {
        // A DB / SaaS blip while resolving entitlement must never hard-block billable work.
        when(gate.evaluate(anyBoolean()))
                .thenThrow(new RuntimeException("entitlement source down"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertTrue(preHandle(response));
        assertEquals(200, response.getStatus());
    }
}
