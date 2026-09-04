package stirling.software.proprietary.formdetection.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URI;
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
import org.springframework.beans.factory.ObjectProvider;

import com.sun.net.httpserver.HttpServer;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.EndpointConfiguration.DisableReason;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.formdetection.catalog.ModelCatalogService;
import stirling.software.proprietary.formdetection.inference.UnloadableModel;
import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;

class FormDetectionModelManagerTest {

    /** Catalog URLs must satisfy the production allowlist; the stub below serves them locally. */
    private static final String ALLOWED_URL = "https://huggingface.co";

    private HttpServer server;
    private byte[] modelBytes;
    private String modelSha;
    private int port;

    /** Stands in for a build with no ONNX engine bean, which is the default packaging. */
    @SuppressWarnings("unchecked")
    private static ObjectProvider<UnloadableModel> noEngine() {
        return Mockito.mock(ObjectProvider.class);
    }

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
        return manager(dir, entry, ep, new ApplicationProperties());
    }

    private FormDetectionModelManager manager(
            Path dir,
            ModelCatalogEntry entry,
            EndpointConfiguration ep,
            ApplicationProperties props) {
        return manager(dir, entry, ep, props, true);
    }

    /** Stands in for a build packaged without the ONNX runtime, where the tool cannot run. */
    private FormDetectionModelManager managerWithoutEngine(
            Path dir, ModelCatalogEntry entry, EndpointConfiguration ep) {
        return manager(dir, entry, ep, new ApplicationProperties(), false);
    }

    private FormDetectionModelManager manager(
            Path dir,
            ModelCatalogEntry entry,
            EndpointConfiguration ep,
            ApplicationProperties props,
            boolean serverEngineAvailable) {
        RuntimePathConfig paths = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(paths.getFormDetectionModelPath()).thenReturn(dir.toString());
        ModelCatalogService catalog = Mockito.mock(ModelCatalogService.class);
        Mockito.when(catalog.getById("test-model")).thenReturn(Optional.of(entry));
        Mockito.when(catalog.getById(Mockito.argThat(s -> !"test-model".equals(s))))
                .thenReturn(Optional.empty());
        Mockito.when(catalog.getAll()).thenReturn(List.of(entry));
        // The real fetch only allows the catalog host, so stub the hop to the local test server.
        return new FormDetectionModelManager(paths, catalog, props, ep, noEngine()) {
            @Override
            HttpURLConnection openModelDownload(String url) throws IOException {
                String local = "http://127.0.0.1:" + port + URI.create(url).getPath();
                HttpURLConnection conn =
                        (HttpURLConnection) URI.create(local).toURL().openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(10000);
                return conn;
            }

            @Override
            boolean isServerEngineAvailable() {
                return serverEngineAvailable;
            }
        };
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
                manager(dir, entry(ALLOWED_URL + "/model.onnx", modelSha), ep);

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
                manager(dir, entry(ALLOWED_URL + "/model.onnx", "0".repeat(64)), ep);

        m.startInstall("test-model");
        awaitState(m, "failed", 5000);

        assertFalse(Files.exists(dir.resolve("test-model.onnx")), "no model on mismatch");
        assertFalse(Files.exists(dir.resolve("test-model.onnx.tmp")), "temp cleaned up");
        assertFalse(m.isReady());
        Mockito.verify(ep, Mockito.never()).enableEndpoint("form-detection");
    }

    @Test
    void followsRedirectsOnlyWithinTheAllowedDomains() throws Exception {
        String from = "https://huggingface.co/a/b.onnx";
        // Hugging Face hands the file off to its own CDN, which is a subdomain of hf.co.
        assertEquals(
                "https://cdn-lfs.hf.co/x",
                FormDetectionModelManager.requireAllowedRedirect(from, "https://cdn-lfs.hf.co/x"));
        assertEquals(
                "https://huggingface.co/c/d.onnx",
                FormDetectionModelManager.requireAllowedRedirect(from, "/c/d.onnx"));
    }

    @Test
    void rejectsRedirectsOffTheAllowlist() {
        String from = "https://huggingface.co/a/b.onnx";
        assertThrows(
                IOException.class,
                () ->
                        FormDetectionModelManager.requireAllowedRedirect(
                                from, "https://evil.example/x"));
        assertThrows(
                IOException.class,
                () ->
                        FormDetectionModelManager.requireAllowedRedirect(
                                from, "https://huggingface.co.evil.example/x"));
        assertThrows(
                IOException.class,
                () ->
                        FormDetectionModelManager.requireAllowedRedirect(
                                from, "http://huggingface.co/x"));
        assertThrows(
                IOException.class,
                () ->
                        FormDetectionModelManager.requireAllowedRedirect(
                                from, "https://user@huggingface.co/x"));
    }

    @Test
    void abortsAnOversizedDownloadAndLeavesNoPartialFile(@TempDir Path dir) throws Exception {
        // Well past the 8MB slack the manager allows over the catalogue size.
        long size = modelBytes.length + 9L * 1024 * 1024;
        server.createContext(
                "/huge.onnx",
                ex -> {
                    ex.sendResponseHeaders(200, size);
                    byte[] chunk = new byte[1 << 16];
                    try (OutputStream body = ex.getResponseBody()) {
                        for (long sent = 0; sent < size; sent += chunk.length) {
                            body.write(chunk, 0, (int) Math.min(chunk.length, size - sent));
                        }
                    } catch (IOException ignored) {
                        // Expected: the client aborts as soon as the ceiling trips.
                    }
                    ex.close();
                });
        FormDetectionModelManager m =
                manager(
                        dir,
                        entry(ALLOWED_URL + "/huge.onnx", modelSha),
                        Mockito.mock(EndpointConfiguration.class));

        m.startInstall("test-model");
        awaitState(m, "failed", 15000);

        assertFalse(
                Files.exists(dir.resolve("test-model.onnx")), "no model on an aborted download");
        assertFalse(
                Files.exists(dir.resolve("test-model.onnx.tmp")), "partial download is deleted");
        assertEquals(0, m.status().getProgress(), "progress resets on failure");
        assertTrue(
                m.status().getError().contains("exceeded the expected size"),
                "the size ceiling, not the checksum, is what stopped it");
    }

    @Test
    void doesNotEnableTheEndpointWhenTheOnnxEngineIsAbsent(@TempDir Path dir) throws Exception {
        EndpointConfiguration ep = Mockito.mock(EndpointConfiguration.class);
        FormDetectionModelManager m =
                managerWithoutEngine(dir, entry(ALLOWED_URL + "/model.onnx", modelSha), ep);

        m.startInstall("test-model");
        awaitState(m, "ready", 5000);

        Mockito.verify(ep, Mockito.never()).enableEndpoint("form-detection");
        Mockito.verify(ep, Mockito.atLeastOnce())
                .disableEndpoint("form-detection", DisableReason.DEPENDENCY);
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
                        entry(ALLOWED_URL + "/gated.onnx", modelSha),
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
    void rejectsCatalogUrlOutsideAllowlist(@TempDir Path dir) {
        FormDetectionModelManager m =
                manager(
                        dir,
                        entry("http://127.0.0.1:" + port + "/model.onnx", modelSha),
                        Mockito.mock(EndpointConfiguration.class));
        assertThrows(IllegalArgumentException.class, () -> m.startInstall("test-model"));
    }

    @Test
    void rejectsDownloadUrlOutsideAllowlist(@TempDir Path dir) {
        RuntimePathConfig paths = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(paths.getFormDetectionModelPath()).thenReturn(dir.toString());
        FormDetectionModelManager m =
                new FormDetectionModelManager(
                        paths,
                        Mockito.mock(ModelCatalogService.class),
                        new ApplicationProperties(),
                        Mockito.mock(EndpointConfiguration.class),
                        noEngine());

        assertThrows(
                IOException.class,
                () -> m.openModelDownload("http://127.0.0.1:" + port + "/model.onnx"));
        assertThrows(
                IOException.class,
                () -> m.openModelDownload("https://huggingface.co.evil.example/model.onnx"));
    }

    @Test
    void rejectsUnknownModelId(@TempDir Path dir) {
        FormDetectionModelManager m =
                manager(
                        dir,
                        entry(ALLOWED_URL + "/model.onnx", modelSha),
                        Mockito.mock(EndpointConfiguration.class));
        assertThrows(IllegalArgumentException.class, () -> m.startInstall("unknown"));
    }

    @Test
    void uninstallTombstoneStopsReseedUntilExplicitReinstall(@TempDir Path root) throws Exception {
        Path modelDir = root.resolve("models");
        Path preDir = root.resolve("preinstalled");
        Files.createDirectories(preDir);
        Files.write(preDir.resolve("test-model.onnx"), modelBytes);
        ModelCatalogEntry e = entry(ALLOWED_URL + "/model.onnx", modelSha);

        ApplicationProperties props = new ApplicationProperties();
        props.getFormDetection().setPreinstalledModelDir(preDir.toString());
        FormDetectionModelManager m =
                manager(modelDir, e, Mockito.mock(EndpointConfiguration.class), props);
        m.init();
        assertEquals("test-model", m.status().getActiveModelId(), "seeded on first boot");
        assertEquals("ready", m.status().getStatus());
        assertTrue(m.status().getInstalled().contains("test-model"));
        assertFalse(
                Files.exists(modelDir.resolve("test-model.onnx")),
                "image-baked model is read in place, never duplicated into the writable dir");

        m.deleteModel("test-model");
        assertEquals("not_installed", m.status().getStatus());
        assertTrue(
                Files.exists(preDir.resolve("test-model.onnx")),
                "uninstall must not touch the read-only image copy");
        assertTrue(
                Files.exists(modelDir.resolve("test-model.onnx.removed")),
                "uninstall records a tombstone");

        // Simulate a container restart over the same volume: seeding must not resurrect it.
        ApplicationProperties props2 = new ApplicationProperties();
        props2.getFormDetection().setPreinstalledModelDir(preDir.toString());
        FormDetectionModelManager m2 =
                manager(modelDir, e, Mockito.mock(EndpointConfiguration.class), props2);
        m2.init();
        assertEquals("not_installed", m2.status().getStatus());
        assertFalse(
                m2.status().getInstalled().contains("test-model"),
                "tombstoned model must not be re-seeded");

        // An explicit reinstall clears the tombstone and seeding works again afterwards.
        m2.startInstall("test-model");
        awaitState(m2, "ready", 5000);
        assertFalse(Files.exists(modelDir.resolve("test-model.onnx.removed")));
    }
}
