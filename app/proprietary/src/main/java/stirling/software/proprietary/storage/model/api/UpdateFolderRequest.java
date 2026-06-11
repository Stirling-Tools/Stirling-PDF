package stirling.software.proprietary.storage.model.api;

import java.util.UUID;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * PATCH-style update - every field is optional. Send only the fields you want to change.
 *
 * <p>The {@code reparent} flag distinguishes "do not change parent" from "move to root" since
 * {@code parentFolderId == null} alone is ambiguous in a sparse body. We use a boxed {@link
 * Boolean} so a missing field deserialises to {@code null} (= "do not reparent") rather than to
 * primitive {@code false}, removing a class of "I PATCHed only the name but the server reset my
 * parent" footguns.
 *
 * <p>When the trimmed name is empty (e.g. {@code " "}) the service rejects the request with HTTP
 * 400 - silent drops are too easy to mistake for a successful rename.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateFolderRequest {

    /** When provided, must contain at least one non-whitespace character. */
    @Size(max = 255)
    @Pattern(regexp = "\\S.*", message = "name must not be blank")
    private String name;

    private Boolean reparent;
    private UUID parentFolderId;

    @Size(max = 32)
    @Pattern(
            regexp = "^(|#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?)$",
            message = "color must be empty or a #RRGGBB / #RRGGBBAA hex value")
    private String color;

    @Size(max = 64)
    @Pattern(
            regexp = "^([a-z0-9_-]+)?$",
            message = "icon must be a lowercase id (a-z, 0-9, '-' or '_') or empty")
    private String icon;

    /**
     * Convenience accessor - treats null as "do not reparent". Named differently from the
     * Lombok-generated {@code getReparent()} so callers don't accidentally use one for the other
     * (the getter is nullable {@code Boolean}; this method collapses to primitive).
     */
    @com.fasterxml.jackson.annotation.JsonIgnore
    public boolean shouldReparent() {
        return Boolean.TRUE.equals(reparent);
    }
}
