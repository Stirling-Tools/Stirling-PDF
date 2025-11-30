package stirling.software.SPDF.model.api.security;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import lombok.Data;

@Data
public class SigningSession {
    private final String sessionId = UUID.randomUUID().toString();
    private String documentName;
    private byte[] originalPdf;
    private byte[] signedPdf;
    private String ownerEmail;
    private String message;
    private String dueDate;
    private final Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
    private final List<SigningParticipant> participants = new ArrayList<>();

    public void touch() {
        updatedAt = Instant.now();
    }
}
