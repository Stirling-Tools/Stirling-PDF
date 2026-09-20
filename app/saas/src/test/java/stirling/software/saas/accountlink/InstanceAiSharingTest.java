package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import com.sun.net.httpserver.HttpServer;

/**
 * The sharing switch: whether this deployment lends its AI engine to linked self-hosted servers.
 *
 * <p>Off is not an outage, and the difference matters to the admin on the other end - so the status
 * endpoint has to answer while the forwarding routes refuse.
 */
class InstanceAiSharingTest {

    private HttpServer engine;
    private final AtomicInteger engineCalls = new AtomicInteger();
    private InstanceAiUsageService usageService;

    @BeforeEach
    void startEngine() throws IOException {
        engine = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        engine.createContext(
                "/",
                exchange -> {
                    engineCalls.incrementAndGet();
                    byte[] body = "{\"status\":\"ok\"}".getBytes();
                    exchange.sendResponseHeaders(200, body.length);
                    exchange.getResponseBody().write(body);
                    exchange.close();
                });
        engine.start();
        usageService = mock(InstanceAiUsageService.class);
    }

    @AfterEach
    void stopEngine() {
        engine.stop(0);
    }

    private InstanceAiController controller(boolean sharingEnabled) {
        InstanceAiGatewayService gateway =
                new InstanceAiGatewayService(
                        "http://127.0.0.1:" + engine.getAddress().getPort(),
                        10,
                        30,
                        null,
                        HttpClient.newHttpClient());
        return new InstanceAiController(gateway, usageService, sharingEnabled);
    }

    private static MockHttpServletRequest capabilitiesRequest() {
        MockHttpServletRequest request =
                new MockHttpServletRequest("GET", "/api/v1/instance/ai/api/v1/agents/capabilities");
        request.setRequestURI("/api/v1/instance/ai/api/v1/agents/capabilities");
        return request;
    }

    private static LinkedInstanceAuthenticationToken instance() {
        return new LinkedInstanceAuthenticationToken(42L, 99L);
    }

    @Test
    void sharingOffRefusesBeforeTheEngineIsEverDialled() throws Exception {
        ResponseEntity<?> reply =
                controller(false).get(capabilitiesRequest(), instance(), "user-1");

        assertThat(reply.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(String.valueOf(reply.getBody())).contains("sharing is not enabled");
        // The point of gating here rather than at the engine: no cluster work, and no charge.
        assertThat(engineCalls.get()).isZero();
        verifyNoInteractions(usageService);
    }

    @Test
    void sharingOnForwardsAsBefore() throws Exception {
        ResponseEntity<?> reply = controller(true).get(capabilitiesRequest(), instance(), "user-1");

        assertThat(reply.getStatusCode().value()).isEqualTo(200);
        assertThat(engineCalls.get()).isEqualTo(1);
    }

    @Test
    void statusAnswersEvenWhileSharingIsOff() {
        InstanceAiController.InstanceAiStatus status = controller(false).status();

        // Answering is the whole point: a refused instance must be able to tell a switched-off
        // deployment from one that is down, and a gated status endpoint could say neither.
        assertThat(status.sharingEnabled()).isFalse();
        assertThat(status.engineReachable()).isFalse();
        assertThat(engineCalls.get()).isZero();
    }

    @Test
    void statusReportsTheEngineWhenSharingIsOn() {
        InstanceAiController.InstanceAiStatus status = controller(true).status();

        assertThat(status.sharingEnabled()).isTrue();
        assertThat(status.engineReachable()).isTrue();
    }

    @Test
    void statusReportsAnUnreachableEngineWithoutFailing() throws IOException {
        engine.stop(0);
        // Port 1 is reserved and never serves, so this is a real connection refusal.
        InstanceAiGatewayService gateway =
                new InstanceAiGatewayService(
                        "http://127.0.0.1:1", 10, 30, null, HttpClient.newHttpClient());

        InstanceAiController.InstanceAiStatus status =
                new InstanceAiController(gateway, usageService, true).status();

        assertThat(status.sharingEnabled()).isTrue();
        assertThat(status.engineReachable()).isFalse();
    }
}
