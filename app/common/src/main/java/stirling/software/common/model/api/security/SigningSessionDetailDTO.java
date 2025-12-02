package stirling.software.common.model.api.security;

import java.time.LocalDateTime;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SigningSessionDetailDTO {
    private String sessionId;
    private String documentName;
    private String ownerEmail;
    private String message;
    private String dueDate;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private boolean finalized;
    private List<ParticipantDTO> participants;
}
