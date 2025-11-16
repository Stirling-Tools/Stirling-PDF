package stirling.software.proprietary.security.model.api.user;

import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

/** Response payload containing the user's stored settings map. */
public record UserSettingsResponse(
        @Schema(description = "Key/value map of the user's saved settings")
                Map<String, String> settings) {}
