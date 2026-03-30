package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TempFileRegistryTest {

    private TempFileRegistry registry;

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() {
        registry = new TempFileRegistry();
    }

    @Test
    void testRegisterFile() throws IOException {
        File file = Files.createTempFile(tempDir, "test", ".tmp").toFile();
        File result = registry.register(file);
        assertSame(file, result);
        assertTrue(registry.contains(file));
    }

    @Test
    void testRegisterNull() {
        registry.register((File) null);
        assertEquals(0, registry.getAllRegisteredFiles().size());
    }

    @Test
    void testRegisterPath() throws IOException {
        Path path = Files.createTempFile(tempDir, "test", ".tmp");
        Path result = registry.register(path);
        assertSame(path, result);
        assertTrue(registry.getAllRegisteredFiles().contains(path));
    }

    @Test
    void testUnregisterFile() throws IOException {
        File file = Files.createTempFile(tempDir, "test", ".tmp").toFile();
        registry.register(file);
        assertTrue(registry.contains(file));

        registry.unregister(file);
        assertFalse(registry.contains(file));
    }

    @Test
    void testUnregisterPath() throws IOException {
        Path path = Files.createTempFile(tempDir, "test", ".tmp");
        registry.register(path);
        registry.unregister(path);
        assertFalse(registry.getAllRegisteredFiles().contains(path));
    }

    @Test
    void testUnregisterNull() {
        // Should not throw
        registry.unregister((File) null);
        registry.unregister((Path) null);
    }

    @Test
    void testRegisterDirectory() throws IOException {
        Path dir = Files.createTempDirectory(tempDir, "testdir");
        Path result = registry.registerDirectory(dir);
        assertSame(dir, result);
        assertTrue(registry.getTempDirectories().contains(dir));
    }

    @Test
    void testRegisterThirdParty() throws IOException {
        File file = Files.createTempFile(tempDir, "third", ".tmp").toFile();
        File result = registry.registerThirdParty(file);
        assertSame(file, result);
        assertTrue(registry.getThirdPartyTempFiles().contains(file.toPath()));
        assertTrue(registry.contains(file));
    }

    @Test
    void testContainsNull() {
        assertFalse(registry.contains(null));
    }

    @Test
    void testGetFilesOlderThan() throws IOException, InterruptedException {
        Path path = Files.createTempFile(tempDir, "old", ".tmp");
        registry.register(path);

        // Files registered just now should not be "older than 0ms" since
        // getFilesOlderThan uses isBefore(cutoff), meaning strictly before
        Thread.sleep(50);
        Set<Path> oldFiles = registry.getFilesOlderThan(10);
        assertTrue(oldFiles.contains(path));
    }

    @Test
    void testGetFilesOlderThan_recentFiles() throws IOException {
        Path path = Files.createTempFile(tempDir, "recent", ".tmp");
        registry.register(path);

        // With a very large maxAge, no files should be "old"
        Set<Path> oldFiles = registry.getFilesOlderThan(999_999_999);
        assertFalse(oldFiles.contains(path));
    }

    @Test
    void testClear() throws IOException {
        File file = Files.createTempFile(tempDir, "clear", ".tmp").toFile();
        Path dir = Files.createTempDirectory(tempDir, "cleardir");
        registry.register(file);
        registry.registerThirdParty(file);
        registry.registerDirectory(dir);

        registry.clear();

        assertEquals(0, registry.getAllRegisteredFiles().size());
        assertEquals(0, registry.getThirdPartyTempFiles().size());
        assertEquals(0, registry.getTempDirectories().size());
    }
}
