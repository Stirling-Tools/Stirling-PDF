package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;
import static org.junit.jupiter.api.Assumptions.abort;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystemException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.nio.file.attribute.PosixFilePermission;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Enumeration;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.SPDF.service.EditorFontRegistry.EditorFontFace;
import stirling.software.SPDF.service.EditorFontRegistry.EditorFontFamily;
import stirling.software.SPDF.service.EditorFontRegistry.FontFile;
import stirling.software.SPDF.service.EditorFontRegistry.Snapshot;

class EditorFontRegistryTest {

    @TempDir Path root;

    private MutableClock clock;
    private EditorFontRegistry registry;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-11-05T10:00:00Z"));
        registry = new EditorFontRegistry(root, null, clock);
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
        EditorFontRegistry missing =
                new EditorFontRegistry(root.resolve("does-not-exist"), null, clock);

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
    void listsFontsThatAlsoGrantALessRestrictiveEmbedding() throws IOException {
        Path previewAndPrint = root.resolve("PreviewAndPrint.ttf");
        copyFixture("DejaVuSans.ttf", previewAndPrint);
        setFsType(previewAndPrint, 0x0006);
        Path editable = root.resolve("Editable.ttf");
        copyFixture("DejaVuSans-Bold.ttf", editable);
        setFsType(editable, 0x000E);

        List<EditorFontFamily> families = registry.snapshot().manifest().families();

        assertThat(families).extracting(EditorFontFamily::family).containsExactly("DejaVu Sans");
        assertThat(families.get(0).faces()).hasSize(2);
    }

    @Test
    void groupsFacesUnderTheirTypographicFamilyName() throws IOException {
        Path light = root.resolve("DejaVuSans-Light.ttf");
        copyFixture("DejaVuSans.ttf", light);
        setLegacyFamilyName(light, "DejaVu Thin");

        List<EditorFontFamily> families = registry.snapshot().manifest().families();

        assertThat(families).extracting(EditorFontFamily::family).containsExactly("DejaVu Sans");
    }

    @Test
    void ignoresLinksThatLeadOutOfTheFolder(@TempDir Path outside) throws IOException {
        Path elsewhere = outside.resolve("DejaVuSans.ttf");
        copyFixture("DejaVuSans.ttf", elsewhere);
        symlink(root.resolve("linked.ttf"), elsewhere);
        symlink(root.resolve("linked-folder"), outside);
        copyFixture("LiberationSans-Regular.ttf", root.resolve("LiberationSans-Regular.ttf"));

        List<EditorFontFamily> families = registry.snapshot().manifest().families();

        assertThat(families)
                .extracting(EditorFontFamily::family)
                .containsExactly("Liberation Sans");
    }

    @Test
    void followsAFontsFolderThatIsItselfALink(@TempDir Path outside) throws IOException {
        copyFixture("DejaVuSans.ttf", outside.resolve("DejaVuSans.ttf"));
        Path link = symlink(root.resolve("fonts"), outside);

        EditorFontRegistry linked = new EditorFontRegistry(link, null, clock);

        assertThat(linked.snapshot().manifest().families())
                .extracting(EditorFontFamily::family)
                .containsExactly("DejaVu Sans");
    }

    @Test
    void anUnreadableFolderHidesOnlyItsOwnFonts() throws IOException {
        assumeTrue(FileSystems.getDefault().supportedFileAttributeViews().contains("posix"));
        copyFixture("DejaVuSans.ttf", root.resolve("DejaVuSans.ttf"));
        Path locked = root.resolve("locked");
        copyFixture("LiberationSans-Regular.ttf", locked.resolve("LiberationSans-Regular.ttf"));
        Set<PosixFilePermission> original = Files.getPosixFilePermissions(locked);
        Files.setPosixFilePermissions(locked, Set.of());
        try {
            assumeFalse(Files.isReadable(locked), "running with permission to read any folder");

            List<EditorFontFamily> families = registry.snapshot().manifest().families();

            assertThat(families)
                    .extracting(EditorFontFamily::family)
                    .containsExactly("DejaVu Sans");
            assertThat(registry.resolve(families.get(0).faces().get(0).id())).isPresent();
        } finally {
            Files.setPosixFilePermissions(locked, original);
        }
    }

