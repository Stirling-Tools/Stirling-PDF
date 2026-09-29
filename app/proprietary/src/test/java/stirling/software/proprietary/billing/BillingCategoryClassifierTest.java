package stirling.software.proprietary.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class BillingCategoryClassifierTest {

    @Test
    void automationWinsOverEverything() {
        assertEquals(
                BillingCategory.AUTOMATION, BillingCategoryClassifier.classify(true, true, true));
    }

    @Test
    void aiWinsOverApiKey() {
        assertEquals(BillingCategory.AI, BillingCategoryClassifier.classify(false, true, true));
    }

    @Test
    void apiKeyWhenNotAutomationOrAi() {
        assertEquals(BillingCategory.API, BillingCategoryClassifier.classify(false, false, true));
    }

    @Test
    void bypassedWhenNoSignal() {
        assertEquals(
                BillingCategory.BYPASSED, BillingCategoryClassifier.classify(false, false, false));
    }
}
