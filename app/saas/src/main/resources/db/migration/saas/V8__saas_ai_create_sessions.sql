-- AI document-creation sessions for chat / outline-to-PDF flows.

CREATE TABLE IF NOT EXISTS ai_create_sessions (
    session_id           VARCHAR(64)  PRIMARY KEY,
    user_id              VARCHAR(255) NOT NULL,
    doc_type             VARCHAR(255),
    template_id          VARCHAR(255),
    template_tex         VARCHAR(255),
    preview_tex          VARCHAR(255),
    prompt_initial       TEXT,
    prompt_latest        TEXT,
    outline_text         TEXT,
    outline_filename     VARCHAR(255),
    outline_approved     BOOLEAN      NOT NULL DEFAULT FALSE,
    outline_constraints  TEXT,
    draft_sections       TEXT,
    polished_latex       TEXT,
    pdf_url              VARCHAR(2048),
    status               VARCHAR(32)  NOT NULL,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_create_sessions_user_id    ON ai_create_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_create_sessions_updated_at ON ai_create_sessions (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_create_sessions_user_pdf
    ON ai_create_sessions (user_id, updated_at DESC)
    WHERE pdf_url IS NOT NULL;