    @Test
    void requestsDuringTheFirstScanWaitForItsResult() throws Exception {
        copyFixture("DejaVuSans.ttf", root.resolve("DejaVuSans.ttf"));
        EditorFontRegistry withBundled =
                new EditorFontRegistry(root, EditorFontRegistry.BUNDLED_FONTS, clock);
        CountDownLatch scanning = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<Snapshot> first = new AtomicReference<>();
        AtomicReference<Snapshot> during = new AtomicReference<>();
        Thread firstRequest = new Thread(() -> first.set(withBundled.snapshot()));
        firstRequest.setContextClassLoader(
                new PausingClassLoader(
                        EditorFontRegistryTest.class.getClassLoader(), scanning, release));
        Thread laterRequest = new Thread(() -> during.set(withBundled.snapshot()));

        firstRequest.start();
        assertThat(scanning.await(30, TimeUnit.SECONDS)).isTrue();
        laterRequest.start();
        try {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
            while (laterRequest.getState() != Thread.State.BLOCKED
                    && laterRequest.getState() != Thread.State.TERMINATED) {
                if (System.nanoTime() > deadline) {
                    fail("later request never waited, state " + laterRequest.getState());
                }
                Thread.onSpinWait();
            }
        } finally {
            release.countDown();
        }
        firstRequest.join();
        laterRequest.join();

        assertThat(during.get().manifest().families())
                .extracting(EditorFontFamily::family)
                .contains("DejaVu Sans", "Liberation Sans");
        assertThat(during.get().etag()).isEqualTo(first.get().etag());
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
    void listsTheFontsBundledWithTheApp() throws Exception {
        EditorFontRegistry withBundled =
                new EditorFontRegistry(root, EditorFontRegistry.BUNDLED_FONTS, clock);

        List<EditorFontFamily> families = withBundled.snapshot().manifest().families();

        assertThat(families)
                .extracting(EditorFontFamily::family)
                .contains(
                        "Liberation Sans",
                        "DejaVu Serif",
                        "Noto Sans",
                        "Noto Sans JP",
                        "Noto Sans KR",
                        "Noto Sans SC")
                .doesNotContain("Tangerine", "Noto Sans TC");
        EditorFontFace regular = family(families, "Liberation Sans").faces().get(0);
        assertThat(family(families, "Liberation Sans").faces()).hasSize(4);
        assertThat(regular.style()).isEqualTo("Regular");
        assertThat(withBundled.resolve(regular.id()))
                .hasValueSatisfying(
                        file -> {
                            try (InputStream in = file.resource().getInputStream()) {
                                byte[] bytes = in.readAllBytes();
                                assertThat(bytes).hasSize((int) regular.size());
                                assertThat(
                                                HexFormat.of()
                                                        .formatHex(
                                                                MessageDigest.getInstance("SHA-256")
                                                                        .digest(bytes)))
                                        .isEqualTo(regular.id());
                            } catch (Exception e) {
                                throw new AssertionError(e);
                            }
                        });
    }

    @Test
    void customFolderReplacesABundledFamily() throws IOException {
        Path custom = root.resolve("DejaVuSans.ttf");
        copyFixture("DejaVuSans.ttf", custom);
        EditorFontRegistry withBundled =
                new EditorFontRegistry(root, EditorFontRegistry.BUNDLED_FONTS, clock);

        EditorFontFamily dejaVu =
                family(withBundled.snapshot().manifest().families(), "DejaVu Sans");

        assertThat(dejaVu.faces()).hasSize(1);
        byte[] expected = Files.readAllBytes(custom);
        assertThat(withBundled.resolve(dejaVu.faces().get(0).id()))
                .hasValueSatisfying(file -> assertThat(bytesOf(file)).isEqualTo(expected));
    }

    @Test
    void bundledFacesHiddenByACustomFamilyStillResolve() throws IOException {
        EditorFontRegistry withBundled =
                new EditorFontRegistry(root, EditorFontRegistry.BUNDLED_FONTS, clock);
        String boldId =
                family(withBundled.snapshot().manifest().families(), "DejaVu Sans").faces().stream()
                        .filter(EditorFontFace::bold)
                        .findFirst()
                        .orElseThrow()
                        .id();

        copyFixture("DejaVuSans.ttf", root.resolve("DejaVuSans.ttf"));
        clock.advance(EditorFontRegistry.RESCAN_INTERVAL.plusSeconds(1));

        assertThat(family(withBundled.snapshot().manifest().families(), "DejaVu Sans").faces())
                .extracting(EditorFontFace::id)
                .doesNotContain(boldId);
        assertThat(withBundled.resolve(boldId))
                .hasValueSatisfying(
                        file ->
                                assertThat(file.resource().getFilename())
                                        .isEqualTo("DejaVuSans-Bold.ttf"));
    }

    @Test
    void resolvesOnlyKnownWellFormedIds() throws IOException {
        Path font = root.resolve("DejaVuSans.ttf");
        copyFixture("DejaVuSans.ttf", font);
        String id = registry.snapshot().manifest().families().get(0).faces().get(0).id();

        byte[] expected = Files.readAllBytes(font);
        assertThat(registry.resolve(id))
                .hasValueSatisfying(
                        file -> {
                            assertThat(bytesOf(file)).isEqualTo(expected);
                            assertThat(file.size()).isEqualTo(expected.length);
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

    @Test
    void doesNotServeALinkSwappedInWithTheSameSizeAndTime(@TempDir Path outside)
            throws IOException {
        Path font = root.resolve("DejaVuSans.ttf");
        copyFixture("DejaVuSans.ttf", font);
        String id = registry.snapshot().manifest().families().get(0).faces().get(0).id();
        FileTime modified = Files.getLastModifiedTime(font);
        Path secret = outside.resolve("secret.ttf");
        copyFixture("DejaVuSans.ttf", secret);
        setFsType(secret, 0x0008);
        Files.setLastModifiedTime(secret, modified);
        Files.delete(font);
        symlink(font, secret);

        assertThat(registry.resolve(id)).isEmpty();
    }

    @Test
    void servesTheVerifiedBytesWhenTheFileIsSwappedAfterResolving(@TempDir Path outside)
            throws IOException {
        Path font = root.resolve("DejaVuSans.ttf");
        copyFixture("DejaVuSans.ttf", font);
        byte[] indexed = Files.readAllBytes(font);
        String id = registry.snapshot().manifest().families().get(0).faces().get(0).id();
        FontFile file = registry.resolve(id).orElseThrow();
        Path secret = outside.resolve("secret.ttf");
        copyFixture("LiberationSans-Regular.ttf", secret);
        Files.delete(font);
        symlink(font, secret);

        assertThat(bytesOf(file)).isEqualTo(indexed);
    }

    @Test
    void doesNotServeAFileWhoseBytesNoLongerMatchItsId() throws IOException {
        Path font = root.resolve("DejaVuSans.ttf");
        copyFixture("DejaVuSans.ttf", font);
        String id = registry.snapshot().manifest().families().get(0).faces().get(0).id();
        FileTime modified = Files.getLastModifiedTime(font);
        setFsType(font, 0x0008);
        Files.setLastModifiedTime(font, modified);

        assertThat(registry.resolve(id)).isEmpty();
    }

    private static byte[] bytesOf(FontFile file) {
        try (InputStream in = file.resource().getInputStream()) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    private static Path symlink(Path link, Path target) throws IOException {
        try {
            return Files.createSymbolicLink(link, target);
        } catch (UnsupportedOperationException e) {
            return abort("symbolic links are not supported here");
        } catch (FileSystemException e) {
            if (e.getClass() != FileSystemException.class) throw e;
            return abort("no permission to create symbolic links: " + e.getMessage());
        }
    }

    private static EditorFontFamily family(List<EditorFontFamily> families, String name) {
        return families.stream().filter(f -> f.family().equals(name)).findFirst().orElseThrow();
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
        ByteBuffer.wrap(bytes).putShort(tableOffset(bytes, "OS/2") + 8, (short) fsType);
        Files.write(font, bytes);
    }

    private static void setLegacyFamilyName(Path font, String family) throws IOException {
        byte[] bytes = Files.readAllBytes(font);
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        int name = tableOffset(bytes, "name");
        int count = buffer.getShort(name + 2) & 0xFFFF;
        int strings = name + (buffer.getShort(name + 4) & 0xFFFF);
        for (int i = 0; i < count; i++) {
            int record = name + 6 + i * 12;
            if (buffer.getShort(record + 6) != 1) continue;
            boolean windows = buffer.getShort(record) == 3;
            byte[] value =
                    family.getBytes(
                            windows ? StandardCharsets.UTF_16BE : StandardCharsets.US_ASCII);
            int length = buffer.getShort(record + 8) & 0xFFFF;
            assertThat(value).as("same-length family name").hasSize(length);
            System.arraycopy(
                    value, 0, bytes, strings + (buffer.getShort(record + 10) & 0xFFFF), length);
        }
        Files.write(font, bytes);
    }

    private static int tableOffset(byte[] bytes, String table) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        int tables = buffer.getShort(4) & 0xFFFF;
        for (int i = 0; i < tables; i++) {
            int record = 12 + i * 16;
            if (table.equals(new String(bytes, record, 4, StandardCharsets.US_ASCII))) {
                return buffer.getInt(record + 8);
            }
        }
        throw new IllegalStateException("no " + table + " table");
    }

    private static final class PausingClassLoader extends ClassLoader {
        private final CountDownLatch scanning;
        private final CountDownLatch release;

        PausingClassLoader(ClassLoader parent, CountDownLatch scanning, CountDownLatch release) {
            super(parent);
            this.scanning = scanning;
            this.release = release;
        }

        @Override
        public URL getResource(String name) {
            pauseOnFonts(name);
            return super.getResource(name);
        }

        @Override
        public Enumeration<URL> getResources(String name) throws IOException {
            pauseOnFonts(name);
            return super.getResources(name);
        }

        private void pauseOnFonts(String name) {
            if (!name.startsWith("static/fonts")) return;
            scanning.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
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
