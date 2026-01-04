package stirling.software.proprietary.model.ai;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import lombok.Data;

@Entity
@Table(name = "ai_create_sessions")
@Data
public class AiCreateSession {
    @Id private String sessionId;

    @Column(nullable = false)
    private String userId;

    private String docType;

    private String templateId;

    @Lob private String promptInitial;

    @Lob private String promptLatest;

    @Lob private String outlineText;

    private boolean outlineApproved;

    @Lob private String outlineConstraints;

    @Lob private String draftSections;

    @Lob private String polishedLatex;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AiCreateSessionStatus status;

    @CreationTimestamp private Instant createdAt;

    @UpdateTimestamp private Instant updatedAt;
}
