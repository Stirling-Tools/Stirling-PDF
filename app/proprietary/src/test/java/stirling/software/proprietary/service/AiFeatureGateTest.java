package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;

/**
 * Every AI capability entry point calls the matching {@code require*} before reaching the engine.
 * These lock in fail-closed behaviour: a 503 when the engine is disabled OR the individual feature
 * flag is off, and a clean pass only when both are on.
 */
class AiFeatureGateTest {

    private ApplicationProperties props;
    private AiFeatureGate gate;

    @BeforeEach
    void setUp() {
        props = new ApplicationProperties();
        props.getAiEngine().setEnabled(true); // features default all-on
        gate = new AiFeatureGate(props);
    }

    @Test
    void passesWhenEngineEnabledAndFeatureOn() {
        assertDoesNotThrow(() -> gate.requireClassify());
        assertDoesNotThrow(() -> gate.requireChat());
    }

    @Test
    void throws503WhenFeatureFlagOff() {
        props.getAiEngine().getFeatures().setClassify(false);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> gate.requireClassify());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }

    @Test
    void throws503WhenEngineDisabledEvenIfFeatureOn() {
        props.getAiEngine().setEnabled(false); // feature flag still true

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> gate.requireChat());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }
}
