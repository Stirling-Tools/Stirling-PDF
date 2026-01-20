-- Create user_server_certificates table for storing per-user signing certificates
CREATE TABLE IF NOT EXISTS user_server_certificates (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    keystore_data BYTEA NOT NULL,
    keystore_password VARCHAR(255) NOT NULL,
    certificate_type VARCHAR(50) NOT NULL,
    subject_dn VARCHAR(500),
    issuer_dn VARCHAR(500),
    valid_from TIMESTAMP,
    valid_to TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_cert_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_certs_user_id ON user_server_certificates(user_id);

-- Create index for checking certificate expiration
CREATE INDEX IF NOT EXISTS idx_user_certs_valid_to ON user_server_certificates(valid_to);
