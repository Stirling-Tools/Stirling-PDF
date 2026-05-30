package stirling.software.proprietary.workflow.dto;

import org.springframework.web.multipart.MultipartFile;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request DTO for submitting a signature (wet signature or certificate). Used when a participant
 * completes their signing action. Supports multiple wet signatures.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SignatureSubmissionRequest {

    // Certificate submission fields
    private String certType; // P12, JKS, SERVER, USER_CERT
    private String password;
    private MultipartFile p12File;
    private MultipartFile jksFile;
    private Boolean showSignature;
    private Integer pageNumber;
    private String location;
    private String reason;
    private Boolean showLogo;

    // Wet signatures (JSON array string with coordinates and image data)
    private String wetSignaturesData;

    // Participant identification
    private String participantToken;
}
