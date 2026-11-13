package stirling.software.proprietary.policy.remote;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

class CloudHttpTest {

    private HttpServer server;
    private final AtomicInteger calls = new AtomicInteger();

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    int n = calls.incrementAndGet();
                    int status = n == 1 ? 503 : 200;
                    exchange.getResponseHeaders().add("Retry-After", "0");
                    exchange.sendResponseHeaders(status, -1);
                    exchange.close();
                });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private HttpRequest.Builder request() {
        return HttpRequest.newBuilder(
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/x"));
    }

    @Test
    void aServerErrorOnAnIdempotentRequestIsRetried() throws Exception {
        HttpResponse<Void> response =
                CloudHttp.send(
                        CloudHttp.newClient(),
                        request().GET().build(),
                        HttpResponse.BodyHandlers.discarding(),
                        "test");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(calls).hasValue(2);
    }

    @Test
    void aServerErrorOnAPostIsNotRepeated() throws Exception {
        HttpResponse<Void> response =
                CloudHttp.send(
                        CloudHttp.newClient(),
                        request().POST(HttpRequest.BodyPublishers.ofString("file")).build(),
                        HttpResponse.BodyHandlers.discarding(),
                        "test");

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(calls).hasValue(1);
    }
}
