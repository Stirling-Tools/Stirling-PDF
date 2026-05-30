package stirling.software.saas.ai.model;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

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

    private String templateTex;

    private String previewTex;

    @Lob private String promptInitial;

    @Lob private String promptLatest;

    @Lob private String outlineText;

    private String outlineFilename;

    private boolean outlineApproved;

    @Lob private String outlineConstraints;

    @Lob private String draftSections;

    @Lob private String polishedLatex;

    // Default JPA String column is varchar(255); signed Supabase / S3 URLs commonly run
    // 500-1500 chars due to embedded query params (signature, expiry, response headers).
    @Column(length = 2048)
    private String pdfUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AiCreateSessionStatus status;

    @CreationTimestamp private Instant createdAt;

    @UpdateTimestamp private Instant updatedAt;
}
