package stirling.software.saas.procurement.model;

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
 * An immutable record of a signed enterprise agreement. Each signature pins the exact legal
 * document it was signed against — {@code documentId} + {@code documentVersion} + a SHA-256 {@code
 * contentHash} of the rendered markdown — plus the Order-Form variable snapshot and the typed
 * signatory details, so the agreement stays reproducible even after the templates version up. The
 * rendered PDF is stored when the conversion runtime is available.
 */
@Entity
@Table(name = "procurement_agreement_signature")
@NoArgsConstructor
@Getter
@Setter
public class ProcurementAgreementSignature implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "signature_id")
    private Long signatureId;

    @Column(name = "deal_id", nullable = false)
    private Long dealId;

    @Column(name = "quote_id", nullable = false)
    private Long quoteId;

    // Which legal document, and which version of it, was signed.
    @Column(name = "document_id", nullable = false, length = 64)
    private String documentId;

    @Column(name = "document_version", nullable = false, length = 32)
    private String documentVersion;

    @Column(name = "document_label", length = 64)
    private String documentLabel;

    // SHA-256 (hex) of the exact rendered agreement markdown the buyer accepted.
    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    // The Order-Form variable values as rendered, so the document can be reproduced.
    @Column(name = "variables_json", columnDefinition = "text")
    private String variablesJson;

    @Column(name = "customer_legal_name", length = 255)
    private String customerLegalName;

    @Column(name = "signatory_name", nullable = false, length = 255)
    private String signatoryName;

    @Column(name = "signatory_title", length = 255)
    private String signatoryTitle;

    @Column(name = "authority_confirmed", nullable = false)
    private boolean authorityConfirmed;

    @Column(name = "signer_ip", length = 64)
    private String signerIp;

    // The rendered PDF artifact; null when the conversion runtime was unavailable at signing.
    @Column(name = "pdf")
    private byte[] pdf;

    @CreationTimestamp
    @Column(name = "signed_at", nullable = false, updatable = false)
    private LocalDateTime signedAt;
}
