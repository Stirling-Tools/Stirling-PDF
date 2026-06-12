package stirling.software.common.model.multipart;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.jboss.resteasy.reactive.multipart.FileUpload;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.io.FileSystemResource;
import stirling.software.common.model.io.Resource;

/**
 * Adapts a Quarkus REST {@link FileUpload} (the inbound multipart representation at the JAX-RS
 * boundary) to the {@link MultipartFile} migration shim, so controllers can pass uploads down to
 * the existing service layer without changing its method signatures.
 */
public class FileUploadMultipartFile implements MultipartFile {

    private final FileUpload delegate;

    public FileUploadMultipartFile(FileUpload delegate) {
        this.delegate = delegate;
    }

    /** Null-safe factory: returns null when the upload is absent. */
    public static MultipartFile of(FileUpload upload) {
        return upload == null ? null : new FileUploadMultipartFile(upload);
    }

    @Override
    public String getName() {
        return delegate.name();
    }

    @Override
    public String getOriginalFilename() {
        return delegate.fileName();
    }

    @Override
    public String getContentType() {
        return delegate.contentType();
    }

    @Override
    public boolean isEmpty() {
        return getSize() == 0;
    }

    @Override
    public long getSize() {
        return delegate.size();
    }

    @Override
    public byte[] getBytes() throws IOException {
        return Files.readAllBytes(delegate.uploadedFile());
    }

    @Override
    public InputStream getInputStream() throws IOException {
        return Files.newInputStream(delegate.uploadedFile());
    }

    @Override
    public Resource getResource() {
        // File-backed: enables FileStorage's zero-copy fast path.
        return new FileSystemResource(delegate.uploadedFile());
    }

    @Override
    public void transferTo(Path dest) throws IOException {
        // Overwrite semantics like Spring's MultipartFile#transferTo; callers often pass a
        // Files.createTempFile(...) path that already exists, so REPLACE_EXISTING is required.
        Files.copy(
                delegate.uploadedFile(), dest, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }
}
