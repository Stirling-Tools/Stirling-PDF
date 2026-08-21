package stirling.software.proprietary.model.api.apikey;

import java.util.List;

import lombok.Builder;

/** Payload for the API Keys tab: the personal keys the caller owns. */
@Builder
public record PortalApiKeysResponse(List<PortalApiKeyDto> keys) {}
