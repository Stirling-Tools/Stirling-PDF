package stirling.software.proprietary.cluster.s3;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.FileStore;

import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * S3-backed {@link FileStore} for transient job-result files. Objects are namespaced under a
 * configurable key prefix (default {@code transient/}) and can coexist in the same bucket as {@code
 * S3StorageProvider}.
 */
@Slf4j
public class S3FileStore implements FileStore, AutoCloseable {

    public static final String DEFAULT_KEY_PREFIX = "transient/";
    static final String OWNER_METADATA_KEY = "owner";

    private final S3Client s3Client;
    private final String bucket;
    private final String keyPrefix;
    private final boolean ownsClient;

    public S3FileStore(S3Client s3Client, String bucket) {
        this(s3Client, bucket, DEFAULT_KEY_PREFIX, true);
    }

    public S3FileStore(S3Client s3Client, String bucket, String keyPrefix) {
        this(s3Client, bucket, keyPrefix, true);
    }

    /**
     * @param ownsClient when true, {@link #close()} will close the supplied client. Set to false in
     *     tests that share the client with another consumer.
     */
    public S3FileStore(S3Client s3Client, String bucket, String keyPrefix, boolean ownsClient) {
        if (bucket == null || bucket.isBlank()) {
            throw new IllegalArgumentException("S3 bucket must be configured");
        }
        this.s3Client = s3Client;
        this.bucket = bucket;
        this.keyPrefix = normalizePrefix(keyPrefix);
        this.ownsClient = ownsClient;
    }

    @Override
    public Stored store(InputStream in, String originalName, String owner) throws IOException {
        String fileId = UUID.randomUUID().toString();
        // S3 PUT requires a known content-length; spool to a temp file first so memory stays
        // bounded for large payloads, then stream the file to S3 via RequestBody.fromFile.
        Path tempFile = Files.createTempFile("s3-upload-", ".bin");
        long size;
        try {
            try (InputStream src = in) {
                Files.copy(src, tempFile, StandardCopyOption.REPLACE_EXISTING);
            }
            size = Files.size(tempFile);
            PutObjectRequest.Builder builder =
                    PutObjectRequest.builder().bucket(bucket).key(resolveKey(fileId));
            if (owner != null && !owner.isBlank()) {
                builder.metadata(Map.of(OWNER_METADATA_KEY, owner));
            }
            try {
                s3Client.putObject(builder.build(), RequestBody.fromFile(tempFile));
            } catch (SdkException e) {
                throw new IOException("Failed to upload object to S3", e);
            }
        } finally {
            try {
                Files.deleteIfExists(tempFile);
            } catch (IOException cleanupError) {
                log.warn("Failed to delete S3 upload temp file: {}", tempFile, cleanupError);
            }
        }
        return new Stored(fileId, size);
    }

    @Override
    public InputStream retrieve(String fileId) throws IOException {
        validateFileId(fileId);
        GetObjectRequest request =
                GetObjectRequest.builder().bucket(bucket).key(resolveKey(fileId)).build();
        try {
            ResponseInputStream<GetObjectResponse> stream = s3Client.getObject(request);
            return new BufferedInputStream(stream);
        } catch (NoSuchKeyException e) {
            throw new IOException("File not found with ID: " + fileId, e);
        } catch (SdkException e) {
            throw new IOException("Failed to load object from S3", e);
        }
    }

    @Override
    public byte[] retrieveBytes(String fileId) throws IOException {
        validateFileId(fileId);
        GetObjectRequest request =
                GetObjectRequest.builder().bucket(bucket).key(resolveKey(fileId)).build();
        try (ResponseInputStream<GetObjectResponse> stream = s3Client.getObject(request)) {
            return stream.readAllBytes();
        } catch (NoSuchKeyException e) {
            throw new IOException("File not found with ID: " + fileId, e);
        } catch (SdkException e) {
            throw new IOException("Failed to load object from S3", e);
        }
    }

    @Override
    public long size(String fileId) throws IOException {
        validateFileId(fileId);
        HeadObjectRequest request =
                HeadObjectRequest.builder().bucket(bucket).key(resolveKey(fileId)).build();
        try {
            HeadObjectResponse response = s3Client.headObject(request);
            return Optional.ofNullable(response.contentLength()).orElse(0L);
        } catch (NoSuchKeyException e) {
            throw new IOException("File not found with ID: " + fileId, e);
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                throw new IOException("File not found with ID: " + fileId, e);
            }
            throw new IOException("Failed to head object in S3", e);
        } catch (SdkException e) {
            throw new IOException("Failed to head object in S3", e);
        }
    }

    @Override
    public boolean delete(String fileId) {
        try {
            validateFileId(fileId);
        } catch (IllegalArgumentException e) {
            log.warn("Refusing to delete invalid file id: {}", fileId);
            return false;
        }
        try {
            s3Client.deleteObject(
                    DeleteObjectRequest.builder().bucket(bucket).key(resolveKey(fileId)).build());
            return true;
        } catch (SdkException e) {
            log.error("Error deleting file with ID: {}", fileId, e);
            return false;
        }
    }

    @Override
    public boolean exists(String fileId) {
        try {
            validateFileId(fileId);
        } catch (IllegalArgumentException e) {
            return false;
        }
        HeadObjectRequest request =
                HeadObjectRequest.builder().bucket(bucket).key(resolveKey(fileId)).build();
        try {
            s3Client.headObject(request);
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return false;
            }
            log.warn("Error checking existence for file ID: {}", fileId, e);
            return false;
        } catch (SdkException e) {
            log.warn("Error checking existence for file ID: {}", fileId, e);
            return false;
        }
    }

    @Override
    public String getOwner(String fileId) throws IOException {
        try {
            validateFileId(fileId);
        } catch (IllegalArgumentException e) {
            return null;
        }
        HeadObjectRequest request =
                HeadObjectRequest.builder().bucket(bucket).key(resolveKey(fileId)).build();
        try {
            HeadObjectResponse response = s3Client.headObject(request);
            Map<String, String> metadata =
                    Optional.ofNullable(response.metadata()).orElse(Collections.emptyMap());
            String owner = metadata.get(OWNER_METADATA_KEY);
            if (owner != null && !owner.isBlank()) {
                return owner;
            }
            return null;
        } catch (NoSuchKeyException e) {
            return null;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return null;
            }
            throw new IOException("Failed to read owner metadata from S3", e);
        } catch (SdkException e) {
            throw new IOException("Failed to read owner metadata from S3", e);
        }
    }

    @Override
    public void close() {
        if (!ownsClient) {
            return;
        }
        try {
            s3Client.close();
        } catch (Exception e) {
            log.warn("Error closing S3 client", e);
        }
    }

    String resolveKey(String fileId) {
        return keyPrefix + fileId;
    }

    private static void validateFileId(String fileId) {
        if (fileId == null || fileId.isBlank()) {
            throw new IllegalArgumentException("File ID must not be blank");
        }
        if (fileId.contains(".") || fileId.contains("/") || fileId.contains("\\")) {
            throw new IllegalArgumentException("Invalid file ID");
        }
    }

    private static String normalizePrefix(String prefix) {
        if (prefix == null || prefix.isBlank()) {
            return "";
        }
        String trimmed = prefix.trim();
        if (trimmed.startsWith("/")) {
            trimmed = trimmed.substring(1);
        }
        if (!trimmed.isEmpty() && !trimmed.endsWith("/")) {
            trimmed = trimmed + "/";
        }
        return trimmed;
    }
}
