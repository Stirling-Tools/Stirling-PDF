package stirling.software.common.model;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import stirling.software.common.model.io.Resource;

/**
 * Migration compatibility shim for Spring's {@code
 * org.springframework.web.multipart.MultipartFile}.
 *
 * <p>Quarkus/JAX-RS has no drop-in equivalent for the {@code MultipartFile} abstraction that the
 * service layer relies on (it exposes {@code org.jboss.resteasy.reactive.multipart.FileUpload} at
 * the REST boundary instead). To avoid rewriting the public signatures of dozens of service and
 * util methods across every module, this interface mirrors the subset of Spring's API that the
 * codebase actually uses. Controllers adapt the inbound {@code FileUpload}/{@code byte[]} to one of
 * the implementations ({@link stirling.software.common.model.multipart.ByteArrayMultipartFile},
 * {@link stirling.software.common.model.multipart.FileUploadMultipartFile}) and pass it down
 * unchanged.
 *
 * <p>TODO: Migration required - longer term, the REST boundary should standardise on {@code
 * FileUpload}/{@code @RestForm} and this shim can be retired.
 */
public interface MultipartFile {

    String getName();

    String getOriginalFilename();

    String getContentType();

    boolean isEmpty();

    long getSize();

    byte[] getBytes() throws IOException;

    InputStream getInputStream() throws IOException;

    /**
     * The content as a {@link Resource}. The default is a stream-backed resource; file-backed
     * implementations (e.g. {@code FileUploadMultipartFile}) override this to enable zero-copy fast
     * paths.
     */
    default Resource getResource() {
        try {
            return new stirling.software.common.model.io.InputStreamResource(
                    getInputStream(), getOriginalFilename());
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    default void transferTo(File dest) throws IOException {
        transferTo(dest.toPath());
    }

    default void transferTo(Path dest) throws IOException {
        try (InputStream in = getInputStream()) {
            Files.copy(in, dest);
        }
    }
}
