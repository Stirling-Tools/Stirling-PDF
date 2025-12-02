package stirling.software.common.model.api.security;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ParticipantDTO {
    private String email;
    private String name;
    private ParticipantStatus status;
    private String shareToken;
    private LocalDateTime lastUpdated;
    private String participantUrl;
}
