package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.SPDF.model.ocr.OcrManifest;
import stirling.software.SPDF.model.ocr.OcrManifest.OcrArtifact;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ChecksumUtils;

/**
 * Covers the parts of on-demand OCR installation where a bug is dangerous rather than merely
 * annoying: writing outside the target directory, and accepting a file that is not what the
 * catalogue said it would be.
 *
 * <p>Nothing here touches the network - every artefact is served over a {@code file:} URL, which is
 * the same path an air-gapped install uses.
 */
class OcrRuntimeServiceTest {

    @TempDir Path tmp;

    private OcrRuntimeService service;

    @BeforeEach
    void setUp() {
        service = new OcrRuntimeService(new ApplicationProperties());
    }

    private static String sha256(Path path) throws IOException {
        return ChecksumUtils.checksum(path, "SHA-256");
    }

    private Path fileWith(String name, String content) throws IOException {
        Path path = tmp.resolve(name);
        Files.createDirectories(path.getParent() == null ? tmp : path.getParent());
        Files.writeString(path, content, StandardCharsets.UTF_8);
        return path;
    }

    private static String fileUrl(Path path) {
        return path.toUri().toString();
    }

    @Nested
    @DisplayName("download")
    class Download {

        @Test
        @DisplayName("accepts a file whose SHA-256 matches the catalogue")
        void acceptsMatchingDigest() throws IOException {
            Path source = fileWith("good.bin", "tesseract");
            OcrArtifact artifact =
                    new OcrArtifact(
                            fileUrl(source), Files.size(source), sha256(source), "5.4.0", "engine");
            Path target = tmp.resolve("out.bin");

            service.download(artifact, target, "engine");

            assertTrue(Files.exists(target));
            assertEquals("tesseract", Files.readString(target));
        }

        @Test
        @DisplayName("rejects a mismatched SHA-256 and leaves nothing behind")
        void rejectsMismatchedDigest() throws IOException {
            Path source = fileWith("tampered.bin", "not what the catalogue promised");
            OcrArtifact artifact =
                    new OcrArtifact(
                            fileUrl(source), Files.size(source), "0".repeat(64), "5.4.0", "engine");
            Path target = tmp.resolve("out.bin");

            IOException e =
                    assertThrows(
                            IOException.class, () -> service.download(artifact, target, "engine"));

            assertTrue(e.getMessage().contains("SHA-256"), e.getMessage());
            assertFalse(
                    Files.exists(target),
                    "a file that failed verification must not be left on disk for something else to"
                            + " pick up");
        }

        @Test
        @DisplayName("refuses an artefact the catalogue lists without a digest")
        void refusesMissingDigest() throws IOException {
            Path source = fileWith("unsigned.bin", "anything");
            OcrArtifact artifact =
                    new OcrArtifact(fileUrl(source), Files.size(source), null, null, "engine");

            assertThrows(
                    IOException.class,
                    () -> service.download(artifact, tmp.resolve("out.bin"), "engine"));
        }

        @Test
        @DisplayName("rejects a size that disagrees with the catalogue")
        void rejectsWrongSize() throws IOException {
            Path source = fileWith("short.bin", "abc");
            OcrArtifact artifact =
                    new OcrArtifact(fileUrl(source), 99999, sha256(source), null, "engine");
            Path target = tmp.resolve("out.bin");

            assertThrows(IOException.class, () -> service.download(artifact, target, "engine"));
            assertFalse(Files.exists(target));
        }
    }

    @Nested
    @DisplayName("unzipInto")
    class Unzip {

        @Test
        @DisplayName("expands a well-formed archive")
        void expandsArchive() throws IOException {
            Path zip =
                    zipWith(tmp.resolve("ok.zip"), "tessdata/configs/pdf", "tessedit_create_pdf 1");
            Path dest = Files.createDirectory(tmp.resolve("dest"));

            OcrRuntimeService.unzipInto(zip, dest);

            assertTrue(Files.isRegularFile(dest.resolve("tessdata/configs/pdf")));
        }

