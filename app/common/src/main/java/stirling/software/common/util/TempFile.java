package stirling.software.common.util;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;

import lombok.extern.slf4j.Slf4j;

/**
 * A wrapper class for a temporary file that implements AutoCloseable. Can be used with
 * try-with-resources for automatic cleanup.
 */
@Slf4j
public class TempFile implements AutoCloseable {

    private final TempFileManager manager;
    private final File file;

    public TempFile(TempFileManager manager, String suffix) throws IOException {
        this.manager = manager;
        this.file = manager.createTempFile(suffix);
    }

    public File getFile() {
        return file;
    }

    public Path getPath() {
        return file.toPath();
    }

    public String getAbsolutePath() {
        return file.getAbsolutePath();
    }

    public boolean exists() {
        return file.exists();
    }

    @Override
    public void close() {
        manager.deleteTempFile(file);
    }

    @Override
    public String toString() {
        return "TempFile{" + file.getAbsolutePath() + "}";
    }
}
