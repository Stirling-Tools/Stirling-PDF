package stirling.software.proprietary.workflow.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Certificate submission details extracted from a participant's stored metadata. Contains the
 * certificate type, optional keystore bytes (decoded from base64), password, and per-participant
 * signature appearance overrides.
 */
@Getter
@Setter
@NoArgsConstructor
public class CertificateSubmission {

    /** Certificate type: P12, JKS, SERVER, or USER_CERT */
    private String certType;

    /**
     * Keystore password. Stored encrypted at rest; decrypted by MetadataEncryptionService before
     * use. Cleared from the database after finalization.
     */
    private String password;

    /** PKCS12 keystore bytes, decoded from the base64 stored in participant metadata. */
    private byte[] p12Keystore;

    /** JKS keystore bytes, decoded from the base64 stored in participant metadata. */
    private byte[] jksKeystore;

    /** Whether to show a visible digital signature block on the page. */
    private Boolean showSignature;

    /** 1-indexed page number for the digital signature block (session-level default). */
    private Integer pageNumber;

    /** Participant's location when signing (included in digital signature metadata). */
    private String location;

    /** Participant's reason for signing (included in digital signature metadata). */
    private String reason;

    /** Whether to show the Stirling logo in the digital signature block. */
    private Boolean showLogo;
}
