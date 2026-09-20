package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

/** Whether Stirling Cloud is up, asked over a real socket rather than a mocked client. */
class CloudStatusProbeTest {

    private HttpServer server;
    private final AtomicReference<String> lastPath = new AtomicReference<>();
    private volatile int responseCode = 200;

    @BeforeEach
    void startHost() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    lastPath.set(exchange.getRequestURI().getPath());
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

    private CloudStatusProbe probe() {
        return new CloudStatusProbe(HttpClient.newHttpClient());
    }

    @Test
    void aHostThatAnswersIsUp() {
        assertThat(probe().isUp(baseUrl())).isTrue();
        assertThat(lastPath.get()).isEqualTo("/api/v1/info/status");
    }

    @Test
    void aTrailingSlashDoesNotDoubleUpInThePath() {
        assertThat(probe().isUp(baseUrl() + "/")).isTrue();
        assertThat(lastPath.get()).isEqualTo("/api/v1/info/status");
    }

    @Test
    void aHostThatErrorsIsDown() {
        responseCode = 503;
        assertThat(probe().isUp(baseUrl())).isFalse();
    }

    @Test
    void nothingListeningIsDownRatherThanAThrow() {
        // Port 1 is reserved and never serves; the probe must answer, not propagate.
        assertThat(probe().isUp("http://127.0.0.1:1")).isFalse();
    }

    @Test
    void noConfiguredHostIsDownAndIsNeverDialled() {
        assertThat(probe().isUp(null)).isFalse();
        assertThat(probe().isUp("  ")).isFalse();
    }
}
