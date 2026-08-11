package stirling.software.proprietary.policy.network;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.integration.model.IntegrationType;

class NetworkIntegrationValidatorTest {

    private static NetworkIntegrationValidator validator(boolean allowPrivate) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowPrivateNetworkSources(allowPrivate);
        return new NetworkIntegrationValidator(new NetworkHostGuard(properties));
    }

    private static Map<String, Object> config(String host) {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("protocol", "sftp");
        options.put("host", host);
        options.put("username", "u");
        options.put("password", "p");
        return options;
    }

    @Test
    void reportsTheNetworkType() {
        assertEquals(IntegrationType.NETWORK, validator(true).type());
    }

    @Test
    void acceptsAValidConfig() {
        assertDoesNotThrow(() -> validator(true).validate(config("10.0.0.5")));
    }

    @Test
    void rejectsAMalformedConfig() {
        assertThrows(IllegalArgumentException.class, () -> validator(true).validate(Map.of("host", "h")));
    }

    @Test
    void rejectsAPrivateHostUnlessOptedIn() {
        assertThrows(IllegalArgumentException.class, () -> validator(false).validate(config("10.0.0.5")));
    }
}
