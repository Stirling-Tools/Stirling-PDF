package stirling.software.proprietary.model.api.apikey;

import lombok.Builder;

/**
 * One API key as shown in the portal Infrastructure → API Keys tab. Never carries the secret; that
 * is returned once from {@link CreatedApiKeyDto} at creation time.
 */
@Builder
public record PortalApiKeyDto(
        String id,
        String name,
        String prefix,
        String created,
        String lastUsed,
        /** "active" | "revoked". */
        String status,
        long usageToday,
        long usageMonth,
        /** Lifetime request count for the key. */
        long usageTotal) {}
