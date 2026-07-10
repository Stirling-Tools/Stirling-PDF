package stirling.software.proprietary.model.api.apikey;

import java.util.List;

import lombok.Builder;

/**
 * Payload for the API Keys tab: the keys the caller may see, plus whether they may create
 * team-scoped keys (a team leader / admin) and the team those keys would belong to.
 */
@Builder
public record PortalApiKeysResponse(
        List<PortalApiKeyDto> keys, boolean canCreateTeamKeys, String teamName) {}
