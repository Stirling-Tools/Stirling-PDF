package stirling.software.proprietary.security.model.api.user;

import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

/** Request payload for updating a user's stored settings map. */
public record UserSettingsRequest(
        @Schema(description = "Key/value map of settings to persist for the user")
                Map<String, String> settings) {}
