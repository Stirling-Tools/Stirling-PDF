package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.json.JsonMapper;

class IssuerDiscoveryProbeTest {

    private HttpServer server;
    private String base;
    private final IssuerDiscoveryProbe probe =
            new IssuerDiscoveryProbe(JsonMapper.builder().build());

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/good/.well-known/openid-configuration",
                exchange -> respond(exchange, 200, "{\"issuer\":\"x\"}"));
        server.createContext(
                "/empty/.well-known/openid-configuration",
                exchange -> respond(exchange, 200, "{}"));
        server.createContext(
                "/moved/.well-known/openid-configuration",
                exchange -> {
                    exchange.getResponseHeaders()
                            .add("Location", base + "/good/.well-known/openid-configuration");
                    exchange.sendResponseHeaders(302, -1);
                    exchange.close();
                });
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private static void respond(
            com.sun.net.httpserver.HttpExchange exchange, int status, String body)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    @Test
    void anIssuerThatAnswersDiscovery() {
        assertThat(probe.answersDiscovery(base + "/good/")).isTrue();
    }

    @Test
    void aDocumentWithoutAnIssuer() {
        assertThat(probe.answersDiscovery(base + "/empty")).isFalse();
    }

    @Test
    void aMissingDiscoveryDocument() {
        assertThat(probe.answersDiscovery(base + "/missing")).isFalse();
    }

    @Test
    void anUnreachableOrInvalidIssuer() {
        assertThat(probe.answersDiscovery("http://127.0.0.1:1/issuer")).isFalse();
        assertThat(probe.answersDiscovery("ftp://example.com")).isFalse();
        assertThat(probe.answersDiscovery("not a url")).isFalse();
    }

    @Test
    void anIssuerWithManyTrailingSlashes() {
        assertThat(probe.answersDiscovery(base + "/good" + "/".repeat(10_000))).isTrue();
    }

    @Test
    void noIssuerAtAll() {
        assertThat(probe.answersDiscovery(null)).isFalse();
    }

    @Test
    void aLinkLocalIssuerSuchAsTheMetadataService() {
        assertThat(probe.answersDiscovery("http://169.254.169.254/latest")).isFalse();
        assertThat(probe.answersDiscovery("http://[fe80::1]/issuer")).isFalse();
    }

    @Test
    void aRedirectIsNotFollowed() {
        assertThat(probe.answersDiscovery(base + "/moved")).isFalse();
    }
}
