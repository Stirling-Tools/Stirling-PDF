package stirling.software.saas.billing.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.lang.reflect.Field;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import stirling.software.saas.config.SupabaseConfigurationProperties;

/**
 * Black-box tests for the Stripe usage reporter. Uses a tiny in-process {@link
 * com.sun.net.httpserver.HttpServer} as the Supabase Edge Function stand-in.
 */
class StripeUsageReportingServiceTest {

    private HttpServer server;
    private int port;
    private final AtomicReference<String> lastBody = new AtomicReference<>();
    private final AtomicReference<String> lastAuthHeader = new AtomicReference<>();
    private final AtomicInteger nextStatus = new AtomicInteger(200);

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        port = server.getAddress().getPort();
        server.createContext("/functions/v1/meter-usage", this::handleMeterUsage);
        server.start();
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    private void handleMeterUsage(HttpExchange ex) throws IOException {
        lastBody.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        lastAuthHeader.set(ex.getRequestHeaders().getFirst("Authorization"));
        int status = nextStatus.get();
        byte[] body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(status, body.length);
        ex.getResponseBody().write(body);
        ex.close();
    }

    private StripeUsageReportingService newService(String supabaseUrl, String secret)
            throws ReflectiveOperationException {
        SupabaseConfigurationProperties props = new SupabaseConfigurationProperties();
        props.setEdgeFunctionUrl(supabaseUrl);
        props.setEdgeFunctionSecret(secret);

        StripeUsageReportingService svc = new StripeUsageReportingService(props);
        // The supabaseUrl field is @Value-bound; inject directly for unit isolation.
        Field f = StripeUsageReportingService.class.getDeclaredField("supabaseUrl");
        f.setAccessible(true);
        f.set(svc, supabaseUrl);
        return svc;
    }

    @Test
    void reportsUsageSuccessfully() throws Exception {
        StripeUsageReportingService svc = newService("http://127.0.0.1:" + port, "edge-secret-123");

        boolean ok = svc.reportUsageToStripe(UUID.randomUUID().toString(), 5, "idem-key-1");

        assertThat(ok).isTrue();
        assertThat(lastBody.get()).contains("\"credits\":5", "\"idempotency_key\":\"idem-key-1\"");
        assertThat(lastAuthHeader.get()).isEqualTo("Bearer edge-secret-123");
    }

    @Test
    void rejectsNonPositiveOverage() throws Exception {
        StripeUsageReportingService svc = newService("http://127.0.0.1:" + port, "edge-secret-123");

        assertThat(svc.reportUsageToStripe("any", 0, "k")).isFalse();
        assertThat(svc.reportUsageToStripe("any", -1, "k")).isFalse();
        assertThat(lastBody.get()).isNull(); // no request was sent
    }

    @Test
    void returnsFalseWhenSupabaseUrlMissing() throws Exception {
        StripeUsageReportingService svc = newService("", "edge-secret-123");

        assertThat(svc.reportUsageToStripe(UUID.randomUUID().toString(), 5, "k")).isFalse();
    }

    @Test
    void returnsFalseWhenEdgeFunctionSecretMissing() throws Exception {
        StripeUsageReportingService svc = newService("http://127.0.0.1:" + port, "");

        assertThat(svc.reportUsageToStripe(UUID.randomUUID().toString(), 5, "k")).isFalse();
    }

    @Test
    void returnsFalseOnNon200Response() throws Exception {
        StripeUsageReportingService svc = newService("http://127.0.0.1:" + port, "edge-secret-123");
        nextStatus.set(500);

        boolean ok = svc.reportUsageToStripe(UUID.randomUUID().toString(), 5, "k");

        assertThat(ok).isFalse();
    }

    @Test
    void idempotencyKeyIsStableForSameInputs() throws Exception {
        StripeUsageReportingService svc = newService("http://127.0.0.1:" + port, "secret");
        String a = svc.generateIdempotencyKey("user-123", 5, "op-abc");
        String b = svc.generateIdempotencyKey("user-123", 5, "op-abc");
        assertThat(a).isEqualTo(b);
        assertThat(a).isEqualTo("usage_user-123_5_op-abc");

        // Different operation -> different key.
        String c = svc.generateIdempotencyKey("user-123", 5, "op-def");
        assertThat(c).isNotEqualTo(a);
    }
}
