package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.HashSet;
import java.util.Set;
import java.util.function.Consumer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/** Additional coverage for TempFileCleanupService branches not exercised by the base test. */
class TempFileCleanupServiceMoreTest {

    @TempDir Path tempDir;

    @Mock private TempFileRegistry registry;
    @Mock private TempFileManager tempFileManager;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.System system;
    @Mock private ApplicationProperties.TempFileManagement tempFileManagement;

    @InjectMocks private TempFileCleanupService cleanupService;

    private Path systemTempDir;
    private Path customTempDir;
    private Path libreOfficeTempDir;

    private AutoCloseable closeable;

    @BeforeEach
    void setUp() throws IOException {
        closeable = MockitoAnnotations.openMocks(this);

        systemTempDir = tempDir.resolve("systemTemp");
        customTempDir = tempDir.resolve("customTemp");
        libreOfficeTempDir = tempDir.resolve("libreOfficeTemp");
        Files.createDirectories(systemTempDir);
        Files.createDirectories(customTempDir);
        Files.createDirectories(libreOfficeTempDir);

        lenient().when(applicationProperties.getSystem()).thenReturn(system);
        lenient().when(system.getTempFileManagement()).thenReturn(tempFileManagement);
        lenient().when(tempFileManagement.getBaseTmpDir()).thenReturn(customTempDir.toString());
        lenient()
                .when(tempFileManagement.getLibreofficeDir())
                .thenReturn(libreOfficeTempDir.toString());
        lenient().when(tempFileManagement.getSystemTempDir()).thenReturn(systemTempDir.toString());
        lenient().when(tempFileManagement.isStartupCleanup()).thenReturn(false);
        lenient().when(tempFileManagement.isCleanupSystemTemp()).thenReturn(false);

        ReflectionTestUtils.setField(cleanupService, "machineType", "Standard");
        lenient().when(tempFileManager.getMaxAgeMillis()).thenReturn(3600000L);
    }

    @AfterEach
    void tearDown() throws Exception {
        closeable.close();
    }

    private static void backdate(Path file, long millisAgo) throws IOException {
        Files.setLastModifiedTime(
                file, FileTime.fromMillis(System.currentTimeMillis() - millisAgo));
    }

    @Nested
    @DisplayName("isContainerMode")
    class ContainerMode {

        @Test
        @DisplayName("Docker and Kubernetes are container modes; others are not")
        void detectsContainerMachineTypes() {
            ReflectionTestUtils.setField(cleanupService, "machineType", "Docker");
            assertThat(
                            (Boolean)
                                    ReflectionTestUtils.invokeMethod(
                                            cleanupService, "isContainerMode"))
                    .isTrue();
            ReflectionTestUtils.setField(cleanupService, "machineType", "Kubernetes");
            assertThat(
                            (Boolean)
                                    ReflectionTestUtils.invokeMethod(
                                            cleanupService, "isContainerMode"))
                    .isTrue();
            ReflectionTestUtils.setField(cleanupService, "machineType", "Standard");
            assertThat(
                            (Boolean)
                                    ReflectionTestUtils.invokeMethod(
                                            cleanupService, "isContainerMode"))
                    .isFalse();
        }
    }

    @Nested
    @DisplayName("getSystemTempPath")
    class SystemTempPath {

        @Test
        @DisplayName("uses the configured system temp dir when set")
        void usesConfiguredDir() {
            when(tempFileManagement.getSystemTempDir()).thenReturn(systemTempDir.toString());
            Path path =
                    (Path) ReflectionTestUtils.invokeMethod(cleanupService, "getSystemTempPath");
            assertThat(path).isEqualTo(systemTempDir);
        }

        @Test
        @DisplayName("falls back to java.io.tmpdir when unset")
        void fallsBackToJavaTmpDir() {
            when(tempFileManagement.getSystemTempDir()).thenReturn("");
            Path path =
                    (Path) ReflectionTestUtils.invokeMethod(cleanupService, "getSystemTempPath");
            assertThat(path).isEqualTo(Path.of(System.getProperty("java.io.tmpdir")));
        }
    }

    @Nested
    @DisplayName("init")
    class Init {

        @Test
        @DisplayName("creates configured temp directories that do not yet exist")
        void createsMissingDirectories() {
            Path newBase = tempDir.resolve("newBase");
            Path newLo = tempDir.resolve("newLo");
            when(tempFileManagement.getBaseTmpDir()).thenReturn(newBase.toString());
            when(tempFileManagement.getLibreofficeDir()).thenReturn(newLo.toString());
            when(tempFileManagement.isStartupCleanup()).thenReturn(false);

            cleanupService.init();

            assertThat(Files.exists(newBase)).isTrue();
            assertThat(Files.exists(newLo)).isTrue();
        }

