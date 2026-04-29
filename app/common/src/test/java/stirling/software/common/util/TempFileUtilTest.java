package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;

class TempFileUtilTest {

    private TempFileManager manager;

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() {
        TempFileRegistry registry = new TempFileRegistry();
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("test-");
        manager = new TempFileManager(registry, props);
    }

    @Test
    void testWithTempFile_executesAndCleansUp() throws IOException {
        final File[] fileRef = new File[1];
        String result =
                TempFileUtil.withTempFile(
                        manager,
                        ".tmp",
                        file -> {
                            fileRef[0] = file;
                            assertTrue(file.exists());
                            return "done";
                        });
        assertEquals("done", result);
        assertFalse(fileRef[0].exists());
    }

    @Test
    void testWithMultipleTempFiles() throws IOException {
        final List<File>[] filesRef = new List[1];
        String result =
                TempFileUtil.withMultipleTempFiles(
                        manager,
                        3,
                        ".tmp",
                        files -> {
                            filesRef[0] = files;
                            assertEquals(3, files.size());
                            for (File f : files) {
                                assertTrue(f.exists());
                            }
                            return "ok";
                        });
        assertEquals("ok", result);
        for (File f : filesRef[0]) {
            assertFalse(f.exists());
        }
    }

    @Test
    void testSafeDeleteFiles() throws IOException {
        Path file1 = Files.createTempFile(tempDir, "safe", ".tmp");
        Path file2 = Files.createTempFile(tempDir, "safe", ".tmp");
        assertTrue(Files.exists(file1));
        assertTrue(Files.exists(file2));

        TempFileUtil.safeDeleteFiles(Arrays.asList(file1, file2));
        assertFalse(Files.exists(file1));
        assertFalse(Files.exists(file2));
    }

    @Test
    void testSafeDeleteFiles_nullList() {
        // Should not throw
        TempFileUtil.safeDeleteFiles(null);
    }

    @Test
    void testSafeDeleteFiles_nullElement() throws IOException {
        Path file = Files.createTempFile(tempDir, "safe", ".tmp");
        // Should handle null elements gracefully
        TempFileUtil.safeDeleteFiles(Arrays.asList(null, file));
        assertFalse(Files.exists(file));
    }

    @Test
    void testRegisterExistingTempFile() throws IOException {
        File file = Files.createTempFile(tempDir, "existing", ".tmp").toFile();
        File result = TempFileUtil.registerExistingTempFile(manager, file);
        assertSame(file, result);
    }

    @Test
    void testRegisterExistingTempFile_nullManager() throws IOException {
        File file = Files.createTempFile(tempDir, "existing", ".tmp").toFile();
        File result = TempFileUtil.registerExistingTempFile(null, file);
        assertSame(file, result);
    }

    @Test
    void testRegisterExistingTempFile_nullFile() {
        File result = TempFileUtil.registerExistingTempFile(manager, null);
        assertNull(result);
    }

    @Test
    void testTempFileCollection() throws IOException {
        TempFileUtil.TempFileCollection collection = new TempFileUtil.TempFileCollection(manager);
        File f1 = collection.addTempFile(".tmp");
        File f2 = collection.addTempFile(".pdf");

        assertTrue(f1.exists());
        assertTrue(f2.exists());
        assertEquals(2, collection.getFiles().size());

        collection.close();
        assertFalse(f1.exists());
        assertFalse(f2.exists());
    }
}
