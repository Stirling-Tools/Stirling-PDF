package stirling.software.common.util;

import java.io.IOException;
import java.nio.file.Path;

import lombok.extern.slf4j.Slf4j;

/**
 * A wrapper class for a temporary directory that implements AutoCloseable. Can be used with
 * try-with-resources for automatic cleanup.
 */
@Slf4j
public class TempDirectory implements AutoCloseable {

    private final TempFileManager manager;
    private final Path directory;

    public TempDirectory(TempFileManager manager) throws IOException {
        this.manager = manager;
        this.directory = manager.createTempDirectory();
    }

    public Path getPath() {
        return directory;
    }

    public String getAbsolutePath() {
        return directory.toAbsolutePath().toString();
    }

    public boolean exists() {
        return java.nio.file.Files.exists(directory);
    }

    @Override
    public void close() {
        manager.deleteTempDirectory(directory);
    }

    @Override
    public String toString() {
        return "TempDirectory{" + directory.toAbsolutePath() + "}";
    }
}
