package stirling.software.proprietary.policy.s3;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Map;

/**
 * Connection settings shared by the S3 input source and output sink, parsed from a spec's options
 * map. Credentials are required: there is deliberately no fallback to the server's own AWS
 * credential chain, so user-supplied config can never borrow the host's identity. {@code snapshot}
 * is input-only and ignored by the sink.
 */
public record S3Config(
        String bucket,
        String region,
        String prefix,
        String endpoint,
        String accessKeyId,
        String secretAccessKey,
        boolean snapshot) {

    private static final String BUCKET_OPTION = "bucket";
    private static final String REGION_OPTION = "region";
    private static final String PREFIX_OPTION = "prefix";
    private static final String ENDPOINT_OPTION = "endpoint";
    private static final String ACCESS_KEY_ID_OPTION = "accessKeyId";
    private static final String SECRET_ACCESS_KEY_OPTION = "secretAccessKey";
    private static final String MODE_OPTION = "mode";
    private static final String MODE_CONSUME = "consume";
    private static final String MODE_SNAPSHOT = "snapshot";

    public static S3Config from(Map<String, Object> options) {
        String bucket = trimmed(options.get(BUCKET_OPTION));
        if (bucket == null) {
            throw new IllegalArgumentException("s3 config requires a 'bucket' option");
        }
        String region = trimmed(options.get(REGION_OPTION));
        String prefix = trimmed(options.get(PREFIX_OPTION));
        if (prefix != null && prefix.startsWith("/")) {
            prefix = prefix.substring(1);
        }
        String endpoint = validEndpoint(trimmed(options.get(ENDPOINT_OPTION)));
        String accessKeyId = trimmed(options.get(ACCESS_KEY_ID_OPTION));
        String secretAccessKey = trimmed(options.get(SECRET_ACCESS_KEY_OPTION));
        if (accessKeyId == null || secretAccessKey == null) {
            throw new IllegalArgumentException(
                    "s3 config requires an 'accessKeyId' and 'secretAccessKey'");
        }
        String mode = trimmed(options.get(MODE_OPTION));
        if (mode != null && !MODE_CONSUME.equals(mode) && !MODE_SNAPSHOT.equals(mode)) {
            throw new IllegalArgumentException("s3 config 'mode' must be 'consume' or 'snapshot'");
        }
        return new S3Config(
                bucket,
                region == null ? "us-east-1" : region,
                prefix == null ? "" : prefix,
                endpoint,
                accessKeyId,
                secretAccessKey,
                MODE_SNAPSHOT.equals(mode));
    }

    private static String validEndpoint(String endpoint) {
        if (endpoint == null) {
            return null;
        }
        URI uri;
        try {
            uri = new URI(endpoint);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("s3 config 'endpoint' is not a valid URL", e);
        }
        if (!"http".equals(uri.getScheme()) && !"https".equals(uri.getScheme())) {
            throw new IllegalArgumentException(
                    "s3 config 'endpoint' must be an http(s) URL, e.g. https://s3.example.com");
        }
        return endpoint;
    }

    private static String trimmed(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    /** Never prints the credentials, so an accidental log line cannot leak them. */
    @Override
    public String toString() {
        return "S3Config[bucket="
                + bucket
                + ", region="
                + region
                + ", prefix="
                + prefix
                + ", endpoint="
                + endpoint
                + ", snapshot="
                + snapshot
                + "]";
    }
}
