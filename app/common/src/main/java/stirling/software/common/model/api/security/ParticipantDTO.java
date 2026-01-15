package stirling.software.common.model.api.security;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ParticipantDTO {
    private Long userId;
    private String username;
    private String displayName;
    private ParticipantStatus status;
    private LocalDateTime lastUpdated;

    // Signature appearance settings (owner-controlled)
    private Boolean showSignature;
    private Integer pageNumber;
    private String reason;
    private String location;
    private Boolean showLogo;
}
