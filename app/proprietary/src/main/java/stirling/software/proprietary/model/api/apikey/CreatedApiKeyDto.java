package stirling.software.proprietary.model.api.apikey;

import lombok.Builder;

/** Returned once when a key is created: the row plus the plaintext secret, never persisted. */
@Builder
public record CreatedApiKeyDto(PortalApiKeyDto key, String secret) {}
