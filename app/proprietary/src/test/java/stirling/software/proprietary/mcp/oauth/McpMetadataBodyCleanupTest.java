package stirling.software.proprietary.mcp.oauth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.io.CloseMode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

@Timeout(10)
class McpMetadataBodyCleanupTest {
    @ParameterizedTest
    @ValueSource(ints = {200, 302, 404})
    void closingAnUnreadBodyDoesNotWaitForTheServer(int status) throws Exception {
        try (SlowResponse exchange = new SlowResponse(status, 1)) {
            assertTimeoutPreemptively(
                    Duration.ofSeconds(2), () -> exchange.response.body().close());
            assertTrue(exchange.disconnected.await(2, TimeUnit.SECONDS));
        }
    }

    @Test
    void rejectingAnOversizedBodyDoesNotDrainTheRest() throws Exception {
        try (SlowResponse exchange =
                new SlowResponse(200, McpClientMetadataFetcher.MAX_BYTES + 1)) {
            McpOAuthException failure =
                    assertTimeoutPreemptively(
                            Duration.ofSeconds(2),
                            () ->
                                    assertThrows(
                                            McpOAuthException.class,
                                            () ->
                                                    McpClientMetadataFetcher.readCapped(
                                                            exchange.response.body())));
            assertTrue(failure.getMessage().contains("larger than"));
            assertTrue(exchange.disconnected.await(2, TimeUnit.SECONDS));
        }
    }

    @Test
    void aBodyDeadlineAbortsTheConnectionWithoutDrainingIt() throws Exception {
        try (SlowResponse exchange = new SlowResponse(200, 1)) {
            McpOAuthException failure =
                    assertTimeoutPreemptively(
                            Duration.ofSeconds(2),
                            () ->
                                    assertThrows(
                                            McpOAuthException.class,
                                            () ->
                                                    McpClientMetadataFetcher.readWithDeadline(
                                                            exchange.response.body(),
                                                            Duration.ofMillis(50))));
            assertTrue(failure.getMessage().contains("timed out"));
            assertTrue(exchange.disconnected.await(2, TimeUnit.SECONDS));
        }
    }

    /** Sends a body prefix, then withholds the rest until the client disconnects. */
    private static final class SlowResponse implements AutoCloseable {
        private final ServerSocket listener =
                new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        private final CloseableHttpClient client = HttpClients.createDefault();
        private final CountDownLatch disconnected = new CountDownLatch(1);
        private final AtomicReference<Throwable> failure = new AtomicReference<>();
        private final Thread server;
        private volatile Socket connection;
        private final McpMetadataHttp.Response response;

        private SlowResponse(int status, int prefixBytes) throws Exception {
            server =
                    Thread.ofPlatform()
                            .daemon()
                            .start(
                                    () -> {
                                        try (Socket socket = listener.accept()) {
                                            connection = socket;
                                            socket.setSoTimeout(5000);
                                            BufferedReader request =
                                                    new BufferedReader(
                                                            new InputStreamReader(
                                                                    socket.getInputStream(),
                                                                    StandardCharsets.US_ASCII));
                                            String line;
                                            do {
                                                line = request.readLine();
                                                if (line == null)
                                                    throw new IOException("Missing HTTP request");
                                            } while (!line.isEmpty());
                                            String headers =
                                                    "HTTP/1.1 "
                                                            + status
                                                            + " Test\r\n"
                                                            + "Content-Type: application/json\r\n"
                                                            + "Content-Length: 1000000000\r\n\r\n";
                                            socket.getOutputStream()
                                                    .write(
                                                            headers.getBytes(
                                                                    StandardCharsets.US_ASCII));
                                            socket.getOutputStream().write(new byte[prefixBytes]);
                                            socket.getOutputStream().flush();
                                            try {
                                                if (socket.getInputStream().read() != -1)
                                                    throw new IOException(
                                                            "Unexpected request data");
                                            } catch (SocketException ignored) {
                                                // An immediate close can reset the connection
                                                // instead of sending EOF.
                                            }
                                            disconnected.countDown();
                                        } catch (Throwable exception) {
                                            failure.set(exception);
                                        }
                                    });
            try {
                URI uri =
                        new URI(
                                "http",
                                null,
                                listener.getInetAddress().getHostAddress(),
                                listener.getLocalPort(),
                                "/client.json",
                                null,
                                null);
                response =
                        McpMetadataHttp.response(
                                client, client.executeOpen(null, new HttpGet(uri), null));
            } catch (Exception exception) {
                close();
                throw exception;
            }
        }

        @Override
        public void close() throws Exception {
            client.close(CloseMode.IMMEDIATE);
            listener.close();
            if (connection != null) connection.close();
            server.join(2000);
            assertFalse(server.isAlive());
            assertTrue(
                    failure.get() == null || failure.get() instanceof SocketException,
                    () -> "Server failed: " + failure.get());
        }
    }
}