        @Test
        @DisplayName("refuses an entry that climbs out of the target directory")
        void refusesZipSlip() throws IOException {
            // The escape target sits outside @TempDir by definition, so it is named per run and
            // cleared first: otherwise one escape leaves a file behind that fails every later run.
            String escapee = "stirling-ocr-escape-" + System.nanoTime() + ".txt";
            Path outside = tmp.getParent().resolve(escapee);
            Files.deleteIfExists(outside);

            Path zip = zipWith(tmp.resolve("evil.zip"), "../../" + escapee, "pwned");
            Path dest = Files.createDirectory(tmp.resolve("dest-slip"));

            try {
                IOException e =
                        assertThrows(
                                IOException.class, () -> OcrRuntimeService.unzipInto(zip, dest));

                assertTrue(e.getMessage().contains("outside"), e.getMessage());
                assertFalse(
                        Files.exists(outside),
                        "the archive entry must not have landed outside the target directory");
            } finally {
                Files.deleteIfExists(outside);
            }
        }

        private Path zipWith(Path zip, String entryName, String content) throws IOException {
            try (OutputStream out = Files.newOutputStream(zip);
                    ZipOutputStream zos = new ZipOutputStream(out)) {
                zos.putNextEntry(new ZipEntry(entryName));
                zos.write(content.getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
            }
            return zip;
        }
    }

    @Nested
    @DisplayName("resolveInside")
    class ResolveInside {

        @Test
        @DisplayName("allows a plain relative name")
        void allowsRelative() throws IOException {
            Path resolved = OcrRuntimeService.resolveInside(tmp, "spa.traineddata");
            assertTrue(resolved.startsWith(tmp.toAbsolutePath().normalize()));
        }

        @Test
        @DisplayName("refuses traversal, absolute paths and the root itself")
        void refusesEscapes() {
            assertThrows(IOException.class, () -> OcrRuntimeService.resolveInside(tmp, "../out"));
            assertThrows(
                    IOException.class, () -> OcrRuntimeService.resolveInside(tmp, "a/../../out"));
            assertThrows(IOException.class, () -> OcrRuntimeService.resolveInside(tmp, ""));
        }
    }

    @Nested
    @DisplayName("validatedUri")
    class ValidatedUri {

        @Test
        @DisplayName("accepts https and local files")
        void acceptsHttpsAndFile() throws IOException {
            assertNotNull(OcrRuntimeService.validatedUri("https://example.invalid/manifest.json"));
            assertNotNull(OcrRuntimeService.validatedUri(tmp.toUri().toString()));
        }

        @Test
        @DisplayName("refuses plain http, because it would let the digests be rewritten too")
        void refusesHttp() {
            assertThrows(
                    IOException.class,
                    () -> OcrRuntimeService.validatedUri("http://example.invalid/manifest.json"));
        }

        @Test
        @DisplayName("refuses empty and unusable addresses")
        void refusesJunk() {
            assertThrows(IOException.class, () -> OcrRuntimeService.validatedUri(null));
            assertThrows(IOException.class, () -> OcrRuntimeService.validatedUri("   "));
            assertThrows(IOException.class, () -> OcrRuntimeService.validatedUri("ftp://a/b"));
        }
    }

    @Nested
    @DisplayName("language codes")
    class LanguageCodes {

        @Test
        @DisplayName("accepts real Tesseract codes")
        void accepts() throws IOException {
            assertEquals("spa", OcrRuntimeService.requireSafeLanguageCode("spa"));
            assertEquals("chi_sim", OcrRuntimeService.requireSafeLanguageCode("chi_sim"));
            assertEquals("aze_cyrl", OcrRuntimeService.requireSafeLanguageCode(" aze_cyrl "));
        }

