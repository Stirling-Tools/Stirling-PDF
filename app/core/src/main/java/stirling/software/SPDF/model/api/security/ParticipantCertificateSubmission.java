package stirling.software.SPDF.model.api.security;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ParticipantCertificateSubmission {
    private String certType;
    private String password;
    private byte[] privateKey;
    private byte[] certificate;
    private byte[] p12Keystore;
    private byte[] jksKeystore;
    private Boolean showSignature;
    private Integer pageNumber;
    private String name;
    private String reason;
    private String location;
    private Boolean showLogo;
}
