package stirling.software.common.util;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * A wrapper class for a temporary file that implements AutoCloseable. Can be used with
 * try-with-resources for automatic cleanup.
 */
@Slf4j
public class TempFile implements AutoCloseable {

    private final TempFileManager manager;
    @Getter private final File file;

    public TempFile(TempFileManager manager, String suffix) throws IOException {
        this.manager = manager;
        File created = null;
        if (manager != null) {
            try {
                created = manager.createTempFile(suffix);
            } catch (Exception e) {
                log.warn(
                        "TempFileManager failed to create temp file, falling back to File.createTempFile",
                        e);
            }
        }
        if (created == null) {
            created = File.createTempFile("stirling-pdf-temp", suffix);
        }
        this.file = created;
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
        if (manager != null) {
            try {
                manager.deleteTempFile(file);
            } catch (Exception e) {
                if (file != null && file.exists()) {
                    file.delete();
                }
            }
        }
        if (file != null && file.exists()) {
            file.delete();
        }
    }

    @Override
    public String toString() {
        return "TempFile{" + file.getAbsolutePath() + "}";
    }
}