        @Test
        @DisplayName("refuses anything that could become a path")
        void refusesPaths() {
            assertThrows(
                    IOException.class,
                    () -> OcrRuntimeService.requireSafeLanguageCode("../../evil"));
            assertThrows(IOException.class, () -> OcrRuntimeService.requireSafeLanguageCode("a/b"));
            assertThrows(
                    IOException.class, () -> OcrRuntimeService.requireSafeLanguageCode("C:\\x"));
            assertThrows(IOException.class, () -> OcrRuntimeService.requireSafeLanguageCode(""));
            assertThrows(IOException.class, () -> OcrRuntimeService.requireSafeLanguageCode(null));
        }
    }

    @Nested
    @DisplayName("platformKey")
    class PlatformKey {

        @Test
        @DisplayName("maps the platforms the manifest names")
        void maps() {
            assertEquals("windows-x86_64", OcrRuntimeService.platformKey("Windows 11", "amd64"));
            assertEquals("macos-aarch64", OcrRuntimeService.platformKey("Mac OS X", "aarch64"));
            assertEquals("linux-x86_64", OcrRuntimeService.platformKey("Linux", "x86_64"));
        }
    }

    /**
     * The whole install path, driven off a local catalogue and a locally built archive. Uses a
     * stand-in engine rather than the real 37 MB download so it can run anywhere, but exercises the
     * same code: fetch, verify, expand, sanity-check, swap in.
     */
    @Nested
    @DisplayName("installEngine")
    class InstallEngine {

        private Path root;

        @BeforeEach
        void chooseRoot() {
            root = tmp.resolve("install").resolve("tesseract");
        }

        /** Overriding the root is the seam: everything else is the production path. */
        private OcrRuntimeService serviceWith(Path manifest) {
            ApplicationProperties properties = new ApplicationProperties();
            properties.getSystem().getOcr().setManifestUrl(fileUrl(manifest));
            return new OcrRuntimeService(properties) {
                @Override
                public Path runtimeRoot() {
                    return root;
                }
            };
        }

        private String executableName() {
            return System.getProperty("os.name", "")
                            .toLowerCase(java.util.Locale.ROOT)
                            .contains("windows")
                    ? "tesseract.exe"
                    : "tesseract";
        }

