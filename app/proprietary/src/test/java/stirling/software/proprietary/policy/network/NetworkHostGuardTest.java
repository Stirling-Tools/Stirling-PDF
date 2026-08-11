package stirling.software.proprietary.policy.network;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class NetworkHostGuardTest {

    private static NetworkHostGuard guard(boolean allowPrivate) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowPrivateNetworkSources(allowPrivate);
        return new NetworkHostGuard(properties);
    }

    private static NetworkHostGuard guardWithAllowlist(String... hosts) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowedPrivateNetworkHosts(List.of(hosts));
        return new NetworkHostGuard(properties);
    }

    @Test
    void rejectsLoopbackByDefault() {
        assertThrows(IllegalArgumentException.class, () -> guard(false).requirePermitted("127.0.0.1"));
    }

    @Test
    void rejectsPrivateRangesByDefault() {
        assertThrows(IllegalArgumentException.class, () -> guard(false).requirePermitted("10.0.0.1"));
        assertThrows(IllegalArgumentException.class, () -> guard(false).requirePermitted("192.168.1.10"));
    }

    @Test
    void rejectsABlankHost() {
        assertThrows(IllegalArgumentException.class, () -> guard(false).requirePermitted(""));
    }

    @Test
    void optInAllowsPrivateAddresses() {
        assertDoesNotThrow(() -> guard(true).requirePermitted("127.0.0.1"));
        assertDoesNotThrow(() -> guard(true).requirePermitted("10.0.0.1"));
    }

    @Test
    void allowlistedHostIsAllowedWithoutTheGlobalFlag() {
        assertDoesNotThrow(() -> guardWithAllowlist("10.0.0.1").requirePermitted("10.0.0.1"));
        assertDoesNotThrow(() -> guardWithAllowlist("FILES.local").requirePermitted("files.LOCAL"));
    }

    @Test
    void allowlistDoesNotOpenOtherPrivateHosts() {
        assertThrows(
                IllegalArgumentException.class,
                () -> guardWithAllowlist("10.0.0.1").requirePermitted("10.0.0.2"));
    }
}
