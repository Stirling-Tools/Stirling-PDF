-- Signed enterprise agreements. Each row is an immutable record of one signing: which legal
-- document + version was signed, a SHA-256 hash of the exact rendered markdown, the Order-Form
-- variable snapshot, the typed signatory details, and the rendered PDF (when the conversion
-- runtime was available). Pinning {document_id, document_version, content_hash} keeps the signed
-- agreement reproducible even after the templates version up. Written/read by the Java backend
-- via JPA. Additive and idempotent (IF NOT EXISTS) — safe on the shared dev branch.

CREATE TABLE IF NOT EXISTS stirling_pdf.procurement_agreement_signature (
    signature_id        BIGSERIAL    PRIMARY KEY,
    deal_id             BIGINT       NOT NULL REFERENCES stirling_pdf.procurement_deal(deal_id) ON DELETE CASCADE,
    quote_id            BIGINT       NOT NULL REFERENCES stirling_pdf.procurement_quote(quote_id) ON DELETE CASCADE,
    document_id         VARCHAR(64)  NOT NULL,
    document_version    VARCHAR(32)  NOT NULL,
    document_label      VARCHAR(64),
    content_hash        VARCHAR(64)  NOT NULL,
    variables_json      TEXT,
    customer_legal_name VARCHAR(255),
    signatory_name      VARCHAR(255) NOT NULL,
    signatory_title     VARCHAR(255),
    authority_confirmed BOOLEAN      NOT NULL DEFAULT FALSE,
    signer_ip           VARCHAR(64),
    pdf                 BYTEA,
    signed_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_procurement_signature_deal ON stirling_pdf.procurement_agreement_signature (deal_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_signature_quote ON stirling_pdf.procurement_agreement_signature (quote_id, signed_at DESC);
