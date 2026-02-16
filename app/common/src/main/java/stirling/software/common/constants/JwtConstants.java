package stirling.software.common.constants;

/**
 * Centralized constants for JWT token management.
 *
 * <p>These defaults are used when configuration values are not explicitly set.
 */
public final class JwtConstants {

    private JwtConstants() {
        throw new UnsupportedOperationException("Utility class");
    }

    /** Default JWT access token lifetime in minutes (24 hours). */
    public static final int DEFAULT_TOKEN_EXPIRY_MINUTES = 1440;

    /**
     * Default refresh grace period in minutes.
     *
     * <p>Allows refresh of expired tokens within this window after expiration.
     */
    public static final int DEFAULT_REFRESH_GRACE_MINUTES = 15;

    /**
     * Default allowed clock skew in seconds.
     *
     * <p>Tolerates small time drift between client and server clocks during validation.
     */
    public static final int DEFAULT_CLOCK_SKEW_SECONDS = 60;

    /** Default key retention period in days. */
    public static final int DEFAULT_KEY_RETENTION_DAYS = 30;

    /** Milliseconds per minute. */
    public static final long MILLIS_PER_MINUTE = 60_000L;

    /** Seconds per minute. */
    public static final long SECONDS_PER_MINUTE = 60L;

    /** JWT issuer identifier. */
    public static final String ISSUER = "https://stirling.com";

    /**
     * Maximum refresh attempts allowed within the grace period window.
     *
     * <p>Prevents abuse of expired tokens by limiting refresh attempts.
     */
    public static final int MAX_REFRESH_ATTEMPTS_IN_GRACE = 3;
}
