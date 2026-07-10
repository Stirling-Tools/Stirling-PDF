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
        /** "personal" | "team-lead" | "team-members". */
        String scope,
        /** Team name for a team-scoped key, else null. */
        String teamName,
        String created,
        String lastUsed,
        /** "active" | "revoked". */
        String status,
        long usageToday,
        long usageMonth,
        /** Lifetime request count for the key. */
        long usageTotal,
        /** Whether the current caller may revoke this key. */
        boolean canManage) {}
