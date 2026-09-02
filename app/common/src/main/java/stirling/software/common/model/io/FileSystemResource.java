package stirling.software.common.model.io;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/** File-backed {@link Resource} (migration shim for Spring's {@code FileSystemResource}). */
public class FileSystemResource implements Resource {

    private final Path path;

    public FileSystemResource(Path path) {
        this.path = path;
    }

    public FileSystemResource(File file) {
        this.path = file.toPath();
    }

    public FileSystemResource(String path) {
        this.path = Path.of(path);
    }

    @Override
    public InputStream getInputStream() throws IOException {
        return Files.newInputStream(path);
    }

    @Override
    public boolean exists() {
        return Files.exists(path);
    }

    @Override
    public String getFilename() {
        Path name = path.getFileName();
        return name == null ? null : name.toString();
    }

    @Override
    public long contentLength() throws IOException {
        return Files.size(path);
    }

    @Override
    public boolean isFile() {
        return true;
    }

    @Override
    public File getFile() {
        return path.toFile();
    }
}
