package stirling.software.SPDF.model.api.security;

import lombok.Data;

@Data
public class SignatureValidationResult {
    private boolean valid;
    private String signerName;
    private String signatureDate;
    private String reason;
    private String location;
    private String errorMessage;
    private boolean chainValid;
    private boolean trustValid;
    private boolean notExpired;
    private boolean notRevoked;
}
