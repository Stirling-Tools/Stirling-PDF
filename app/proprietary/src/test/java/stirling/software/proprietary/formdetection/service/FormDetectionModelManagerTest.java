package stirling.software.proprietary.formdetection.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;

import com.sun.net.httpserver.HttpServer;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.formdetection.catalog.ModelCatalogService;
import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;

class FormDetectionModelManagerTest {

    private HttpServer server;
    private byte[] modelBytes;
    private String modelSha;
    private int port;

    @BeforeEach
    void startServer() throws Exception {
        modelBytes = "fake-onnx-model-content-1234567890".getBytes();
        modelSha =
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(modelBytes));
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        port = server.getAddress().getPort();
        server.createContext(
                "/model.onnx",
                ex -> {
                    ex.sendResponseHeaders(200, modelBytes.length);
                    ex.getResponseBody().write(modelBytes);
                    ex.close();
                });
        server.start();
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    private ModelCatalogEntry entry(String url, String sha) {
        ModelCatalogEntry e = new ModelCatalogEntry();
        e.setId("test-model");
        e.setOnnxUrl(url);
        e.setSha256(sha);
        e.setSizeBytes(modelBytes.length);
        return e;
    }

    private FormDetectionModelManager manager(
            Path dir, ModelCatalogEntry entry, EndpointConfiguration ep) {
        RuntimePathConfig paths = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(paths.getFormDetectionModelPath()).thenReturn(dir.toString());
        ModelCatalogService catalog = Mockito.mock(ModelCatalogService.class);
        Mockito.when(catalog.getById("test-model")).thenReturn(Optional.of(entry));
        Mockito.when(catalog.getById(Mockito.argThat(s -> !"test-model".equals(s))))
                .thenReturn(Optional.empty());
        Mockito.when(catalog.getAll()).thenReturn(List.of(entry));
        return new FormDetectionModelManager(paths, catalog, new ApplicationProperties(), ep);
    }

    private void awaitState(FormDetectionModelManager m, String wire, long timeoutMs)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (wire.equals(m.status().getStatus())) {
                return;
            }
            Thread.sleep(25);
        }
        fail("Timed out waiting for state '" + wire + "', was '" + m.status().getStatus() + "'");
    }

    @Test
    void installsDownloadsVerifiesAndPublishesAtomically(@TempDir Path dir) throws Exception {
        EndpointConfiguration ep = Mockito.mock(EndpointConfiguration.class);
        FormDetectionModelManager m =
                manager(dir, entry("http://127.0.0.1:" + port + "/model.onnx", modelSha), ep);

        m.startInstall("test-model");
        awaitState(m, "ready", 5000);

        Path onnx = dir.resolve("test-model.onnx");
        assertTrue(Files.exists(onnx), "model file should be published");
        assertArrayEquals(modelBytes, Files.readAllBytes(onnx));
        assertFalse(Files.exists(dir.resolve("test-model.onnx.tmp")), "temp file should be gone");
        assertTrue(m.isReady());
        Mockito.verify(ep).enableEndpoint("form-detection");
    }

    @Test
    void rejectsChecksumMismatchAndLeavesNoFile(@TempDir Path dir) throws Exception {
        EndpointConfiguration ep = Mockito.mock(EndpointConfiguration.class);
        FormDetectionModelManager m =
                manager(dir, entry("http://127.0.0.1:" + port + "/model.onnx", "0".repeat(64)), ep);

        m.startInstall("test-model");
        awaitState(m, "failed", 5000);

        assertFalse(Files.exists(dir.resolve("test-model.onnx")), "no model on mismatch");
        assertFalse(Files.exists(dir.resolve("test-model.onnx.tmp")), "temp cleaned up");
        assertFalse(m.isReady());
        Mockito.verify(ep, Mockito.never()).enableEndpoint("form-detection");
    }

    @Test
    void secondConcurrentInstallIsRejected(@TempDir Path dir) throws Exception {
        CountDownLatch gate = new CountDownLatch(1);
        server.createContext(
                "/gated.onnx",
                ex -> {
                    try {
                        gate.await(3, TimeUnit.SECONDS);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    }
                    ex.sendResponseHeaders(200, modelBytes.length);
                    ex.getResponseBody().write(modelBytes);
                    ex.close();
                });
        FormDetectionModelManager m =
                manager(
                        dir,
                        entry("http://127.0.0.1:" + port + "/gated.onnx", modelSha),
                        Mockito.mock(EndpointConfiguration.class));

        m.startInstall("test-model"); // begins, blocks in handler
        // installing flag is set synchronously before the worker thread spawns
        assertThrows(IllegalStateException.class, () -> m.startInstall("test-model"));
        gate.countDown();
        awaitState(m, "ready", 5000);
    }

    @Test
    void rejectsBlankUrl(@TempDir Path dir) {
        FormDetectionModelManager m =
                manager(dir, entry("", ""), Mockito.mock(EndpointConfiguration.class));
        assertThrows(IllegalStateException.class, () -> m.startInstall("test-model"));
    }

    @Test
    void rejectsUnknownModelId(@TempDir Path dir) {
        FormDetectionModelManager m =
                manager(
                        dir,
                        entry("http://127.0.0.1:" + port + "/model.onnx", modelSha),
                        Mockito.mock(EndpointConfiguration.class));
        assertThrows(IllegalArgumentException.class, () -> m.startInstall("unknown"));
    }
}
