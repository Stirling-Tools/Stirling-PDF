package stirling.software.proprietary.storage.provider;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;

import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

/** {@link StorageProvider} backed by an S3-compatible object store. */
@Slf4j
public class S3StorageProvider implements StorageProvider, AutoCloseable {

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final String bucket;

    public S3StorageProvider(S3Client s3Client, S3Presigner s3Presigner, String bucket) {
        if (bucket == null || bucket.isBlank()) {
            throw new IllegalArgumentException("S3 bucket must be configured");
        }
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
        this.bucket = bucket;
    }

    @Override
    public StoredObject store(User owner, MultipartFile file) throws IOException {
        if (owner == null || owner.getId() == null) {
            throw new IllegalArgumentException("owner.id is required for S3 storage key");
        }
        String originalFilename = sanitizeFilename(file.getOriginalFilename());
        // Key is opaque ({ownerId}/{uuid}) so non-ASCII filenames don't break vendors that
        // restrict key charset (e.g. Supabase Storage returns 400 Invalid key on unicode).
        // The display name is preserved in StoredObject.originalFilename and the DB row.
        String storageKey = owner.getId() + "/" + UUID.randomUUID();

        PutObjectRequest.Builder request =
                PutObjectRequest.builder().bucket(bucket).key(storageKey);
        if (file.getContentType() != null && !file.getContentType().isBlank()) {
            request.contentType(file.getContentType());
        }
        try (InputStream inputStream = file.getInputStream()) {
            s3Client.putObject(
                    request.build(), RequestBody.fromInputStream(inputStream, file.getSize()));
        } catch (SdkException e) {
            throw new IOException("Failed to upload object to S3", e);
        }

        return StoredObject.builder()
                .storageKey(storageKey)
                .originalFilename(originalFilename)
                .contentType(file.getContentType())
                .sizeBytes(file.getSize())
                .build();
    }

    @Override
    public Resource load(String storageKey) throws IOException {
        GetObjectRequest request =
                GetObjectRequest.builder().bucket(bucket).key(storageKey).build();
        try {
            ResponseInputStream<GetObjectResponse> stream = s3Client.getObject(request);
            long contentLength =
                    stream.response().contentLength() != null
                            ? stream.response().contentLength()
                            : -1;
            return new InputStreamResource(stream) {
                @Override
                public long contentLength() {
                    return contentLength;
                }
            };
        } catch (NoSuchKeyException e) {
            throw new IOException("File not found", e);
        } catch (SdkException e) {
            throw new IOException("Failed to load object from S3", e);
        }
    }

    @Override
    public void delete(String storageKey) throws IOException {
        try {
            s3Client.deleteObject(
                    DeleteObjectRequest.builder().bucket(bucket).key(storageKey).build());
        } catch (SdkException e) {
            throw new IOException("Failed to delete object from S3", e);
        }
    }

    @Override
    public Optional<URI> signedDownloadUrl(String storageKey, Duration ttl) throws IOException {
        return signedDownloadUrl(storageKey, ttl, false, null);
    }

    @Override
    public Optional<URI> signedDownloadUrl(
            String storageKey, Duration ttl, boolean inline, String originalFilename)
            throws IOException {
        if (storageKey == null || storageKey.isBlank()) {
            return Optional.empty();
        }
        Duration effectiveTtl =
                ttl == null || ttl.isZero() || ttl.isNegative() ? Duration.ofMinutes(5) : ttl;
        try {
            GetObjectRequest.Builder getBuilder =
                    GetObjectRequest.builder().bucket(bucket).key(storageKey);
            String disposition = buildContentDisposition(inline, originalFilename);
            if (disposition != null) {
                getBuilder.responseContentDisposition(disposition);
            }
            GetObjectPresignRequest presignRequest =
                    GetObjectPresignRequest.builder()
                            .signatureDuration(effectiveTtl)
                            .getObjectRequest(getBuilder.build())
                            .build();
            PresignedGetObjectRequest presigned = s3Presigner.presignGetObject(presignRequest);
            return Optional.of(presigned.url().toURI());
        } catch (SdkException | URISyntaxException e) {
            log.warn("Failed to create presigned S3 GET URL for key {}", storageKey, e);
            return Optional.empty();
        }
    }

    // Returns null when originalFilename is blank; S3 falls back to its own default in that case.
    static String buildContentDisposition(boolean inline, String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return null;
        }
        // Strip CR/LF and other control chars before path parsing (Path.of throws on them on
        // Windows, and they defeat header parsers).
        String stripped = originalFilename.replaceAll("\\p{Cntrl}", "");
        // Use only the basename to avoid leaking directory structure into the header.
        int lastSeparator = Math.max(stripped.lastIndexOf('/'), stripped.lastIndexOf('\\'));
        if (lastSeparator >= 0) {
            stripped = stripped.substring(lastSeparator + 1);
        }
        if (stripped.isBlank()) {
            return null;
        }
        // Escape per RFC 6266 quoted-string rules.
        String escaped = stripped.replace("\\", "\\\\").replace("\"", "\\\"");
        return (inline ? "inline" : "attachment") + "; filename=\"" + escaped + "\"";
    }

    @Override
    public void close() {
        try {
            s3Presigner.close();
        } catch (Exception e) {
            log.warn("Error closing S3 presigner", e);
        }
        try {
            s3Client.close();
        } catch (Exception e) {
            log.warn("Error closing S3 client", e);
        }
    }

    private String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "file";
        }
        String stripped = Path.of(filename).getFileName().toString().replaceAll("\\p{Cntrl}", "");
        return stripped.isBlank() ? "file" : stripped;
    }
}
