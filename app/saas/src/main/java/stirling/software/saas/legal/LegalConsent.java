package stirling.software.saas.legal;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * An append-only record that a user accepted a versioned legal document at a particular moment in
 * the product. Distinct from a signed agreement (which is a negotiated, signature-bearing artifact,
 * see {@code ProcurementAgreementSignature}); this captures the lighter clickwrap consents — the
 * EULA accepted at trial start and at quote generation — with the exact document version, so what
 * was agreed is auditable even after the document versions up.
 */
@Entity
@Table(name = "legal_consent")
@NoArgsConstructor
@Getter
@Setter
public class LegalConsent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "consent_id")
    private Long consentId;

    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "document_id", nullable = false, length = 64)
    private String documentId;

    @Column(name = "document_version", nullable = false, length = 32)
    private String documentVersion;

    // Where in the product the consent was given: "trial", "quote", etc.
    @Column(name = "context", nullable = false, length = 32)
    private String context;

    @Column(name = "signer_ip", length = 64)
    private String signerIp;

    @CreationTimestamp
    @Column(name = "consented_at", nullable = false, updatable = false)
    private LocalDateTime consentedAt;
}
