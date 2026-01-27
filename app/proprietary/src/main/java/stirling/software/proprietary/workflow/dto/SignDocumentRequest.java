package stirling.software.proprietary.workflow.dto;

import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request object for signing a document. Combines certificate submission data with optional wet
 * signature (visual signature) metadata.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SignDocumentRequest {

    // Certificate-related fields
    @NotNull(message = "Certificate type is required")
    @Pattern(
            regexp = "SERVER|USER_CERT|UPLOAD|PEM|PKCS12|PFX|JKS",
            message = "Invalid certificate type")
    private String certType;

    private MultipartFile p12File;
    private String password;
    private MultipartFile privateKeyFile;
    private MultipartFile certFile;

    // Wet signature metadata fields (optional)
    private String wetSignatureType; // "canvas" | "image" | "text"
    private String wetSignatureData; // Base64 image data or text
    private Integer wetSignaturePage; // Zero-indexed page number
    private Double wetSignatureX; // X coordinate in PDF points
    private Double wetSignatureY; // Y coordinate in PDF points (top-left origin)
    private Double wetSignatureWidth; // Width in PDF points
    private Double wetSignatureHeight; // Height in PDF points

    /**
     * Checks if this request includes wet signature metadata.
     *
     * @return true if wet signature data is present
     */
    public boolean hasWetSignature() {
        return wetSignatureType != null
                && wetSignatureData != null
                && wetSignaturePage != null
                && wetSignatureX != null
                && wetSignatureY != null
                && wetSignatureWidth != null
                && wetSignatureHeight != null;
    }

    /**
     * Extracts wet signature metadata into a dedicated DTO.
     *
     * @return WetSignatureMetadata object if wet signature is present, null otherwise
     */
    public WetSignatureMetadata extractWetSignatureMetadata() {
        if (!hasWetSignature()) {
            return null;
        }

        WetSignatureMetadata metadata = new WetSignatureMetadata();
        metadata.setType(wetSignatureType);
        metadata.setData(wetSignatureData);
        metadata.setPage(wetSignaturePage);
        metadata.setX(wetSignatureX);
        metadata.setY(wetSignatureY);
        metadata.setWidth(wetSignatureWidth);
        metadata.setHeight(wetSignatureHeight);

        // Validate the metadata
        metadata.validate();

        return metadata;
    }
}
