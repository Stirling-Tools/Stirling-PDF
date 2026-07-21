package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.model.ApplicationProperties;

/**
 * Tests for {@link ZipExtractionUtils} that build real in-memory ZIP byte streams and exercise
 * detection, flat extraction, nested-ZIP recursion, directory skipping and corrupt-input handling.
 * No external process is launched.
 */
class ZipExtractionUtilsTest {

    private TempFileManager tempFileManager;
    private final List<TempFile> created = new ArrayList<>();

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("test-zip-");
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);
    }

    @AfterEach
    void tearDown() {
        for (TempFile tf : created) {
            tf.close();
        }
        created.clear();
    }

    // ----- helpers -----------------------------------------------------------

    /** Build a flat ZIP from name->bytes entries. */
    private static byte[] buildZip(String[] names, byte[][] contents) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (int i = 0; i < names.length; i++) {
                zos.putNextEntry(new ZipEntry(names[i]));
                if (contents[i] != null) {
                    zos.write(contents[i]);
                }
                zos.closeEntry();
            }
        }
        return baos.toByteArray();
    }

    private static byte[] bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    private static Resource resource(byte[] data) {
        return new ByteArrayResource(data);
    }

    private static String drain(Resource r) throws IOException {
        try (InputStream is = r.getInputStream()) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Nested
    @DisplayName("isZip")
    class IsZipTests {

        @Test
        @DisplayName("real ZIP magic bytes are detected")
        void detectsRealZip() throws IOException {
            byte[] zip = buildZip(new String[] {"a.txt"}, new byte[][] {bytes("hi")});
            assertThat(ZipExtractionUtils.isZip(resource(zip))).isTrue();
        }

        @Test
        @DisplayName("non-ZIP content is rejected")
        void rejectsNonZip() throws IOException {
            assertThat(ZipExtractionUtils.isZip(resource(bytes("not a zip at all")))).isFalse();
        }

        @Test
        @DisplayName("null resource is not a ZIP")
        void nullResource() throws IOException {
            assertThat(ZipExtractionUtils.isZip(null)).isFalse();
        }

        @Test
        @DisplayName("content shorter than the magic prefix is not a ZIP")
        void tooShort() throws IOException {
            assertThat(ZipExtractionUtils.isZip(resource(new byte[] {0x50, 0x4B}))).isFalse();
        }

        @Test
        @DisplayName(".cbz filename is explicitly excluded even with ZIP magic bytes")
        void cbzExcluded() throws IOException {
            byte[] zip = buildZip(new String[] {"page.png"}, new byte[][] {bytes("img")});
            assertThat(ZipExtractionUtils.isZip(resource(zip), "comic.cbz")).isFalse();
        }

        @Test
        @DisplayName(".cbz exclusion is case-insensitive")
        void cbzExcludedUppercase() throws IOException {
            byte[] zip = buildZip(new String[] {"page.png"}, new byte[][] {bytes("img")});
            assertThat(ZipExtractionUtils.isZip(resource(zip), "COMIC.CBZ")).isFalse();
        }

        @Test
        @DisplayName("a non-cbz filename does not suppress detection")
        void nonCbzFilenameStillDetected() throws IOException {
            byte[] zip = buildZip(new String[] {"a.txt"}, new byte[][] {bytes("x")});
            assertThat(ZipExtractionUtils.isZip(resource(zip), "bundle.zip")).isTrue();
        }

        @Test
        @DisplayName("first four bytes that differ from the magic are rejected")
        void wrongMagicBytes() throws IOException {
            byte[] data = {0x50, 0x4B, 0x05, 0x06, 0x00, 0x00};
            assertThat(ZipExtractionUtils.isZip(resource(data))).isFalse();
        }
    }

    @Nested
    @DisplayName("extractZip")
    class ExtractZipTests {

        @Test
        @DisplayName("flat ZIP extracts one resource per file entry with filenames preserved")
        void flatExtraction() throws IOException {
            byte[] zip =
                    buildZip(
                            new String[] {"first.txt", "second.txt"},
                            new byte[][] {bytes("one"), bytes("two")});

            List<Resource> result = ZipExtractionUtils.extractZip(resource(zip), tempFileManager);

            assertThat(result).hasSize(2);
            assertThat(result)
                    .extracting(Resource::getFilename)
                    .containsExactlyInAnyOrder("first.txt", "second.txt");
            assertThat(drain(result.get(0)) + drain(result.get(1))).contains("one").contains("two");
        }

        @Test
        @DisplayName("directory entries are skipped")
        void directoriesSkipped() throws IOException {
            byte[] zip =
                    buildZip(
                            new String[] {"dir/", "dir/file.txt"},
                            new byte[][] {null, bytes("payload")});

            List<Resource> result = ZipExtractionUtils.extractZip(resource(zip), tempFileManager);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getFilename()).isEqualTo("dir/file.txt");
        }

        @Test
        @DisplayName("empty ZIP yields no resources")
        void emptyZip() throws IOException {
            byte[] zip = buildZip(new String[] {}, new byte[][] {});
            List<Resource> result = ZipExtractionUtils.extractZip(resource(zip), tempFileManager);
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("nested ZIP entries are recursively expanded")
        void nestedExtraction() throws IOException {
            byte[] inner =
                    buildZip(new String[] {"inner.txt"}, new byte[][] {bytes("nested-content")});
            byte[] outer =
                    buildZip(
                            new String[] {"top.txt", "child.zip"},
                            new byte[][] {bytes("top-content"), inner});

            List<Resource> result = ZipExtractionUtils.extractZip(resource(outer), tempFileManager);

            // top.txt + the single file inside child.zip => 2 flat resources
            assertThat(result).hasSize(2);
            assertThat(result)
                    .extracting(Resource::getFilename)
                    .containsExactlyInAnyOrder("top.txt", "inner.txt");
        }

        @Test
        @DisplayName("tempFileConsumer receives every created temp file")
        void consumerInvoked() throws IOException {
            byte[] zip =
                    buildZip(
                            new String[] {"a.txt", "b.txt"}, new byte[][] {bytes("a"), bytes("b")});

            List<TempFile> seen = new ArrayList<>();
            List<Resource> result =
                    ZipExtractionUtils.extractZip(
                            resource(zip),
                            tempFileManager,
                            tf -> {
                                seen.add(tf);
                                created.add(tf);
                            });

            assertThat(result).hasSize(2);
            assertThat(seen).hasSize(2);
        }

        @Test
        @DisplayName("a .cbz entry inside the ZIP is kept as a single file, not recursed")
        void cbzEntryNotRecursed() throws IOException {
            byte[] innerZip = buildZip(new String[] {"page.png"}, new byte[][] {bytes("imgdata")});
            byte[] outer = buildZip(new String[] {"book.cbz"}, new byte[][] {innerZip});

            List<Resource> result = ZipExtractionUtils.extractZip(resource(outer), tempFileManager);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getFilename()).isEqualTo("book.cbz");
        }

        @Test
        @DisplayName("a truncated ZIP entry stream surfaces as an IOException")
        void corruptZip() throws IOException {
            // Build a real ZIP with compressible content, then truncate it mid-stream so the
            // deflate entry cannot be fully read and extraction fails.
            byte[] valid =
                    buildZip(new String[] {"big.txt"}, new byte[][] {bytes("A".repeat(8192))});
            byte[] truncated = new byte[valid.length / 2];
            System.arraycopy(valid, 0, truncated, 0, truncated.length);

            assertThatThrownBy(
                            () ->
                                    ZipExtractionUtils.extractZip(
                                            resource(truncated), tempFileManager))
                    .isInstanceOf(IOException.class);
        }
    }
}
