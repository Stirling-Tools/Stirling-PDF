package stirling.software.common.model.api.security;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** DTO for sign request detail (participant view) */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SignRequestDetailDTO {
    private String sessionId;
    private String documentName;
    private String ownerUsername;
    private String message;
    private String dueDate;
    private String createdAt;
    private ParticipantStatus myStatus;
    // Signature appearance settings (read-only, configured by owner)
    private Boolean showSignature;
    private Integer pageNumber;
    private String reason;
    private String location;
    private Boolean showLogo;
}
