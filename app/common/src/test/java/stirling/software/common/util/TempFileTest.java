package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;

class TempFileTest {

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
    void testTempFileCreation() throws IOException {
        TempFile tempFile = new TempFile(manager, ".pdf");
        assertNotNull(tempFile.getFile());
        assertTrue(tempFile.exists());
        assertTrue(tempFile.getFile().getName().endsWith(".pdf"));
    }

    @Test
    void testGetPath() throws IOException {
        TempFile tempFile = new TempFile(manager, ".txt");
        Path path = tempFile.getPath();
        assertNotNull(path);
        assertEquals(tempFile.getFile().toPath(), path);
    }

    @Test
    void testGetAbsolutePath() throws IOException {
        TempFile tempFile = new TempFile(manager, ".tmp");
        String absPath = tempFile.getAbsolutePath();
        assertNotNull(absPath);
        assertEquals(tempFile.getFile().getAbsolutePath(), absPath);
    }

    @Test
    void testClose_deletesFile() throws IOException {
        TempFile tempFile = new TempFile(manager, ".tmp");
        assertTrue(tempFile.exists());

        tempFile.close();
        assertFalse(tempFile.exists());
    }

    @Test
    void testTryWithResources() throws IOException {
        TempFile tempFileRef;
        try (TempFile tempFile = new TempFile(manager, ".tmp")) {
            tempFileRef = tempFile;
            assertTrue(tempFile.exists());
        }
        assertFalse(tempFileRef.exists());
    }

    @Test
    void testToString() throws IOException {
        TempFile tempFile = new TempFile(manager, ".tmp");
        String str = tempFile.toString();
        assertTrue(str.startsWith("TempFile{"));
        assertTrue(str.endsWith("}"));
        assertTrue(str.contains(tempFile.getFile().getAbsolutePath()));
    }
}
