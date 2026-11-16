package stirling.software.proprietary.storage.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.cluster.s3.S3Clients;
import stirling.software.proprietary.security.model.User;

/** Retry behaviour of {@link S3StorageProvider#store} against a local S3 stub (no Docker). */
class S3StorageProviderRetryTest {

    private static final String BUCKET = "retry-bucket";

    private static final byte[] PAYLOAD = new byte[300 * 1024];

    static {
        new Random(42).nextBytes(PAYLOAD);
    }

    private final AtomicInteger putAttempts = new AtomicInteger();
    private final List<byte[]> storedBodies = new CopyOnWriteArrayList<>();
    private final List<String> storedContentTypes = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private S3StorageProvider provider;

    @AfterEach
    void stopStub() {
        if (provider != null) {
            provider.close();
        }
        if (server != null) {
            server.stop(0);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"WHEN_SUPPORTED", "WHEN_REQUIRED"})
    void store_retriesAfterServerErrorWithStreamWithoutMarkReset(String checksumMode)
            throws Exception {
        startStub(checksumMode);
        List<NoMarkInputStream> opened = new CopyOnWriteArrayList<>();
        MockMultipartFile file =
                new MockMultipartFile("file", "retry.pdf", "application/pdf", PAYLOAD) {
                    @Override
                    public InputStream getInputStream() {
                        NoMarkInputStream stream =
                                new NoMarkInputStream(new ByteArrayInputStream(PAYLOAD));
                        opened.add(stream);
                        return stream;
                    }
                };

        StoredObject stored = provider.store(owner(), file);

        assertThat(stored.getSizeBytes()).isEqualTo(PAYLOAD.length);
        assertThat(putAttempts).hasValue(2);
        assertThat(opened).hasSize(2).allMatch(NoMarkInputStream::isClosed);
        assertThat(storedContentTypes).containsExactly("application/pdf");
        assertThat(storedBodies).hasSize(1);
        assertThat(storedBodies.get(0)).isEqualTo(PAYLOAD);
    }

    @Test
    void store_inputStreamFailure_surfacesOriginalIOException() throws Exception {
        startStub("WHEN_SUPPORTED");
        IOException cause = new IOException("disk gone");
        MockMultipartFile file =
                new MockMultipartFile("file", "broken.pdf", "application/pdf", PAYLOAD) {
                    @Override
                    public InputStream getInputStream() throws IOException {
                        throw cause;
                    }
                };

        assertThatThrownBy(() -> provider.store(owner(), file)).isSameAs(cause);
        assertThat(putAttempts).hasValue(0);
    }

    private void startStub(String checksumMode) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        server.start();

        ApplicationProperties.Storage.S3 cfg = new ApplicationProperties.Storage.S3();
        cfg.setEndpoint("http://127.0.0.1:" + server.getAddress().getPort());
        cfg.setBucket(BUCKET);
        cfg.setAccessKey("key");
        cfg.setSecretKey("secret");
        cfg.setPathStyleAccess(true);
        cfg.setAllowPrivateEndpoints(true);
        cfg.setRequestChecksumCalculation(checksumMode);
        S3Clients.Bundle bundle = S3Clients.build(cfg, "retry test");
        provider = new S3StorageProvider(bundle.client(), bundle.presigner(), BUCKET);
    }

    private void handle(HttpExchange exchange) throws IOException {
        byte[] body = exchange.getRequestBody().readAllBytes();
        if (!"PUT".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
        } else if (putAttempts.incrementAndGet() == 1) {
            byte[] error =
                    "<Error><Code>SlowDown</Code><Message>busy</Message></Error>"
                            .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/xml");
            exchange.sendResponseHeaders(503, error.length);
            exchange.getResponseBody().write(error);
        } else {
            String encoding = exchange.getRequestHeaders().getFirst("Content-Encoding");
            boolean chunked = encoding != null && encoding.contains("aws-chunked");
            storedBodies.add(chunked ? decodeAwsChunked(body) : body);
            storedContentTypes.add(exchange.getRequestHeaders().getFirst("Content-Type"));
            exchange.getResponseHeaders().add("ETag", "\"stub\"");
            exchange.sendResponseHeaders(200, -1);
        }
        exchange.close();
    }

    // aws-chunked: "<hex size>[;ext]\r\n<data>\r\n" repeated, ending with a zero-size chunk.
    private static byte[] decodeAwsChunked(byte[] body) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int pos = 0;
        while (true) {
            int lineEnd = indexOfCrlf(body, pos);
            String header = new String(body, pos, lineEnd - pos, StandardCharsets.US_ASCII);
            int size = Integer.parseInt(header.split(";", 2)[0].trim(), 16);
            if (size == 0) {
                return out.toByteArray();
            }
            out.write(body, lineEnd + 2, size);
            pos = lineEnd + 2 + size + 2;
        }
    }

    private static int indexOfCrlf(byte[] body, int from) {
        for (int i = from; i < body.length - 1; i++) {
            if (body[i] == '\r' && body[i + 1] == '\n') {
                return i;
            }
        }
        throw new IllegalStateException("Malformed aws-chunked body");
    }

    private static User owner() {
        User owner = new User();
        owner.setId(1L);
        return owner;
    }

    private static final class NoMarkInputStream extends FilterInputStream {
        private volatile boolean closed;

        private NoMarkInputStream(InputStream in) {
            super(in);
        }

        boolean isClosed() {
            return closed;
        }

        @Override
        public void close() throws IOException {
            closed = true;
            super.close();
        }

        @Override
        public boolean markSupported() {
            return false;
        }

        @Override
        public synchronized void mark(int readlimit) {}

        @Override
        public synchronized void reset() throws IOException {
            throw new IOException("mark/reset not supported");
        }
    }
}