        @Test
        @DisplayName("runs startup cleanup when enabled")
        void runsStartupCleanupWhenEnabled() throws IOException {
            when(tempFileManagement.isStartupCleanup()).thenReturn(true);
            when(registry.contains(any(File.class))).thenReturn(false);

            // An old stirling temp file in the custom dir should be removed by startup cleanup.
            Path stale = Files.createFile(customTempDir.resolve("stirling-pdf-stale.tmp"));
            backdate(stale, 48L * 60 * 60 * 1000); // 48h old, beyond non-container 24h cutoff

            cleanupService.init();

            assertThat(Files.exists(stale)).isFalse();
        }
    }

    @Nested
    @DisplayName("scheduledCleanup")
    class ScheduledCleanup {

        @Test
        @DisplayName("deletes registered temp directories and reports counts")
        void deletesRegisteredDirectories() throws IOException {
            when(tempFileManager.cleanupOldTempFiles(anyLong())).thenReturn(2);
            Path regDir = Files.createDirectories(tempDir.resolve("registeredDir"));
            Files.createFile(regDir.resolve("inside.txt"));
            Set<Path> dirs = new HashSet<>();
            dirs.add(regDir);
            when(registry.getTempDirectories()).thenReturn(dirs);
            lenient().when(registry.contains(any(File.class))).thenReturn(false);

            withIsolatedUserHome(cleanupService::scheduledCleanup);

            // The registered directory was removed by GeneralUtils.deleteDirectory.
            assertThat(Files.exists(regDir)).isFalse();
            verify(tempFileManager).cleanupOldTempFiles(anyLong());
        }

        @Test
        @DisplayName("skips a registered directory that no longer exists")
        void skipsMissingRegisteredDirectory() {
            when(tempFileManager.cleanupOldTempFiles(anyLong())).thenReturn(0);
            Set<Path> dirs = new HashSet<>();
            dirs.add(tempDir.resolve("ghostDir"));
            when(registry.getTempDirectories()).thenReturn(dirs);
            lenient().when(registry.contains(any(File.class))).thenReturn(false);

            // No exception even though the directory does not exist.
            withIsolatedUserHome(cleanupService::scheduledCleanup);
            verify(registry).getTempDirectories();
        }
    }

    @Nested
    @DisplayName("cleanupUnregisteredFiles system-temp inclusion")
    class CleanupUnregistered {

        @Test
        @DisplayName("includes the system temp dir when cleanupSystemTemp is enabled")
        void includesSystemTempDir() throws Exception {
            when(tempFileManagement.isCleanupSystemTemp()).thenReturn(true);
            when(tempFileManagement.getSystemTempDir()).thenReturn(systemTempDir.toString());
            when(registry.contains(any(File.class))).thenReturn(false);

            // Old stirling file in the system temp dir should be deleted in container mode.
            Path stale = Files.createFile(systemTempDir.resolve("stirling-pdf-sys.tmp"));
            backdate(stale, 2L * 60 * 60 * 1000); // 2h old

            int deleted =
                    (int)
                            ReflectionTestUtils.invokeMethod(
                                    cleanupService,
                                    "cleanupUnregisteredFiles",
                                    true,
                                    true,
                                    3600000L);

            assertThat(deleted).isGreaterThanOrEqualTo(1);
            assertThat(Files.exists(stale)).isFalse();
        }
    }

    @Nested
    @DisplayName("registered-file skip and recursion depth")
    class RegistryAndDepth {

        @Test
        @DisplayName("a registered file is never deleted")
        void registeredFilePreserved() throws Exception {
            Path registered = Files.createFile(systemTempDir.resolve("output_registered.pdf"));
            backdate(registered, 2L * 60 * 60 * 1000);
            // The registry reports the file as registered, so cleanup must skip it.
            when(registry.contains(any(File.class))).thenReturn(true);

            invokeCleanupDirectoryStreaming(systemTempDir, 0, false, 3600000L);

            assertThat(Files.exists(registered)).isTrue();
        }

