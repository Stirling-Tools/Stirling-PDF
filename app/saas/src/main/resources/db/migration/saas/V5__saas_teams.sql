-- Team memberships and email-based team invitations.

CREATE TABLE IF NOT EXISTS team_memberships (
    membership_id        BIGSERIAL PRIMARY KEY,
    team_id              BIGINT       NOT NULL REFERENCES teams(id)       ON DELETE CASCADE,
    user_id              BIGINT       NOT NULL REFERENCES users(user_id)  ON DELETE CASCADE,
    role                 VARCHAR(50)  NOT NULL DEFAULT 'MEMBER',
    invited_by_user_id   BIGINT       REFERENCES users(user_id) ON DELETE SET NULL,
    invited_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at          TIMESTAMP,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_team_memberships_team_user UNIQUE (team_id, user_id),
    CONSTRAINT chk_team_memberships_role     CHECK (role IN ('LEADER', 'MEMBER'))
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_team      ON team_memberships (team_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_user      ON team_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_team_role ON team_memberships (team_id, role);

CREATE TABLE IF NOT EXISTS team_invitations (
    invitation_id        BIGSERIAL PRIMARY KEY,
    team_id              BIGINT       NOT NULL REFERENCES teams(id)       ON DELETE CASCADE,
    inviter_user_id      BIGINT       NOT NULL REFERENCES users(user_id)  ON DELETE CASCADE,
    invitee_email        VARCHAR(255) NOT NULL,
    invitee_user_id      BIGINT       REFERENCES users(user_id) ON DELETE CASCADE,
    status               VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
    invitation_token     VARCHAR(255) UNIQUE NOT NULL,
    expires_at           TIMESTAMP    NOT NULL,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_team_invitations_status CHECK (
        status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED')
    )
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_team   ON team_invitations (team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email  ON team_invitations (invitee_email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token  ON team_invitations (invitation_token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations (status);
