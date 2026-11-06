package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.SPDF.service.EditorFontRegistry.EditorFontFace;
import stirling.software.SPDF.service.EditorFontRegistry.EditorFontFamily;

class EditorFontRegistryTest {

    @TempDir Path root;

    private MutableClock clock;
    private EditorFontRegistry registry;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-11-05T10:00:00Z"));
        registry = new EditorFontRegistry(root, clock);
    }

    @Test
    void groupsFacesByFamilyWithStyleFlags() throws IOException {
        copyFixture("LiberationSans-Regular.ttf", root.resolve("LiberationSans-Regular.ttf"));
        copyFixture(
                "LiberationSans-BoldItalic.ttf",
                root.resolve("nested/LiberationSans-BoldItalic.ttf"));

        List<EditorFontFamily> families = registry.snapshot().manifest().families();

        assertThat(families)
                .extracting(EditorFontFamily::family)
                .containsExactly("Liberation Sans");
        List<EditorFontFace> faces = families.get(0).faces();
        assertThat(faces).hasSize(2);
        EditorFontFace regular = faces.get(0);
        assertThat(regular.bold()).isFalse();
        assertThat(regular.italic()).isFalse();
        assertThat(regular.style()).isEqualTo("Regular");
        assertThat(regular.format()).isEqualTo("ttf");
        assertThat(regular.postscriptName()).isEqualTo("LiberationSans");
        assertThat(regular.id()).matches("[0-9a-f]{64}");
        EditorFontFace boldItalic = faces.get(1);
        assertThat(boldItalic.bold()).isTrue();
        assertThat(boldItalic.italic()).isTrue();
    }

    @Test
    void emptyWhenFolderIsMissing() {
        EditorFontRegistry missing = new EditorFontRegistry(root.resolve("does-not-exist"), clock);

        assertThat(missing.snapshot().manifest().families()).isEmpty();
    }

    @Test
    void skipsFilesThatAreNotLoadableTrueTypeFonts() throws IOException {
        Files.writeString(root.resolve("broken.ttf"), "not a font");
        Files.writeString(root.resolve("readme.txt"), "hello");
        copyFixture("DejaVuSans.ttf", root.resolve("signature.woff2"));
        copyFixture("DejaVuSans.ttf", root.resolve("DejaVuSans.ttf"));

        List<EditorFontFamily> families = registry.snapshot().manifest().families();

        assertThat(families).extracting(EditorFontFamily::family).containsExactly("DejaVu Sans");
    }

    @Test
    void skipsFontsWhoseLicenceForbidsEmbedding() throws IOException {
        Path restricted = root.resolve("Restricted.ttf");
        copyFixture("DejaVuSans.ttf", restricted);
        setFsType(restricted, 0x0002);
        Path bitmapOnly = root.resolve("BitmapOnly.ttf");
        copyFixture("DejaVuSans-Bold.ttf", bitmapOnly);
        setFsType(bitmapOnly, 0x0200);

        assertThat(registry.snapshot().manifest().families()).isEmpty();
    }

    @Test
    void identicalFilesAreListedOnce() throws IOException {
        copyFixture("DejaVuSans.ttf", root.resolve("a/DejaVuSans.ttf"));
        copyFixture("DejaVuSans.ttf", root.resolve("b/DejaVuSans.ttf"));

        List<EditorFontFamily> families = registry.snapshot().manifest().families();

        assertThat(families).hasSize(1);
        assertThat(families.get(0).faces()).hasSize(1);
    }

    @Test
    void resolvesOnlyKnownWellFormedIds() throws IOException {
        Path font = root.resolve("DejaVuSans.ttf");
        copyFixture("DejaVuSans.ttf", font);
        String id = registry.snapshot().manifest().families().get(0).faces().get(0).id();

        assertThat(registry.resolve(id))
                .hasValueSatisfying(
                        file -> {
                            assertThat(file.path()).isEqualTo(font);
                            assertThat(file.format()).isEqualTo("ttf");
                        });
        assertThat(registry.resolve("0".repeat(64))).isEmpty();
        assertThat(registry.resolve("../../etc/passwd")).isEmpty();
        assertThat(registry.resolve(id.toUpperCase())).isEmpty();
        assertThat(registry.resolve(null)).isEmpty();
    }

    @Test
    void picksUpNewFilesOnceTheRescanIntervalPasses() throws IOException {
        copyFixture("DejaVuSans.ttf", root.resolve("DejaVuSans.ttf"));
        String firstEtag = registry.snapshot().etag();

        copyFixture("LiberationSerif-Regular.ttf", root.resolve("LiberationSerif-Regular.ttf"));
        assertThat(registry.snapshot().manifest().families()).hasSize(1);

        clock.advance(EditorFontRegistry.RESCAN_INTERVAL.plusSeconds(1));
        assertThat(registry.snapshot().manifest().families())
                .extracting(EditorFontFamily::family)
                .containsExactly("DejaVu Sans", "Liberation Serif");
        assertThat(registry.snapshot().etag()).isNotEqualTo(firstEtag);
    }

    @Test
    void replacedFileNoLongerResolvesUnderItsOldId() throws IOException {
        Path font = root.resolve("Face.ttf");
        copyFixture("DejaVuSans.ttf", font);
        String oldId = registry.snapshot().manifest().families().get(0).faces().get(0).id();

        copyFixture("LiberationSans-Regular.ttf", font);
        Files.setLastModifiedTime(font, FileTime.from(Instant.parse("2030-01-01T00:00:00Z")));

        assertThat(registry.resolve(oldId)).isEmpty();
        String newId = registry.snapshot().manifest().families().get(0).faces().get(0).id();
        assertThat(newId).isNotEqualTo(oldId);
        assertThat(registry.resolve(newId)).isPresent();
    }

    private static void copyFixture(String name, Path target) throws IOException {
        Files.createDirectories(target.getParent());
        try (InputStream in =
                EditorFontRegistryTest.class.getResourceAsStream("/static/fonts/" + name)) {
            assertThat(in).as("fixture %s", name).isNotNull();
            Files.write(target, in.readAllBytes());
        }
    }

    private static void setFsType(Path font, int fsType) throws IOException {
        byte[] bytes = Files.readAllBytes(font);
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        int tables = buffer.getShort(4) & 0xFFFF;
        for (int i = 0; i < tables; i++) {
            int record = 12 + i * 16;
            String tag = new String(bytes, record, 4, StandardCharsets.US_ASCII);
            if ("OS/2".equals(tag)) {
                int offset = buffer.getInt(record + 8);
                buffer.putShort(offset + 8, (short) fsType);
                Files.write(font, bytes);
                return;
            }
        }
        throw new IllegalStateException("no OS/2 table in " + font);
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(java.time.Duration by) {
            now = now.plus(by);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
