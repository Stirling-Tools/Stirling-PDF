package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
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
                exchange -> respond(exchange, 200, "{\"issuer\":\"" + base + "/good\"}"));
        server.createContext(
                "/elsewhere/.well-known/openid-configuration",
                exchange -> respond(exchange, 200, "{\"issuer\":\"" + base + "/good\"}"));
        server.createContext(
                "/slashed/.well-known/openid-configuration",
                exchange -> respond(exchange, 200, "{\"issuer\":\"" + base + "/slashed/\"}"));
        server.createContext(
                "/huge/.well-known/openid-configuration",
                exchange ->
                        respond(
                                exchange,
                                200,
                                "{\"issuer\":\""
                                        + base
                                        + "/huge\",\"pad\":\""
                                        + "x".repeat(300 * 1024)
                                        + "\"}"));
        server.createContext(
                "/numeric/.well-known/openid-configuration",
                exchange -> respond(exchange, 200, "{\"issuer\":1}"));
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
        assertThat(probe.answersDiscovery(" " + base + "/good ")).isTrue();
    }

    @Test
    void anIssuerIsMatchedExactly() {
        // Auth0 advertises its issuer with a trailing slash, so one entered with it must pass
        // and one entered without must not: Spring compares them the same way on boot.
        assertThat(probe.answersDiscovery(base + "/slashed/")).isTrue();
        assertThat(probe.answersDiscovery(base + "/slashed")).isFalse();
        assertThat(probe.answersDiscovery(base + "/good/")).isFalse();
    }

    @Test
    void anOversizedDocument() {
        assertThat(probe.answersDiscovery(base + "/huge")).isFalse();
    }

    @Test
    void aDocumentWithoutAnIssuer() {
        assertThat(probe.answersDiscovery(base + "/empty")).isFalse();
    }

    @Test
    void aDocumentNamingAnotherIssuer() {
        assertThat(probe.answersDiscovery(base + "/elsewhere")).isFalse();
    }

    @Test
    void aDocumentWhoseIssuerIsNotText() {
        assertThat(probe.answersDiscovery(base + "/numeric")).isFalse();
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
    void anIssuerWithManyTrailingSlashesIsAnsweredPromptly() {
        assertThat(probe.answersDiscovery(base + "/good" + "/".repeat(10_000))).isFalse();
    }

    @Test
    void noIssuerAtAll() {
        assertThat(probe.answersDiscovery(null)).isFalse();
    }

    @Test
    void aMetadataServiceIsNeverRequested() {
        HttpClient client = mock(HttpClient.class);
        IssuerDiscoveryProbe guarded =
                new IssuerDiscoveryProbe(client, JsonMapper.builder().build());

        assertThat(guarded.answersDiscovery("http://169.254.169.254/latest")).isFalse();
        assertThat(guarded.answersDiscovery("http://[fe80::1]/issuer")).isFalse();
        assertThat(guarded.answersDiscovery("http://100.100.100.200/latest")).isFalse();
        assertThat(guarded.answersDiscovery("http://[fd00:ec2::254]/latest")).isFalse();
        verifyNoInteractions(client);
    }

    @Test
    void aRedirectIsNotFollowed() {
        assertThat(probe.answersDiscovery(base + "/moved")).isFalse();
    }
}
