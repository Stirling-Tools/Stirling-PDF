package stirling.software.proprietary.policy.s3;

import java.time.Instant;

/**
 * The S3 backend's identity and version scheme, shared by {@code S3InputSource} and {@code
 * S3OutputSink} so outputs are recorded under exactly the identity and gate the next listing
 * derives. Identity is {@code s3://bucket/key}; the gate is the ETag every listing returns for free
 * (multipart ETags are not content hashes, so any ETag change simply reads as a new version).
 */
public final class S3Identities {

    private S3Identities() {}

    public static String identity(String bucket, String key) {
        return "s3://" + bucket + "/" + key;
    }

    /** ETag stripped of its quotes; falls back to size:lastModified for stores that omit it. */
    public static String gate(String eTag, Long size, Instant lastModified) {
        if (eTag != null && !eTag.isBlank()) {
            return eTag.replace("\"", "");
        }
        return (size == null ? -1 : size)
                + ":"
                + (lastModified == null ? 0 : lastModified.toEpochMilli());
    }
}
