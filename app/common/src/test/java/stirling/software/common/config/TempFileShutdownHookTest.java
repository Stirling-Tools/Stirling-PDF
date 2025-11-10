package stirling.software.common.config;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.util.TempFileRegistry;

class TempFileShutdownHookTest {

    @TempDir Path tempDir;

    @Test
    void destroyDeletesRegisteredFilesAndDirectoriesAndClearsRegistry() throws IOException {
        TempFileRegistry registry = new TempFileRegistry();

        Path tempFile = Files.createTempFile(tempDir, "shutdown-hook", ".tmp");
        Path tempDirectory = Files.createTempDirectory(tempDir, "shutdown-dir");
        Path nestedFile = Files.createTempFile(tempDirectory, "nested", ".tmp");

        registry.register(tempFile);
        registry.registerDirectory(tempDirectory);
        registry.registerThirdParty(tempFile.toFile());

        TempFileShutdownHook shutdownHook = new TempFileShutdownHook(registry);

        assertTrue(Files.exists(tempFile), "Registered temp file should exist before cleanup");
        assertTrue(
                Files.exists(tempDirectory),
                "Registered temp directory should exist before cleanup");
        assertTrue(
                Files.exists(nestedFile),
                "Files within the registered directory should exist before cleanup");

        shutdownHook.destroy();

        assertFalse(Files.exists(tempFile), "Temp file should be deleted during cleanup");
        assertFalse(
                Files.exists(nestedFile),
                "Nested file should be deleted when directory is cleaned up");
        assertFalse(Files.exists(tempDirectory), "Temp directory should be deleted during cleanup");
        assertTrue(
                registry.getAllRegisteredFiles().isEmpty(),
                "Registry should be cleared of files after cleanup");
        assertTrue(
                registry.getTempDirectories().isEmpty(),
                "Registry should be cleared of directories after cleanup");
        assertTrue(
                registry.getThirdPartyTempFiles().isEmpty(),
                "Registry should clear third-party files after cleanup");
    }
}