        @Test
        @DisplayName("recursion stops once the maximum depth is exceeded")
        void recursionDepthGuard() throws Exception {
            // Starting beyond MAX_RECURSION_DEPTH (5) returns immediately without listing.
            Path deepFile = Files.createFile(systemTempDir.resolve("output_deep.pdf"));
            backdate(deepFile, 2L * 60 * 60 * 1000);
            lenient().when(registry.contains(any(File.class))).thenReturn(false);

            invokeCleanupDirectoryStreaming(systemTempDir, 6, false, 3600000L);

            // Depth guard hit: the file was not visited or deleted.
            assertThat(Files.exists(deepFile)).isTrue();
        }
    }

    @Nested
    @DisplayName("cleanupLibreOfficeTempFiles")
    class LibreOfficeCleanup {

        @Test
        @DisplayName("clears contents of registered libreoffice directories but keeps the dir")
        void clearsLibreOfficeContents() throws IOException {
            Path loDir = Files.createDirectories(tempDir.resolve("libreoffice-conv"));
            Path inside = Files.createFile(loDir.resolve("output_lo.pdf"));
            Set<Path> dirs = new HashSet<>();
            dirs.add(loDir);
            when(registry.getTempDirectories()).thenReturn(dirs);
            when(registry.contains(any(File.class))).thenReturn(false);

            cleanupService.cleanupLibreOfficeTempFiles();

            // The file is removed (age ignored), directory itself remains.
            assertThat(Files.exists(inside)).isFalse();
            assertThat(Files.exists(loDir)).isTrue();
        }

        @Test
        @DisplayName("ignores registered directories that are not libreoffice dirs")
        void ignoresNonLibreOfficeDirs() throws IOException {
            Path other = Files.createDirectories(tempDir.resolve("other-dir"));
            Path keep = Files.createFile(other.resolve("output_keep.pdf"));
            Set<Path> dirs = new HashSet<>();
            dirs.add(other);
            when(registry.getTempDirectories()).thenReturn(dirs);

            cleanupService.cleanupLibreOfficeTempFiles();

            // Not a libreoffice dir, so its contents are untouched.
            assertThat(Files.exists(keep)).isTrue();
        }
    }

    @Nested
    @DisplayName("cleanupPDFBoxCache")
    class PdfBoxCache {

        @Test
        @DisplayName("deletes an existing .pdfbox.cache file in the user home")
        void deletesCacheFile() throws IOException {
            Path fakeHome = Files.createDirectories(tempDir.resolve("home"));
            Path cache = Files.createFile(fakeHome.resolve(".pdfbox.cache"));

            String oldHome = System.getProperty("user.home");
            try {
                System.setProperty("user.home", fakeHome.toString());
                ReflectionTestUtils.invokeMethod(cleanupService, "cleanupPDFBoxCache");
                assertThat(Files.exists(cache)).isFalse();
            } finally {
                System.setProperty("user.home", oldHome);
            }
        }

        @Test
        @DisplayName("is a no-op when no cache file exists")
        void noOpWhenNoCache() throws IOException {
            Path fakeHome = Files.createDirectories(tempDir.resolve("home2"));
            String oldHome = System.getProperty("user.home");
            try {
                System.setProperty("user.home", fakeHome.toString());
                // No exception when the cache file is absent.
                ReflectionTestUtils.invokeMethod(cleanupService, "cleanupPDFBoxCache");
                assertThat(Files.exists(fakeHome.resolve(".pdfbox.cache"))).isFalse();
            } finally {
                System.setProperty("user.home", oldHome);
            }
        }
    }

    // Point user.home at a throwaway dir so the real ~/.pdfbox.cache is never touched.
    private void withIsolatedUserHome(Runnable action) {
        String oldHome = System.getProperty("user.home");
        try {
            Path fakeHome = Files.createDirectories(tempDir.resolve("isolated-home"));
            System.setProperty("user.home", fakeHome.toString());
            action.run();
        } catch (IOException e) {
            throw new RuntimeException(e);
        } finally {
            System.setProperty("user.home", oldHome);
        }
    }

    private void invokeCleanupDirectoryStreaming(
            Path directory, int depth, boolean containerMode, long maxAgeMillis) {
        try {
            Consumer<Path> noop = p -> {};
            var method =
                    TempFileCleanupService.class.getDeclaredMethod(
                            "cleanupDirectoryStreaming",
                            Path.class,
                            boolean.class,
                            int.class,
                            long.class,
                            boolean.class,
                            Consumer.class);
            method.setAccessible(true);
            method.invoke(
                    cleanupService, directory, containerMode, depth, maxAgeMillis, false, noop);
        } catch (Exception e) {
            throw new RuntimeException("Error invoking cleanupDirectoryStreaming", e);
        }
    }
}
