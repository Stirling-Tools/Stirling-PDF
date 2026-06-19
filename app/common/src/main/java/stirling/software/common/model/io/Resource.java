package stirling.software.common.model.io;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;

/**
 * Migration compatibility shim for Spring's {@code org.springframework.core.io.Resource}.
 *
 * <p>Quarkus/Jakarta has no single {@code Resource} abstraction. Rather than rewrite the many
 * public method signatures across the codebase that accept or return {@code Resource}, this
 * interface mirrors the subset of Spring's API the codebase actually uses ({@code
 * getInputStream/exists/getFile/getFilename/contentLength/isFile}) together with the {@link
 * FileSystemResource}, {@link InputStreamResource} and {@link ClassPathResource} implementations.
 * Converting a file is then just an import swap.
 *
 * <p>TODO: Migration required - longer term, prefer {@code java.nio.file.Path} / {@code
 * InputStream} directly at the boundaries and retire this shim.
 */
public interface Resource {

    InputStream getInputStream() throws IOException;

    boolean exists();

    String getFilename();

    long contentLength() throws IOException;

    /** Whether this resource is backed by a real file in the filesystem. */
    default boolean isFile() {
        return false;
    }

    /**
     * @return the underlying file.
     * @throws IOException if the resource is not file-backed.
     */
    File getFile() throws IOException;
}
