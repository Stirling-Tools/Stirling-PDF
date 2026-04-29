package stirling.software.proprietary.workflow.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Data Transfer Object for wet signature (visual signature) metadata. Contains information about a
 * signature annotation placed by a participant on the PDF. This data is used to overlay the
 * signature on the PDF during finalization.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class WetSignatureMetadata {

    /** Maximum number of wet signatures allowed per participant submission. */
    public static final int MAX_SIGNATURES_PER_PARTICIPANT = 50;

    /** Type of wet signature: "canvas" (drawn), "image" (uploaded), or "text" (typed) */
    @NotNull(message = "Wet signature type is required")
    @Pattern(
            regexp = "canvas|image|text",
            message = "Wet signature type must be canvas, image, or text")
    private String type;

    /**
     * Base64-encoded image data or text content for the signature. For canvas/image types:
     * data:image/png;base64,... format For text type: plain text string
     */
    @NotNull(message = "Wet signature data is required")
    @Size(max = 5_000_000, message = "Wet signature data exceeds maximum size of 5MB")
    private String data;

    /** Zero-indexed page number where the signature is placed */
    @NotNull(message = "Page number is required")
    @PositiveOrZero(message = "Page number must be zero or positive")
    private Integer page;

    /** X position as a fraction (0–1) of page width, measured from left edge */
    @NotNull(message = "X coordinate is required")
    @PositiveOrZero(message = "X coordinate must be zero or positive")
    @DecimalMax(value = "1.0", message = "X coordinate must not exceed 1.0 (page width)")
    private Double x;

    /**
     * Y position as a fraction (0–1) of page height, measured from top edge. Note: This is UI
     * coordinate system (top-left origin). Will be converted to PDF coordinate system (bottom-left
     * origin) during overlay.
     */
    @NotNull(message = "Y coordinate is required")
    @PositiveOrZero(message = "Y coordinate must be zero or positive")
    @DecimalMax(value = "1.0", message = "Y coordinate must not exceed 1.0 (page height)")
    private Double y;

    /** Width of the signature rectangle as a fraction (0–1) of page width */
    @NotNull(message = "Width is required")
    @Positive(message = "Width must be positive")
    @DecimalMax(value = "1.0", message = "Width must not exceed 1.0 (page width)")
    private Double width;

    /** Height of the signature rectangle as a fraction (0–1) of page height */
    @NotNull(message = "Height is required")
    @Positive(message = "Height must be positive")
    @DecimalMax(value = "1.0", message = "Height must not exceed 1.0 (page height)")
    private Double height;

    /**
     * Validates that the wet signature data is properly formatted based on type. For image types,
     * ensures data starts with data:image prefix.
     *
     * @return true if validation passes
     * @throws IllegalArgumentException if validation fails
     */
    public boolean validate() {
        if (type.equals("canvas") || type.equals("image")) {
            if (!data.startsWith("data:image/")) {
                throw new IllegalArgumentException(
                        "Image wet signature data must start with data:image/ prefix");
            }
        }
        if (x != null && width != null && x + width > 1.0) {
            throw new IllegalArgumentException(
                    "Signature extends beyond the right edge of the page (x + width > 1.0)");
        }
        if (y != null && height != null && y + height > 1.0) {
            throw new IllegalArgumentException(
                    "Signature extends beyond the bottom edge of the page (y + height > 1.0)");
        }
        return true;
    }

    /**
     * Extracts just the base64 data portion from a data URL. Removes the "data:image/png;base64,"
     * prefix.
     *
     * @return pure base64 string without data URL prefix
     */
    public String extractBase64Data() {
        if (data != null && data.contains(",")) {
            return data.substring(data.indexOf(",") + 1);
        }
        return data;
    }
}
