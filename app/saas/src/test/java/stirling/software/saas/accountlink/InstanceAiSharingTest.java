package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.service.AiEngineRouter;

/** The sharing switch: off is not an outage, so status still answers while forwarding refuses. */
class InstanceAiSharingTest {

    private HttpServer engine;
    private final AtomicInteger engineCalls = new AtomicInteger();
    private InstanceAiUsageService usageService;

    @BeforeEach
    void startEngine() throws IOException {
        engine = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        engine.createContext(
                "/openapi.json",
                exchange -> {
                    byte[] body =
                            ("{\"paths\": {\"/api/v1/agents/capabilities\":"
                                            + " {\"get\": {\"x-linked-instance\": true}}}}")
                                    .getBytes();
                    exchange.sendResponseHeaders(200, body.length);
                    exchange.getResponseBody().write(body);
                    exchange.close();
                });
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

    private static InstanceAiGatewayService gatewayTo(String engineUrl) {
        ApplicationProperties props = new ApplicationProperties();
        props.getAiEngine().setUrl(engineUrl);
        return new InstanceAiGatewayService(
                props, AiEngineRouter.selfHosted(props, null), HttpClient.newHttpClient());
    }

    private InstanceAiController controller(boolean sharingEnabled) {
        InstanceAiGatewayService gateway =
                gatewayTo("http://127.0.0.1:" + engine.getAddress().getPort());
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

    /** Drains the streamed body the way Spring's writer would. */
    private static String bodyText(ResponseEntity<StreamingResponseBody> reply) throws IOException {
        ByteArrayOutputStream drained = new ByteArrayOutputStream();
        if (reply.getBody() != null) {
            reply.getBody().writeTo(drained);
        }
        return drained.toString(StandardCharsets.UTF_8);
    }

    @Test
    void sharingOffRefusesBeforeTheEngineIsEverDialled() throws Exception {
        ResponseEntity<StreamingResponseBody> reply =
                controller(false).get(capabilitiesRequest(), instance(), "user-1");

        assertThat(reply.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(bodyText(reply)).contains("sharing is not enabled");
        // Gated before the engine: no cluster work and no charge.
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
    void aMeteringFailureDoesNotFailWorkTheEngineAlreadyDid() throws Exception {
        // The engine already answered, so a usage-store outage must not turn success into a 500.
        doThrow(new RuntimeException("usage store unavailable"))
                .when(usageService)
                .recordCall(anyLong(), anyLong(), anyString());

        ResponseEntity<?> reply = controller(true).get(capabilitiesRequest(), instance(), "user-1");

        assertThat(reply.getStatusCode().value()).isEqualTo(200);
        assertThat(engineCalls.get()).isEqualTo(1);
    }

    @Test
    void statusAnswersEvenWhileSharingIsOff() {
        InstanceAiController.InstanceAiStatus status = controller(false).status();

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
        InstanceAiController.InstanceAiStatus status =
                new InstanceAiController(gatewayTo("http://127.0.0.1:1"), usageService, true)
                        .status();

        assertThat(status.sharingEnabled()).isTrue();
        assertThat(status.engineReachable()).isFalse();
    }
}
