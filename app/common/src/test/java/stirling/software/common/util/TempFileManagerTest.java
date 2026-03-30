package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;

class TempFileManagerTest {

    private TempFileManager manager;
    private TempFileRegistry registry;
    private ApplicationProperties applicationProperties;

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() {
        registry = new TempFileRegistry();
        applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        applicationProperties.getSystem().getTempFileManagement().setPrefix("test-stirling-");
        manager = new TempFileManager(registry, applicationProperties);
    }

    @Test
    void testCreateTempFile() throws IOException {
        File file = manager.createTempFile(".pdf");
        assertNotNull(file);
        assertTrue(file.exists());
        assertTrue(file.getName().endsWith(".pdf"));
        assertTrue(registry.contains(file));
    }

    @Test
    void testCreateManagedTempFile() throws IOException {
        TempFile tempFile = manager.createManagedTempFile(".txt");
        assertNotNull(tempFile);
        assertTrue(tempFile.exists());
        assertTrue(tempFile.getFile().getName().endsWith(".txt"));
    }

    @Test
    void testCreateTempDirectory() throws IOException {
        Path dir = manager.createTempDirectory();
        assertNotNull(dir);
        assertTrue(Files.isDirectory(dir));
        assertTrue(registry.getTempDirectories().contains(dir));
    }

    @Test
    void testDeleteTempFile_file() throws IOException {
        File file = manager.createTempFile(".tmp");
        assertTrue(file.exists());

        boolean deleted = manager.deleteTempFile(file);
        assertTrue(deleted);
        assertFalse(file.exists());
        assertFalse(registry.contains(file));
    }

    @Test
    void testDeleteTempFile_path() throws IOException {
        File file = manager.createTempFile(".tmp");
        Path path = file.toPath();
        assertTrue(Files.exists(path));

        boolean deleted = manager.deleteTempFile(path);
        assertTrue(deleted);
        assertFalse(Files.exists(path));
    }

    @Test
    void testDeleteTempFile_nullFile() {
        assertFalse(manager.deleteTempFile((File) null));
    }

    @Test
    void testDeleteTempFile_nullPath() {
        assertFalse(manager.deleteTempFile((Path) null));
    }

    @Test
    void testDeleteTempFile_nonExistentFile() {
        File nonExistent = new File(tempDir.toFile(), "does-not-exist.tmp");
        assertFalse(manager.deleteTempFile(nonExistent));
    }

    @Test
    void testRegister() throws IOException {
        File file = Files.createTempFile(tempDir, "existing", ".tmp").toFile();
        File result = manager.register(file);
        assertSame(file, result);
        assertTrue(registry.contains(file));
    }

    @Test
    void testRegister_nullFile() {
        File result = manager.register(null);
        assertNull(result);
    }

    @Test
    void testGenerateTempFileName() {
        String name = manager.generateTempFileName("convert", "pdf");
        assertNotNull(name);
        assertTrue(name.startsWith("test-stirling-"));
        assertTrue(name.contains("convert"));
        assertTrue(name.endsWith(".pdf"));
    }

    @Test
    void testGetMaxAgeMillis() {
        applicationProperties.getSystem().getTempFileManagement().setMaxAgeHours(2);
        long millis = manager.getMaxAgeMillis();
        assertEquals(2 * 60 * 60 * 1000L, millis);
    }

    @Test
    void testCleanupOldTempFiles() throws IOException, InterruptedException {
        File file = manager.createTempFile(".tmp");
        assertTrue(file.exists());

        Thread.sleep(50);
        int deleted = manager.cleanupOldTempFiles(10);
        assertTrue(deleted >= 1);
        assertFalse(file.exists());
    }
}
