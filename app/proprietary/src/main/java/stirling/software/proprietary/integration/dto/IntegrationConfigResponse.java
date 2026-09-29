package stirling.software.proprietary.integration.dto;

import java.time.LocalDateTime;
import java.util.Map;

import stirling.software.proprietary.access.model.DefaultAccessPolicy;
import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.integration.model.IntegrationType;

/** Integration config view. Sensitive config values are masked. */
public record IntegrationConfigResponse(
        Long id,
        IntegrationType integrationType,
        String name,
        OwnerScope scope,
        Long ownerUserId,
        Long ownerTeamId,
        boolean enabled,
        boolean locked,
        DefaultAccessPolicy defaultAccess,
        Map<String, Object> config,
        boolean canManage,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {}
