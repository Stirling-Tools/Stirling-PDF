package stirling.software.proprietary.mcp.oauth;

import java.net.InetAddress;
import java.time.Duration;
import java.util.HexFormat;
import java.util.concurrent.TimeUnit;

import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;

import stirling.software.common.model.ApplicationProperties;

/** Per-IP cap on anonymous dynamic client registrations, a brake against row flooding. */
@Component
@Conditional(McpBuiltinModeCondition.class)
public class McpOAuthRegistrationLimiter {

    private static final int GLOBAL_FACTOR = 100;

    private final ApplicationProperties applicationProperties;
    private final Cache<String, Bucket> buckets =
            Caffeine.newBuilder().maximumSize(10_000).expireAfterAccess(2, TimeUnit.HOURS).build();

    private Bucket globalBucket;
    private int globalCapacity;

    public McpOAuthRegistrationLimiter(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    public boolean tryConsume(String remoteAddress) {
        int perHour =
                applicationProperties
                        .getMcp()
                        .getAuth()
                        .getBuiltin()
                        .getRegistrationsPerHourPerIp();
        if (perHour <= 0) {
            return true;
        }
        String key = sourceKey(remoteAddress);
        // Forwarded addresses can be spoofed, so a server-wide cap backs the per-IP one.
        Bucket global = global(perHour * GLOBAL_FACTOR);
        Bucket bucket = buckets.get(key, k -> hourly(perHour));
        return bucket.tryConsume(1) && global.tryConsume(1);
    }

    /**
     * The address an IPv4 caller registers from, or the /64 prefix of an IPv6 one: a single
     * subscriber is usually handed a whole /64, so counting each address would let one host spread
     * a flood across 2^64 buckets.
     */
    static String sourceKey(String remoteAddress) {
        if (remoteAddress == null || remoteAddress.isBlank()) {
            return "unknown";
        }
        if (remoteAddress.indexOf(':') < 0) {
            return remoteAddress;
        }
        try {
            byte[] bytes = InetAddress.ofLiteral(remoteAddress).getAddress();
            if (bytes.length != 16) {
                return InetAddress.ofLiteral(remoteAddress).getHostAddress();
            }
            return HexFormat.of().formatHex(bytes, 0, 8) + "::/64";
        } catch (IllegalArgumentException e) {
            return remoteAddress;
        }
    }

    // Kept outside the per-IP cache so a flood of addresses cannot evict it.
    private synchronized Bucket global(int perHour) {
        if (globalBucket == null || globalCapacity != perHour) {
            globalBucket = hourly(perHour);
            globalCapacity = perHour;
        }
        return globalBucket;
    }

    private static Bucket hourly(int perHour) {
        return Bucket.builder()
                .addLimit(
                        Bandwidth.builder()
                                .capacity(perHour)
                                .refillIntervally(perHour, Duration.ofHours(1))
                                .build())
                .build();
    }
}
