package stirling.software.proprietary.security.model.dto;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Data Transfer Object for admin user listings. Contains only the fields needed by the admin UI for
 * displaying user information. Excludes sensitive fields like password and apiKey.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "Admin user summary for listing in admin UI - excludes sensitive fields")
public class AdminUserSummary {

    @Schema(description = "User ID")
    private Long id;

    @Schema(description = "Username/login identifier")
    private String username;

    @Schema(description = "User email address")
    private String email;

    @Schema(description = "Role name (translation key like 'adminUserSettings.admin')")
    private String roleName;

    @Schema(description = "Role identifier (e.g., 'ROLE_ADMIN')")
    private String rolesAsString;

    @Schema(description = "Whether user account is enabled")
    private boolean enabled;

    @Schema(description = "Whether this is the user's first login")
    private Boolean isFirstLogin;

    @Schema(description = "Authentication type (WEB, OAUTH2, SAML2)")
    private String authenticationType;

    @Schema(description = "Team membership (if any)")
    private TeamSummary team;

    @Schema(description = "User account creation timestamp")
    private LocalDateTime createdAt;

    @Schema(description = "User account last update timestamp")
    private LocalDateTime updatedAt;

    /** Minimal Team DTO for admin user listings */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "Team summary (id and name only)")
    public static class TeamSummary {
        @Schema(description = "Team ID")
        private Long id;

        @Schema(description = "Team name")
        private String name;
    }
}
