package stirling.software.SPDF.service.ocr;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import stirling.software.SPDF.service.ocr.OcrLanguageInstaller.Catalog;
import stirling.software.SPDF.service.ocr.OcrLanguageInstaller.CatalogEntry;
import stirling.software.SPDF.service.ocr.OcrLanguageInstaller.Installable;
import stirling.software.SPDF.service.ocr.OcrLanguageInstaller.Source;
import stirling.software.common.configuration.RuntimePathConfig;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class OcrLanguageInstallerTest {

    private static final byte[] FRA = "pretend French model".getBytes(StandardCharsets.UTF_8);
    private static final byte[] OSD = "pretend orientation model".getBytes(StandardCharsets.UTF_8);
    private static final int DEU_SIZE = 1_000;

    @TempDir Path tessdata;
    @TempDir Path system;

    private HttpServer server;
    private final AtomicInteger downloads = new AtomicInteger();
    private NativeTesseractService engine;

    @BeforeEach
    void setUp() throws IOException {
        System.setProperty("STIRLING_PDF_TAURI_MODE", "true");
        Files.writeString(tessdata.resolve("eng.traineddata"), "english");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // The stalled download must not hold up the requests that follow it.
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/fra.traineddata", exchange -> serve(exchange, FRA));
        server.createContext("/osd.traineddata", exchange -> serve(exchange, OSD));
        server.createContext(
                "/deu.traineddata",
                exchange -> {
                    exchange.sendResponseHeaders(200, DEU_SIZE);
                    try (OutputStream out = exchange.getResponseBody()) {
                        out.write(new byte[10]);
                        out.flush();
                        Thread.sleep(3_000);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
        server.createContext("/spa.traineddata", exchange -> serve(exchange, new byte[100]));
        server.start();
        engine = mock(NativeTesseractService.class);
    }

    private void serve(HttpExchange exchange, byte[] body) throws IOException {
        downloads.incrementAndGet();
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    @AfterEach
    void tearDown() {
        System.clearProperty("STIRLING_PDF_TAURI_MODE");
        server.stop(0);
    }

    private OcrLanguageInstaller installer(String fraSha) {
        return installer(fraSha, Duration.ofSeconds(30));
    }

    private OcrLanguageInstaller installer(String fraSha, Duration timeout) {
        String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/";
        Catalog catalog =
                new Catalog(
                        "test",
                        "commit",
                        base,
                        List.of(
                                new CatalogEntry("eng", 7, sha(new byte[0])),
                                new CatalogEntry("fra", FRA.length, fraSha),
                                new CatalogEntry("deu", DEU_SIZE, sha(new byte[0])),
                                new CatalogEntry("spa", 5, sha(new byte[100])),
                                new CatalogEntry("osd", OSD.length, sha(OSD))));
        RuntimePathConfig paths = mock(RuntimePathConfig.class);
        when(paths.getTessDataPath()).thenReturn(tessdata.toString());
        return new OcrLanguageInstaller(
                paths, engine, catalog, List.of(system), "http://127.0.0.1:", timeout);
    }

    @Test
    void listsCatalogueLanguagesNotYetInstalledButNeverOsd() {
        OcrLanguageInstaller.Languages languages = installer(sha(FRA)).languages();

        assertEquals(List.of("eng"), languages.installed());
        assertTrue(languages.canInstall());
        assertEquals(
                List.of("fra", "deu", "spa"),
                languages.installable().stream().map(Installable::code).toList());
        assertEquals(
                new Installable("fra", FRA.length, Source.DOWNLOAD),
                languages.installable().get(0));
    }

    @Test
    void aStalledDownloadTimesOutAndReleasesTheLock() throws IOException {
        OcrLanguageInstaller installer = installer(sha(FRA), Duration.ofMillis(500));

        long start = System.nanoTime();
        assertThrows(IOException.class, () -> installer.install("deu"));
        assertTrue(System.nanoTime() - start < 2_500_000_000L, "gave up at the timeout");

        assertEquals(List.of("eng", "fra"), installer.install("fra").installed());
        assertFalse(Files.exists(tessdata.resolve("deu.traineddata")));
    }

    @Test
    void rejectsADownloadLargerThanTheCatalogueSays() {
        OcrLanguageInstaller installer = installer(sha(FRA));

        assertThrows(IOException.class, () -> installer.install("spa"));
        assertFalse(Files.exists(tessdata.resolve("spa.traineddata")));
    }

    @Test
    void ensureOsdInstallsTheOrientationModelOnce() {
        OcrLanguageInstaller installer = installer(sha(FRA));

        assertTrue(installer.ensureOsd());
        assertTrue(installer.ensureOsd());

        assertEquals(1, downloads.get());
        assertTrue(Files.exists(tessdata.resolve("osd.traineddata")));
    }

    @Test
    void ensureOsdOutsideTheDesktopAppDoesNothing() {
        System.clearProperty("STIRLING_PDF_TAURI_MODE");

        assertFalse(installer(sha(FRA)).ensureOsd());
        assertEquals(0, downloads.get());
    }

    @Test
    void offersNothingOutsideTheDesktopApp() {
        System.clearProperty("STIRLING_PDF_TAURI_MODE");
        OcrLanguageInstaller installer = installer(sha(FRA));

        assertFalse(installer.languages().canInstall());
        assertTrue(installer.languages().installable().isEmpty());
        assertThrows(IllegalStateException.class, () -> installer.install("fra"));
    }

    @Test
    void downloadsVerifiesAndInstalls() throws IOException {
        OcrLanguageInstaller.Languages after = installer(sha(FRA)).install("fra");

        assertArrayEquals(FRA, Files.readAllBytes(tessdata.resolve("fra.traineddata")));
        assertEquals(List.of("eng", "fra"), after.installed());
        verify(engine).refreshAvailability();
        try (var leftovers = Files.list(tessdata)) {
            assertEquals(2, leftovers.count(), "staging folder must be cleaned up");
        }
    }

    @Test
    void rejectsADownloadThatFailsItsChecksum() {
        OcrLanguageInstaller installer = installer(sha("something else".getBytes()));

        assertThrows(IOException.class, () -> installer.install("fra"));
        assertFalse(Files.exists(tessdata.resolve("fra.traineddata")));
        verify(engine, never()).refreshAvailability();
    }

    @Test
    void rejectsLanguagesOutsideTheCatalogue() {
        OcrLanguageInstaller installer = installer(sha(FRA));

        assertThrows(IllegalArgumentException.class, () -> installer.install("xyz"));
        assertThrows(IllegalArgumentException.class, () -> installer.install("../eng"));
    }

    @Test
    void copiesALoadableSystemLanguageInsteadOfDownloading() throws IOException {
        Files.write(system.resolve("fra.traineddata"), FRA);
        when(engine.canLoadLanguage(any(), eq("fra"))).thenReturn(true);
        OcrLanguageInstaller installer = installer(sha("not checked for copies".getBytes()));

        assertEquals(Source.SYSTEM, installer.languages().installable().get(0).source());
        installer.install("fra");

        assertEquals(0, downloads.get());
        assertArrayEquals(FRA, Files.readAllBytes(tessdata.resolve("fra.traineddata")));
    }

    @Test
    void downloadsWhenTheSystemCopyCannotBeLoaded() throws IOException {
        Files.writeString(system.resolve("fra.traineddata"), "tesseract 3 era data");
        when(engine.canLoadLanguage(any(), eq("fra"))).thenReturn(false);

        installer(sha(FRA)).install("fra");

        assertEquals(1, downloads.get());
        assertArrayEquals(FRA, Files.readAllBytes(tessdata.resolve("fra.traineddata")));
    }

    @Test
    void findsTesseractInstallsPerPlatform() {
        assertTrue(
                OcrLanguageInstaller.systemTessdataDirs(
                                Map.of("ProgramFiles", "C:\\Program Files"), "Windows 11")
                        .contains(Path.of("C:\\Program Files\\Tesseract-OCR\\tessdata")));
        assertTrue(
                OcrLanguageInstaller.systemTessdataDirs(Map.of(), "Mac OS X")
                        .contains(Path.of("/opt/homebrew/share/tessdata")));
        assertEquals(
                Path.of("/home/me/tessdata"),
                OcrLanguageInstaller.systemTessdataDirs(
                                Map.of("STIRLING_PDF_SYSTEM_TESSDATA", "/home/me/tessdata"),
                                "Linux")
                        .get(0));
    }

    @Test
    void springCanConstructTheInstaller() {
        RuntimePathConfig paths = mock(RuntimePathConfig.class);
        when(paths.getTessDataPath()).thenReturn(tessdata.toString());
        try (AnnotationConfigApplicationContext context =
                new AnnotationConfigApplicationContext()) {
            context.registerBean(RuntimePathConfig.class, () -> paths);
            context.registerBean(NativeTesseractService.class, () -> engine);
            context.registerBean(ObjectMapper.class, () -> JsonMapper.builder().build());
            context.registerBean(OcrLanguageInstaller.class);
            context.refresh();

            assertTrue(context.getBean(OcrLanguageInstaller.class).languages().canInstall());
        }
    }

    @Test
    void bundledCatalogueParsesAndPinsEnglish() throws IOException {
        Catalog catalog = OcrLanguageInstaller.loadCatalog(JsonMapper.builder().build());

        assertTrue(
                catalog.baseUrl().startsWith("https://raw.githubusercontent.com/tesseract-ocr/"));
        assertTrue(catalog.baseUrl().contains(catalog.commit()));
        CatalogEntry eng =
                catalog.languages().stream().filter(e -> e.code().equals("eng")).findFirst().get();
        assertEquals(4113088, eng.sizeBytes());
        assertEquals(64, eng.sha256().length());
        // tessdata keeps renamed models as git symlinks, which raw URLs serve as a few
        // bytes naming the target; one of those is not a model.
        for (CatalogEntry entry : catalog.languages()) {
            assertTrue(entry.sizeBytes() > 100_000, entry.code() + " is a pointer, not a model");
        }
    }

    private static String sha(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
