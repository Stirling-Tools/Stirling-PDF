package stirling.software.proprietary.mcp.oauth;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

import org.junit.jupiter.api.Test;

class McpMetadataHttpTest {
    @Test
    void validatesTheAddressesUsedForTheSocket() throws Exception {
        InetAddress publicAddress = InetAddress.getByName("8.8.8.8");
        InetAddress[] publicOnly = {publicAddress};
        assertArrayEquals(publicOnly, McpMetadataHttp.requirePublicAddresses(publicOnly));
        for (String privateIp :
                new String[] {"127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fc00::1"}) {
            InetAddress[] mixed = {publicAddress, InetAddress.getByName(privateIp)};
            assertThrows(
                    UnknownHostException.class,
                    () -> McpMetadataHttp.requirePublicAddresses(mixed));
        }
    }

    @Test
    void rejectsPrivateLiteralAddressesBeforeConnecting() {
        assertThrows(
                IOException.class,
                () -> McpMetadataHttp.get(URI.create("https://127.0.0.1/client.json")));
        assertThrows(
                IOException.class,
                () -> McpMetadataHttp.get(URI.create("https://[::1]/client.json")));
        assertThrows(
                IOException.class,
                () -> McpMetadataHttp.get(URI.create("http://example.com/client.json")));
        assertThrows(
                IOException.class,
                () ->
                        McpMetadataHttp.get(
                                URI.create("https://user:password@example.com/client.json")));
    }
}
