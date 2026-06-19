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
}
