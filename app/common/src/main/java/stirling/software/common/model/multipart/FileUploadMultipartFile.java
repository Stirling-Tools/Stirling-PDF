package stirling.software.common.model.multipart;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

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

    /**
     * Null-safe factory for a multipart field that may have multiple parts under the same name.
     *
     * <p>Spring's MultipartFile binding picked the actual file part even when a client also sent a
     * plain text form field of the same name; RESTEasy Reactive's {@code @RestForm FileUpload}
     * binds the <em>first</em> part by name instead, so a stray {@code name=value} text part sent
     * before the file would shadow the upload. Prefer the part that carries a real filename (the
     * file), falling back to the last part, so such requests bind the same way they did under
     * Spring.
     */
    public static MultipartFile of(List<FileUpload> uploads) {
        if (uploads == null || uploads.isEmpty()) {
            return null;
        }
        FileUpload chosen = null;
        for (FileUpload upload : uploads) {
            if (upload.fileName() != null && !upload.fileName().isBlank()) {
                chosen = upload;
                break;
            }
        }
        if (chosen == null) {
            chosen = uploads.get(uploads.size() - 1);
        }
        return new FileUploadMultipartFile(chosen);
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
