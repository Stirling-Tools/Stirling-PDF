package stirling.software.proprietary.workflow.dto;

import java.util.ArrayList;
import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request object for signing a document. Combines certificate submission data with optional wet
 * signature (visual signature) metadata. Supports multiple wet signatures.
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

    // Signature metadata (participant can override owner defaults)
    private String reason; // Participant's reason for signing
    private String location; // Participant's location when signing

    // Wet signatures as JSON string (from frontend FormData)
    private String wetSignaturesData;

    // Parsed wet signatures (populated by controller/service)
    private List<WetSignatureMetadata> wetSignatures;

    /**
     * Checks if this request includes wet signature metadata.
     *
     * @return true if wet signatures list is not empty
     */
    public boolean hasWetSignatures() {
        return wetSignatures != null && !wetSignatures.isEmpty();
    }

    /**
     * Extracts and validates wet signature metadata.
     *
     * @return List of validated WetSignatureMetadata objects
     */
    public List<WetSignatureMetadata> extractWetSignatureMetadata() {
        List<WetSignatureMetadata> signatures = new ArrayList<>();

        if (hasWetSignatures()) {
            for (WetSignatureMetadata signature : wetSignatures) {
                signature.validate();
                signatures.add(signature);
            }
        }

        return signatures;
    }
}
