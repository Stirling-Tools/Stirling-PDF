package stirling.software.proprietary.mcp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;

class McpIdpPreflightServiceTest {

    private final ApplicationProperties props = new ApplicationProperties();
    private final AtomicInteger registrationPosts = new AtomicInteger();
    private HttpServer idp;
    private String issuer;
    private volatile String metadata;

    @BeforeEach
    void startIdp() throws IOException {
        idp = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        idp.createContext(
                "/.well-known/openid-configuration", exchange -> send(exchange, 200, metadata));
        idp.createContext(
                "/register",
                exchange -> {
                    registrationPosts.incrementAndGet();
                    send(exchange, 201, "{\"client_id\":\"x\"}");
                });
        idp.start();
        issuer = "http://127.0.0.1:" + idp.getAddress().getPort();
        props.getMcp().setEnabled(true);
        props.getMcp().getAuth().setMode("oauth");
        props.getMcp().getAuth().setIssuerUri(issuer);
        props.getMcp().getAuth().setResourceId("https://pdf.example.com/mcp");
    }

    @AfterEach
    void stopIdp() {
        idp.stop(0);
    }

    @Test
    void aWorkingIdpPassesItsRegistrationProbe() {
        metadata =
                "{\"issuer\":\""
                        + issuer
                        + "\",\"registration_endpoint\":\""
                        + issuer
                        + "/register\",\"code_challenge_methods_supported\":[\"S256\"]}";

        Map<String, Object> result = service().run();

        assertThat(check(result, "registration").status()).isEqualTo("pass");
        assertThat(check(result, "pkce").status()).isEqualTo("pass");
        assertThat(registrationPosts.get()).isEqualTo(1);
    }

    @Test
    void aRegistrationEndpointOnAnotherHostIsNotProbed() {
        metadata =
                "{\"issuer\":\""
                        + issuer
                        + "\",\"registration_endpoint\":\"http://169.254.169.254/latest/meta-data\","
                        + "\"code_challenge_methods_supported\":[\"S256\"]}";

        Map<String, Object> result = service().run();

        McpIdpPreflightService.Check registration = check(result, "registration");
        assertThat(registration.status()).isEqualTo("fail");
        assertThat(registration.detail()).contains("169.254.169.254").contains("Not probed");
        assertThat(result.get("ready")).isEqualTo(false);
    }

    @Test
    void anOversizedMetadataDocumentIsCutOffInsteadOfRead() {
        metadata = "{\"issuer\":\"" + issuer + "\",\"pad\":\"" + "x".repeat(2_000_000) + "\"}";

        Map<String, Object> result = service().run();

        assertThat(check(result, "issuer").status()).isEqualTo("fail");
    }

    @Test
    void anIdpWithoutPkceOrRegistrationFails() {
        metadata = "{\"issuer\":\"" + issuer + "\"}";

        Map<String, Object> result = service().run();

        assertThat(check(result, "registration").status()).isEqualTo("fail");
        assertThat(check(result, "pkce").status()).isEqualTo("fail");
    }

    @Test
    void sameHostComparesHostsOnly() {
        assertThat(
                        McpIdpPreflightService.sameHost(
                                "https://id.example.com/realms/x",
                                "https://ID.example.com/realms/x/clients-registrations"))
                .isTrue();
        assertThat(
                        McpIdpPreflightService.sameHost(
                                "https://id.example.com", "https://id.example.com.evil.io/r"))
                .isFalse();
        assertThat(McpIdpPreflightService.sameHost("https://id.example.com", "not a url"))
                .isFalse();
    }

    @SuppressWarnings("unchecked")
    private McpIdpPreflightService service() {
        return new McpIdpPreflightService(props, mock(ObjectProvider.class));
    }

    @SuppressWarnings("unchecked")
    private static McpIdpPreflightService.Check check(Map<String, Object> result, String id) {
        return ((List<McpIdpPreflightService.Check>) result.get("checks"))
                .stream()
                        .filter(c -> id.equals(c.id()))
                        .findFirst()
                        .orElseThrow(() -> new AssertionError("no check " + id + ": " + result));
    }

    private static void send(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
