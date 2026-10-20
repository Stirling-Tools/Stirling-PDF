package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

class PostHogClientTest {

    @Test
    void sendsQueuedEventAsBatch() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        CompletableFuture<String> body = new CompletableFuture<>();
        server.createContext(
                "/batch/",
                exchange -> {
                    body.complete(
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8));
                    exchange.sendResponseHeaders(200, -1);
                    exchange.close();
                });
        server.start();

        PostHogClient client =
                new PostHogClient("test-key", "http://127.0.0.1:" + server.getAddress().getPort());
        try {
            client.capture("user-1", "test_event", Map.of("app_version", "1.2.3"));

            String payload = body.get(5, TimeUnit.SECONDS);
            assertTrue(payload.contains("\"api_key\":\"test-key\""));
            assertTrue(payload.contains("\"event\":\"test_event\""));
            assertTrue(payload.contains("\"distinct_id\":\"user-1\""));
            assertTrue(payload.contains("\"app_version\":\"1.2.3\""));
        } finally {
            client.shutdown();
            server.stop(0);
        }
    }

    @Test
    void ignoresEventsAfterShutdown() {
        PostHogClient client = new PostHogClient("key", "http://127.0.0.1:1");

        client.shutdown();

        assertDoesNotThrow(() -> client.capture("user", "event", Map.of()));
    }
}
