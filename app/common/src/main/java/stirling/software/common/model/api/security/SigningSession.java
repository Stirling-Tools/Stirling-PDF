package stirling.software.common.model.api.security;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import lombok.Data;

@Data
public class SigningSession {
    private String sessionId = UUID.randomUUID().toString();
    private String documentName;
    private byte[] originalPdf;
    private byte[] signedPdf;
    private String ownerEmail;
    private String message;
    private String dueDate;
    private String createdAt = Instant.now().toString();
    private String updatedAt = Instant.now().toString();
    private List<SigningParticipant> participants = new ArrayList<>();

    public void touch() {
        updatedAt = Instant.now().toString();
    }
}
