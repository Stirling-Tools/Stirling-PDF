package stirling.software.SPDF.model.api.security;

import java.util.List;

import lombok.Data;

@Data
public class SignatureValidationResult {
    // Cryptographic signature validation
    private boolean valid;

    // Certificate chain validation
    private boolean chainValid;
    private boolean trustValid;
    private String chainValidationError;
    private int certPathLength;

    // Time validation
    private boolean notExpired;

    // Revocation validation
    private boolean revocationChecked; // true if PKIX revocation was enabled
    private String revocationStatus; // "not-checked" | "good" | "revoked" | "soft-fail" | "unknown"

    private String validationTimeSource; // "current", "signing-time", or "timestamp"

    // Signature metadata
    private String signerName;
    private String signatureDate;
    private String reason;
    private String location;
    private String errorMessage;

    // Certificate details
    private String issuerDN; // Certificate issuer's Distinguished Name
    private String subjectDN; // Certificate subject's Distinguished Name
    private String serialNumber; // Certificate serial number
    private String validFrom; // Certificate validity start date
    private String validUntil; // Certificate validity end date
    private String signatureAlgorithm; // Algorithm used for signing
    private int keySize; // Key size in bits
    private String version; // Certificate version
    private List<String> keyUsages; // List of key usage purposes
    private boolean isSelfSigned; // Whether the certificate is self-signed
}
