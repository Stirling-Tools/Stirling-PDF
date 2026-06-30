package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import stirling.software.common.service.InternalApiClient;

class BillableOperationClassifierTest {

    @Test
    void aiPathIsBillable() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/tools/foo");
        assertTrue(BillableOperationClassifier.isBillable(req));
    }

    @Test
    void automationHeaderIsBillable() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/merge");
        req.addHeader(InternalApiClient.AUTOMATION_HEADER, "1");
        assertTrue(BillableOperationClassifier.isBillable(req));
    }

    @Test
    void plainManualToolIsFree() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/merge");
        assertFalse(BillableOperationClassifier.isBillable(req));
    }

    @Test
    void aiSegmentNotAtPathStartIsFree() {
        // Tightened from substring to prefix: the AI segment appearing mid-path (e.g. behind a
        // proxy prefix) must NOT classify a manual tool as billable.
        MockHttpServletRequest req =
                new MockHttpServletRequest("POST", "/proxy/api/v1/ai/tools/foo");
        assertFalse(BillableOperationClassifier.isBillable(req));
    }

    @Test
    void aiPathUnderContextPathIsBillable() {
        // A real context-path deployment still classifies: /<ctx>/api/v1/ai/** is billable.
        MockHttpServletRequest req =
                new MockHttpServletRequest("POST", "/stirling/api/v1/ai/tools/foo");
        req.setContextPath("/stirling");
        assertTrue(BillableOperationClassifier.isBillable(req));
    }
}