        private Path engineArchive(String name, boolean withConfigs) throws IOException {
            Path zip = tmp.resolve(name);
            try (OutputStream out = Files.newOutputStream(zip);
                    ZipOutputStream zos = new ZipOutputStream(out)) {
                zos.putNextEntry(new ZipEntry(executableName()));
                zos.write("binary".getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
                zos.putNextEntry(new ZipEntry("tessdata/eng.traineddata"));
                zos.write("model".getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
                if (withConfigs) {
                    zos.putNextEntry(new ZipEntry("tessdata/configs/pdf"));
                    zos.write("tessedit_create_pdf 1".getBytes(StandardCharsets.UTF_8));
                    zos.closeEntry();
                }
            }
            return zip;
        }

        private Path catalogueFor(Path archive) throws IOException {
            String json =
                    """
                    {
                      "schemaVersion": 1,
                      "engine": { "%s": { "url": "%s", "size": %d, "sha256": "%s",
                                          "version": "5.4.0" } }
                    }
                    """
                            .formatted(
                                    OcrRuntimeService.platformKey(
                                            System.getProperty("os.name"),
                                            System.getProperty("os.arch")),
                                    fileUrl(archive),
                                    Files.size(archive),
                                    sha256(archive));
            return fileWith("catalogue.json", json);
        }

        @Test
        @DisplayName("unpacks the engine into place")
        void installsEngine() throws IOException {
            Path archive = engineArchive("engine-ok.zip", true);
            OcrRuntimeService service = serviceWith(catalogueFor(archive));

            service.installEngine();

            assertTrue(Files.isRegularFile(root.resolve(executableName())));
            assertTrue(Files.isRegularFile(root.resolve("tessdata/configs/pdf")));
            assertTrue(service.isEngineInstalled());
        }

        @Test
        @DisplayName("refuses an archive with no tessdata/configs/pdf, which would OCR nothing")
        void refusesArchiveWithoutConfigs() throws IOException {
            Path archive = engineArchive("engine-no-configs.zip", false);
            OcrRuntimeService service = serviceWith(catalogueFor(archive));

            IOException e = assertThrows(IOException.class, service::installEngine);

            assertTrue(e.getMessage().contains("configs/pdf"), e.getMessage());
            assertFalse(
                    Files.exists(root),
                    "a rejected archive must not leave a half-installed runtime behind");
        }

        @Test
        @DisplayName("keeps language models across an engine reinstall")
        void carriesLanguagesOver() throws IOException {
            Path archive = engineArchive("engine-ok.zip", true);
            OcrRuntimeService service = serviceWith(catalogueFor(archive));
            service.installEngine();

            // A language the user added after the first install.
            Files.writeString(root.resolve("tessdata/spa.traineddata"), "spanish");

            service.installEngine();

            assertTrue(
                    Files.isRegularFile(root.resolve("tessdata/spa.traineddata")),
                    "upgrading the engine must not silently discard installed languages");
            assertTrue(Files.isRegularFile(root.resolve("tessdata/configs/pdf")));
        }

        @Test
        @DisplayName("a tampered archive leaves the previous runtime untouched")
        void keepsPreviousRuntimeOnFailure() throws IOException {
            Path good = engineArchive("engine-ok.zip", true);
            serviceWith(catalogueFor(good)).installEngine();
            Files.writeString(root.resolve("tessdata/spa.traineddata"), "spanish");

            Path tampered = engineArchive("engine-tampered.zip", true);
            String badCatalogue =
                    """
                    {
                      "schemaVersion": 1,
                      "engine": { "%s": { "url": "%s", "size": %d, "sha256": "%s",
                                          "version": "9.9.9" } }
                    }
                    """
                            .formatted(
                                    OcrRuntimeService.platformKey(
                                            System.getProperty("os.name"),
                                            System.getProperty("os.arch")),
                                    fileUrl(tampered),
                                    Files.size(tampered),
                                    "0".repeat(64));
            OcrRuntimeService service = serviceWith(fileWith("bad-catalogue.json", badCatalogue));

            assertThrows(IOException.class, service::installEngine);

            assertTrue(Files.isRegularFile(root.resolve(executableName())));
            assertTrue(Files.isRegularFile(root.resolve("tessdata/spa.traineddata")));
        }
    }

    @Nested
    @DisplayName("loadManifest")
    class LoadManifest {

        @Test
        @DisplayName(
                "reads a catalogue from a local file, which is how an air-gapped install works")
        void readsLocalCatalogue() throws IOException {
            Path manifest =
                    fileWith(
                            "ocr-manifest.json",
                            """
                            {
                              "schemaVersion": 1,
                              "engine": {
                                "windows-x86_64": {
                                  "url": "https://example.invalid/tesseract.zip",
                                  "size": 41582104,
                                  "sha256": "abc",
                                  "version": "5.4.0"
                                }
                              },
                              "languages": {
                                "spa": {
                                  "url": "https://example.invalid/spa.traineddata",
                                  "size": 2294433,
                                  "sha256": "def",
                                  "name": "Espanol"
                                }
                              }
                            }
                            """);

            ApplicationProperties properties = new ApplicationProperties();
            properties.getSystem().getOcr().setManifestUrl(fileUrl(manifest));
            OcrManifest loaded = new OcrRuntimeService(properties).loadManifest();

            assertEquals(1, loaded.schemaVersion());
            assertEquals("5.4.0", loaded.engine().get("windows-x86_64").version());
            assertEquals(2294433, loaded.languages().get("spa").size());
            // Absent sections must not blow up: a catalogue with no extras is perfectly valid.
            assertTrue(loaded.extras().isEmpty());
        }
    }
}
