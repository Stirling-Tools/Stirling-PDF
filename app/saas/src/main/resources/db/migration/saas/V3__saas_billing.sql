-- Stripe billing subscription mirror, populated by Supabase webhooks.

CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id                  VARCHAR(255) PRIMARY KEY,
    user_id             UUID         NOT NULL,
    team_id             BIGINT,
    status              VARCHAR(64)  NOT NULL,
    price_id            VARCHAR(255),
    current_period_end  TIMESTAMP,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_id ON billing_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_team_id ON billing_subscriptions (team_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status ON billing_subscriptions (status);
