-- Per-user processing-error tracker.

CREATE TABLE IF NOT EXISTS user_error_tracker (
    error_tracker_id        BIGSERIAL PRIMARY KEY,
    user_id                 BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    endpoint                VARCHAR(255),
    processing_error_count  INTEGER      NOT NULL DEFAULT 0,
    last_processing_error   TIMESTAMP,
    reset_after             TIMESTAMP,
    created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_error_tracker_user_id  ON user_error_tracker (user_id);
CREATE INDEX IF NOT EXISTS idx_user_error_tracker_endpoint ON user_error_tracker (endpoint);
