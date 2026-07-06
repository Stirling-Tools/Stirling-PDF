package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import stirling.software.common.service.InternalApiClient;
import stirling.software.proprietary.billing.BillingCategory;

class BillableOperationClassifierTest {

    private static MockHttpServletRequest req(String uri) {
        return new MockHttpServletRequest("POST", uri);
    }

    @Test
    void aiPathIsAi() {
        assertEquals(
                BillingCategory.AI,
                BillableOperationClassifier.categorize(req("/api/v1/ai/tools/foo"), false));
    }

    @Test
    void automationHeaderIsAutomation() {
        MockHttpServletRequest req = req("/api/v1/general/merge");
        req.addHeader(InternalApiClient.AUTOMATION_HEADER, "1");
        assertEquals(
                BillingCategory.AUTOMATION, BillableOperationClassifier.categorize(req, false));
    }

    @Test
    void apiKeyToolCallIsApi() {
        assertEquals(
                BillingCategory.API,
                BillableOperationClassifier.categorize(req("/api/v1/general/merge"), true));
    }

    @Test
    void plainManualToolIsBypassed() {
        assertEquals(
                BillingCategory.BYPASSED,
                BillableOperationClassifier.categorize(req("/api/v1/general/merge"), false));
    }

    @Test
    void automationDominatesAiAndApiKey() {
        // An AI tool dispatched inside a workflow (automation header) + API-key auth → AUTOMATION.
        MockHttpServletRequest req = req("/api/v1/ai/tools/foo");
        req.addHeader(InternalApiClient.AUTOMATION_HEADER, "true");
        assertEquals(BillingCategory.AUTOMATION, BillableOperationClassifier.categorize(req, true));
    }

    @Test
    void aiDominatesApiKey() {
        // A direct API-key call to an AI tool bills as AI, not API.
        assertEquals(
                BillingCategory.AI,
                BillableOperationClassifier.categorize(req("/api/v1/ai/tools/foo"), true));
    }

    @Test
    void aiSegmentNotAtPathStartIsBypassed() {
        // Tightened from substring to prefix: the AI segment mid-path (e.g. behind a proxy prefix)
        // must NOT classify a manual tool as AI.
        assertEquals(
                BillingCategory.BYPASSED,
                BillableOperationClassifier.categorize(req("/proxy/api/v1/ai/tools/foo"), false));
    }

    @Test
    void aiPathUnderContextPathIsAi() {
        // A real context-path deployment still classifies: /<ctx>/api/v1/ai/** is AI.
        MockHttpServletRequest req = req("/stirling/api/v1/ai/tools/foo");
        req.setContextPath("/stirling");
        assertEquals(BillingCategory.AI, BillableOperationClassifier.categorize(req, false));
    }
}
