package stirling.software.common.model.api.security;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SigningSessionSummaryDTO {
    private String sessionId;
    private String documentName;
    private LocalDateTime createdAt;
    private int participantCount;
    private int signedCount;
    private boolean finalized;
}
