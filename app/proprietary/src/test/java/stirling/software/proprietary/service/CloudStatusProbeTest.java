package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;

/** Whether Stirling Cloud is up, asked over a real socket rather than a mocked client. */
class CloudStatusProbeTest {

    private HttpServer server;
    private final AtomicReference<String> lastPath = new AtomicReference<>();
    private volatile int responseCode = 200;
    private volatile String redirectTo;

    @BeforeEach
    void startHost() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    lastPath.set(exchange.getRequestURI().getPath());
                    if (redirectTo != null) {
                        exchange.getResponseHeaders().add("Location", redirectTo);
                    }
                    byte[] body = "{\"status\":\"UP\"}".getBytes();
                    exchange.sendResponseHeaders(responseCode, body.length);
                    exchange.getResponseBody().write(body);
                    exchange.close();
                });
        server.start();
    }

    @AfterEach
    void stopHost() {
        server.stop(0);
    }

    private String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private CloudStatusProbe probe(String baseUrl) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getAiEngine().setCloudBaseUrl(baseUrl);
        return new CloudStatusProbe(AiEngineRouter.selfHosted(properties, null));
    }

    @Test
    void aHostThatAnswersIsUp() {
        assertThat(probe(baseUrl()).isUp()).isTrue();
        assertThat(lastPath.get()).isEqualTo("/api/v1/info/status");
    }

    @Test
    void aTrailingSlashDoesNotDoubleUpInThePath() {
        assertThat(probe(baseUrl() + "/").isUp()).isTrue();
        assertThat(lastPath.get()).isEqualTo("/api/v1/info/status");
    }

    @Test
    void aHostThatErrorsIsDown() {
        responseCode = 503;
        assertThat(probe(baseUrl()).isUp()).isFalse();
    }

    @Test
    void nothingListeningIsDownRatherThanAThrow() {
        // Port 1 is reserved and never serves; the probe must answer, not propagate.
        assertThat(probe("http://127.0.0.1:1").isUp()).isFalse();
    }

    @Test
    void noConfiguredHostIsDownAndIsNeverDialled() {
        assertThat(probe(null).isUp()).isFalse();
        assertThat(probe("  ").isUp()).isFalse();
        assertThat(lastPath.get()).isNull();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "http://169.254.169.254",
                "http://localhost.attacker.example",
                "https:///missing-host",
                "file:///etc/passwd"
            })
    void unsafeConfiguredHostsAreDownWithoutThrowing(String baseUrl) {
        assertThat(probe(baseUrl).isUp()).isFalse();
        assertThat(lastPath.get()).isNull();
    }

    @Test
    void aRedirectCannotSendTheProbeToAnotherDestination() throws IOException {
        AtomicReference<String> redirectedPath = new AtomicReference<>();
        HttpServer destination = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        destination.createContext(
                "/",
                exchange -> {
                    redirectedPath.set(exchange.getRequestURI().getPath());
                    exchange.sendResponseHeaders(200, -1);
                    exchange.close();
                });
        destination.start();
        try {
            redirectTo = "http://127.0.0.1:" + destination.getAddress().getPort() + "/private";
            responseCode = 302;

            assertThat(probe(baseUrl()).isUp()).isFalse();
            assertThat(lastPath.get()).isEqualTo("/api/v1/info/status");
            assertThat(redirectedPath.get()).isNull();
        } finally {
            destination.stop(0);
        }
    }
}
