-- Clickwrap consents to versioned legal documents (the EULA accepted at trial start and at quote
-- generation). Append-only; each row pins the document id + version consented to, so what was
-- agreed stays auditable after the document versions up. Distinct from a signed agreement, which is
-- recorded in procurement_agreement_signature. Written/read by the Java backend via JPA. Additive
-- and idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS stirling_pdf.legal_consent (
    consent_id       BIGSERIAL   PRIMARY KEY,
    team_id          BIGINT,
    user_id          BIGINT,
    document_id      VARCHAR(64) NOT NULL,
    document_version VARCHAR(32) NOT NULL,
    context          VARCHAR(32) NOT NULL,
    signer_ip        VARCHAR(64),
    consented_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_legal_consent_team ON stirling_pdf.legal_consent (team_id, consented_at DESC);
