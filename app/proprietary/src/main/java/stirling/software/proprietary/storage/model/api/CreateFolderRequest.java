package stirling.software.proprietary.storage.model.api;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CreateFolderRequest {

    /**
     * Client-generated UUID - lets the caller round-trip the same id it stored locally. Optional;
     * the server generates one when missing.
     */
    private UUID id;

    @NotBlank
    @Size(max = 255)
    private String name;

    private UUID parentFolderId;

    /** Hex colour string (#rrggbb or #rrggbbaa) - matches the frontend palette format. */
    @Size(max = 32)
    @Pattern(
            regexp = "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$",
            message = "color must be a #RRGGBB or #RRGGBBAA hex value")
    private String color;

    /** Icon identifier - lowercase alphanumerics, hyphens, underscores only. */
    @Size(max = 64)
    @Pattern(
            regexp = "^[a-z0-9_-]+$",
            message = "icon must be a lowercase id (a-z, 0-9, '-' or '_')")
    private String icon;
}
